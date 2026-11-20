use boost_core::storage::{RequestLog, RequestTokenStat, Storage};
use crossbeam_channel::{bounded, Receiver, Sender};
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};

const BATCH_SIZE: usize = 32;
const MAX_BATCH_WAIT: Duration = Duration::from_micros(700);

struct Settlement {
    path: String,
    log: RequestLog,
    usage: RequestTokenStat,
}

struct Pending {
    row: Arc<Settlement>,
    committed: Sender<Option<i64>>,
}

fn queue() -> Option<&'static Sender<Pending>> {
    static WRITER: OnceLock<Option<Sender<Pending>>> = OnceLock::new();
    WRITER
        .get_or_init(|| {
            let (send, receive) = bounded(2048);
            std::thread::Builder::new()
                .name("request-settlement".into())
                .spawn(move || write_batches(receive))
                .ok()
                .map(|_| send)
        })
        .as_ref()
}

fn write_batches(receive: Receiver<Pending>) {
    while let Ok(first) = receive.recv() {
        let mut items = vec![first];
        let until = Instant::now() + MAX_BATCH_WAIT;
        while items.len() < BATCH_SIZE {
            match receive.recv_deadline(until) {
                Ok(item) => items.push(item),
                Err(_) => break,
            }
        }
        let mut groups = std::collections::HashMap::<_, Vec<_>>::new();
        for item in items {
            groups.entry(item.row.path.clone()).or_default().push(item);
        }
        for (path, group) in groups {
            let ids = crate::storage_helpers::try_open_settlement_storage(&path)
                .and_then(|storage| {
                    let rows: Vec<_> = group.iter().map(|item| (&item.row.log, &item.row.usage)).collect();
                    storage.insert_request_settlement_batch(&rows).ok()
                });
            for (index, item) in group.into_iter().enumerate() {
                let _ = item.committed.send(ids.as_ref().and_then(|ids| ids.get(index)).copied());
            }
        }
    }
}

/// Wait for the commit before releasing quota or charging a wallet. If a batch
/// rolls back, retry this row using the caller's original storage connection.
pub(super) fn persist(
    storage: &Storage,
    log: RequestLog,
    usage: RequestTokenStat,
) -> Result<(i64, Option<String>), String> {
    // Keep fixtures, single-connection deployments and rows without a stable
    // settlement identity on the direct transaction path.
    if let Some(path) = storage.request_settlement_database_path()
        .filter(|_| log.trace_id.as_ref().is_some_and(|id| !id.trim().is_empty()))
        .filter(|_| crate::storage_helpers::storage_max_connections() >= 8)
    {
        if let Some(queue) = queue() {
            let (committed, wait) = bounded(1);
            let row = Arc::new(Settlement { path: path.into(), log, usage });
            if queue.try_send(Pending { row: row.clone(), committed }).is_ok() {
                if let Ok(Some(id)) = wait.recv() {
                    return Ok((id, None));
                }
            }
            // The identity also deduplicates if the writer disconnected after commit.
            return direct(storage, &row.log, &row.usage);
        }
    }
    direct(storage, &log, &usage)
}

fn direct(storage: &Storage, log: &RequestLog, usage: &RequestTokenStat) -> Result<(i64, Option<String>), String> {
    storage.insert_request_log_with_token_stat(log, usage).map_err(|e| e.to_string())
}
