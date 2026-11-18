use super::rpc_policy::{classify, Resource, RpcClass};
use std::future::Future;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use std::task::{Context, Poll, Wake, Waker};
use std::time::{Duration, Instant};
use tokio::sync::{
    OwnedRwLockReadGuard, OwnedRwLockWriteGuard, OwnedSemaphorePermit, RwLock, Semaphore,
};

pub(super) const RPC_QUEUE_WAIT_TIMEOUT: Duration = Duration::from_secs(60);
const RPC_READ_WAIT_TIMEOUT: Duration = Duration::from_secs(2);
const RPC_CONCURRENCY: usize = 6;
const RPC_MAX_WAITING: usize = 256;
const RPC_READ_CONCURRENCY: usize = 32;
const RPC_READ_ADMISSION_LIMIT: usize = 96;
const RPC_RESOURCE_MAX_WAITING: usize = 32;

/// Shared by all users, connections and HTTP entrypoints in one service process.
pub(crate) struct RpcQueue {
    running: Arc<Semaphore>,
    admitted: Arc<Semaphore>,
    reads: Arc<Semaphore>,
    read_admitted: Arc<Semaphore>,
    read_active: Arc<AtomicUsize>,
    barrier: Arc<RwLock<()>>,
    resources: [(Arc<Semaphore>, Arc<Semaphore>); 7],
    write_concurrency: usize,
    write_capacity: usize,
    rejected: AtomicU64,
    timed_out: AtomicU64,
    admitted_total: AtomicU64,
    wait_microseconds: AtomicU64,
}

pub(super) struct RpcPermit {
    _read_active: Option<ActiveRead>,
    _running: OwnedSemaphorePermit,
    _admitted: Option<OwnedSemaphorePermit>,
    _resource: Option<OwnedSemaphorePermit>,
    _resource_admitted: Option<OwnedSemaphorePermit>,
    _shared: Option<OwnedRwLockReadGuard<()>>,
    _exclusive: Option<OwnedRwLockWriteGuard<()>>,
}

struct ActiveRead(Arc<AtomicUsize>);

impl Drop for ActiveRead {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Relaxed);
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum QueueError {
    Full,
    Timeout,
}

impl RpcQueue {
    fn new(concurrency: usize, max_waiting: usize) -> Self {
        Self {
            running: Arc::new(Semaphore::new(concurrency)),
            admitted: Arc::new(Semaphore::new(concurrency + max_waiting)),
            reads: Arc::new(Semaphore::new(RPC_READ_CONCURRENCY)),
            read_admitted: Arc::new(Semaphore::new(RPC_READ_ADMISSION_LIMIT)),
            read_active: Arc::new(AtomicUsize::new(0)),
            barrier: Arc::new(RwLock::new(())),
            resources: std::array::from_fn(|_| {
                (
                    Arc::new(Semaphore::new(1)),
                    Arc::new(Semaphore::new(
                        max_waiting.min(RPC_RESOURCE_MAX_WAITING) + 1,
                    )),
                )
            }),
            write_concurrency: concurrency,
            write_capacity: concurrency + max_waiting,
            rejected: AtomicU64::new(0),
            timed_out: AtomicU64::new(0),
            admitted_total: AtomicU64::new(0),
            wait_microseconds: AtomicU64::new(0),
        }
    }

    // Holding the admission permit also bounds futures waiting for execution.
    #[cfg(test)]
    async fn acquire_slot(&self) -> Result<RpcPermit, QueueError> {
        let admitted = self
            .admitted
            .clone()
            .try_acquire_owned()
            .map_err(|_| QueueError::Full)?;
        let running = self
            .running
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| QueueError::Full)?;
        Ok(RpcPermit {
            _read_active: None,
            _running: running,
            _admitted: Some(admitted),
            _resource: None,
            _resource_admitted: None,
            _shared: None,
            _exclusive: None,
        })
    }

    #[cfg(test)]
    pub(super) async fn acquire(&self) -> Result<RpcPermit, QueueError> {
        self.acquire_with_timeout(RPC_QUEUE_WAIT_TIMEOUT).await
    }

    #[cfg(test)]
    async fn acquire_with_timeout(&self, timeout: Duration) -> Result<RpcPermit, QueueError> {
        tokio::time::timeout(timeout, self.acquire_slot())
            .await
            .map_err(|_| QueueError::Timeout)?
    }

    async fn acquire_class(&self, class: RpcClass) -> Result<RpcPermit, QueueError> {
        if class == RpcClass::Read {
            // Admit only a bounded burst. Waiting for a read slot must not hold the
            // shared barrier, so queued readers cannot delay pending maintenance.
            let admitted = self
                .read_admitted
                .clone()
                .try_acquire_owned()
                .map_err(|_| QueueError::Full)?;
            let running = self
                .reads
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| QueueError::Full)?;
            let shared = self.barrier.clone().read_owned().await;
            self.read_active.fetch_add(1, Ordering::Relaxed);
            return Ok(RpcPermit {
                _read_active: Some(ActiveRead(self.read_active.clone())),
                _running: running,
                _admitted: Some(admitted),
                _resource: None,
                _resource_admitted: None,
                _shared: Some(shared),
                _exclusive: None,
            });
        }
        let resource = match class {
            RpcClass::Write(resource) => resource,
            _ => Resource::Maintenance,
        } as usize;
        let (serial, capacity) = &self.resources[resource];
        // Reserve both bounded capacities before waiting; one hot domain cannot fill the process.
        let resource_admitted = capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| QueueError::Full)?;
        let admitted = self
            .admitted
            .clone()
            .try_acquire_owned()
            .map_err(|_| QueueError::Full)?;
        let resource = serial
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| QueueError::Full)?;
        let (shared, exclusive) = if class == RpcClass::Exclusive {
            (None, Some(self.barrier.clone().write_owned().await))
        } else {
            (Some(self.barrier.clone().read_owned().await), None)
        };
        // Crucially, waiting for a domain never consumes a global execution slot.
        let running = self
            .running
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| QueueError::Full)?;
        Ok(RpcPermit {
            _read_active: None,
            _running: running,
            _admitted: Some(admitted),
            _resource: Some(resource),
            _resource_admitted: Some(resource_admitted),
            _shared: shared,
            _exclusive: exclusive,
        })
    }

    pub(super) async fn acquire_for(&self, method: &str) -> Result<RpcPermit, QueueError> {
        let started = Instant::now();
        let class = classify(method);
        let result = tokio::time::timeout(wait_timeout(class), self.acquire_class(class))
            .await
            .unwrap_or(Err(QueueError::Timeout));
        self.record_admission(started, &result);
        result
    }

    pub(super) fn acquire_blocking_for(&self, method: &str) -> Result<RpcPermit, QueueError> {
        let started = Instant::now();
        let class = classify(method);
        let result = self.block_on_slot(self.acquire_class(class), wait_timeout(class));
        self.record_admission(started, &result);
        result
    }

    fn record_admission(&self, started: Instant, result: &Result<RpcPermit, QueueError>) {
        match result {
            Ok(_) => {
                self.admitted_total.fetch_add(1, Ordering::Relaxed);
                self.wait_microseconds.fetch_add(
                    started.elapsed().as_micros().min(u64::MAX as u128) as u64,
                    Ordering::Relaxed,
                );
            }
            Err(QueueError::Full) => {
                self.rejected.fetch_add(1, Ordering::Relaxed);
            }
            Err(QueueError::Timeout) => {
                self.timed_out.fetch_add(1, Ordering::Relaxed);
            }
        }
    }

    pub(crate) fn snapshot(&self) -> RpcQueueSnapshot {
        let active_writes = self
            .write_concurrency
            .saturating_sub(self.running.available_permits());
        let admitted = self
            .write_capacity
            .saturating_sub(self.admitted.available_permits());
        let active_reads = self.read_active.load(Ordering::Relaxed);
        let read_admitted =
            RPC_READ_ADMISSION_LIMIT.saturating_sub(self.read_admitted.available_permits());
        RpcQueueSnapshot {
            active_writes,
            active_reads,
            waiting_reads: read_admitted.saturating_sub(active_reads),
            waiting_writes: admitted.saturating_sub(active_writes),
            write_concurrency: self.write_concurrency,
            read_concurrency: RPC_READ_CONCURRENCY,
            read_admission_limit: RPC_READ_ADMISSION_LIMIT,
            waiting_limit: self.write_capacity.saturating_sub(self.write_concurrency),
            per_resource_waiting_limit: RPC_RESOURCE_MAX_WAITING,
            rejected_total: self.rejected.load(Ordering::Relaxed),
            timed_out_total: self.timed_out.load(Ordering::Relaxed),
            admitted_total: self.admitted_total.load(Ordering::Relaxed),
            wait_microseconds_total: self.wait_microseconds.load(Ordering::Relaxed),
        }
    }

    /// The legacy tiny_http workers have no Tokio runtime. A thread waker lets
    /// them use the same fair semaphore as Axum, without a second queue/pool.
    fn block_on_slot(
        &self,
        future: impl Future<Output = Result<RpcPermit, QueueError>>,
        timeout: Duration,
    ) -> Result<RpcPermit, QueueError> {
        struct ThreadWaker(std::thread::Thread);
        impl Wake for ThreadWaker {
            fn wake(self: Arc<Self>) {
                self.0.unpark();
            }
            fn wake_by_ref(self: &Arc<Self>) {
                self.0.unpark();
            }
        }
        let waker = Waker::from(Arc::new(ThreadWaker(std::thread::current())));
        let mut context = Context::from_waker(&waker);
        let mut future = std::pin::pin!(future);
        let deadline = Instant::now() + timeout;
        loop {
            if let Poll::Ready(result) = future.as_mut().poll(&mut context) {
                return result;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(QueueError::Timeout);
            }
            std::thread::park_timeout(remaining);
        }
    }

    #[cfg(test)]
    fn acquire_blocking(&self) -> Result<RpcPermit, QueueError> {
        self.block_on_slot(self.acquire_slot(), RPC_QUEUE_WAIT_TIMEOUT)
    }
}

fn wait_timeout(class: RpcClass) -> Duration {
    if class == RpcClass::Read {
        RPC_READ_WAIT_TIMEOUT
    } else {
        RPC_QUEUE_WAIT_TIMEOUT
    }
}

pub(crate) fn global() -> &'static RpcQueue {
    static QUEUE: OnceLock<RpcQueue> = OnceLock::new();
    QUEUE.get_or_init(|| RpcQueue::new(RPC_CONCURRENCY, RPC_MAX_WAITING))
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RpcQueueSnapshot {
    pub active_writes: usize,
    pub active_reads: usize,
    pub waiting_reads: usize,
    pub waiting_writes: usize,
    pub write_concurrency: usize,
    pub read_concurrency: usize,
    pub read_admission_limit: usize,
    pub waiting_limit: usize,
    pub per_resource_waiting_limit: usize,
    pub rejected_total: u64,
    pub timed_out_total: u64,
    pub admitted_total: u64,
    pub wait_microseconds_total: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::FutureExt;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
    }

    #[test]
    fn clients_share_one_fifo_queue_and_cancelled_waiters_release_capacity() {
        let queue = RpcQueue::new(1, 2);
        let first = queue.acquire_blocking().unwrap();
        let mut second = Box::pin(queue.acquire_slot());
        let mut third = Box::pin(queue.acquire_slot());
        assert!(second.as_mut().now_or_never().is_none());
        assert!(third.as_mut().now_or_never().is_none());
        assert!(matches!(
            queue.acquire_slot().now_or_never(),
            Some(Err(QueueError::Full))
        ));
        drop(first);
        assert!(
            third.as_mut().now_or_never().is_none(),
            "later users cannot jump the queue"
        );
        let second = second.as_mut().now_or_never().unwrap().unwrap();
        drop(third);
        assert_eq!(queue.admitted.available_permits(), 2);
        drop(second);
        assert_eq!(queue.running.available_permits(), 1);
        assert_eq!(queue.admitted.available_permits(), 3);
    }

    #[test]
    fn async_and_legacy_clients_share_the_same_limit() {
        let queue = Arc::new(RpcQueue::new(2, 8));
        let first = queue.acquire_blocking().unwrap();
        runtime().block_on(async {
            let second = queue.acquire().await.unwrap();
            assert_eq!(queue.running.available_permits(), 0);
            let mut waiting = Box::pin(queue.acquire());
            assert!(waiting.as_mut().now_or_never().is_none());
            drop(first);
            let third = waiting.await.unwrap();
            assert_eq!(queue.running.available_permits(), 0);
            drop(second);
            drop(third);
        });
        assert_eq!(queue.running.available_permits(), 2);
    }

    #[test]
    fn panic_releases_the_slot_for_the_next_user() {
        let queue = RpcQueue::new(1, 1);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _permit = queue.acquire_blocking().unwrap();
            panic!("simulated RPC panic");
        }));
        assert!(result.is_err());
        assert!(queue.acquire_blocking().is_ok());
    }

    #[test]
    fn queue_timeout_removes_the_request_without_executing_it() {
        let queue = RpcQueue::new(1, 1);
        let first = queue.acquire_blocking().unwrap();
        runtime().block_on(async {
            let result = queue.acquire_with_timeout(Duration::from_millis(1)).await;
            assert!(matches!(result, Err(QueueError::Timeout)));
        });
        assert_eq!(queue.admitted.available_permits(), 1);
        drop(first);
        assert!(queue.acquire_blocking().is_ok());
    }

    #[test]
    fn legacy_client_waits_for_an_async_clients_slot() {
        let queue = Arc::new(RpcQueue::new(1, 1));
        let permit = runtime().block_on(queue.acquire()).unwrap();
        let other = queue.clone();
        let worker = std::thread::spawn(move || other.acquire_blocking().is_ok());
        drop(permit);
        assert!(worker.join().unwrap());
    }

    #[test]
    fn the_service_queue_is_process_global() {
        assert!(std::ptr::eq(global(), global()));
    }

    #[test]
    fn hot_resource_is_bounded_without_occupying_other_execution_slots() {
        runtime().block_on(async {
            let queue = RpcQueue::new(6, 256);
            let first = queue.acquire_for("account/import").await.unwrap();
            let mut waiting = Vec::new();
            for _ in 0..RPC_RESOURCE_MAX_WAITING {
                let mut future = Box::pin(queue.acquire_for("account/import"));
                assert!(future.as_mut().now_or_never().is_none());
                waiting.push(future);
            }
            assert!(matches!(
                queue.acquire_for("account/import").await,
                Err(QueueError::Full)
            ));
            assert_eq!(queue.running.available_permits(), 5);
            let key = queue.acquire_for("apikey/create").await.unwrap();
            let read = queue.acquire_for("account/list").await.unwrap();
            assert_eq!(queue.running.available_permits(), 4);
            drop(waiting);
            drop((first, key, read));
            assert_eq!(queue.admitted.available_permits(), 262);
            assert_eq!(queue.resources[0].1.available_permits(), 33);
        });
    }

    #[test]
    fn same_resource_stays_fifo_and_cancellation_releases_capacity() {
        runtime().block_on(async {
            let queue = RpcQueue::new(6, 256);
            let first = queue.acquire_for("account/import").await.unwrap();
            let mut second = Box::pin(queue.acquire_for("account/import"));
            let mut third = Box::pin(queue.acquire_for("account/warmup"));
            assert!(second.as_mut().now_or_never().is_none());
            assert!(third.as_mut().now_or_never().is_none());
            drop(first);
            assert!(third.as_mut().now_or_never().is_none());
            let second = second.await.unwrap();
            drop(third);
            assert_eq!(queue.resources[0].1.available_permits(), 32);
            drop(second);
            assert_eq!(queue.resources[0].1.available_permits(), 33);
        });
    }

    #[test]
    fn read_burst_waits_independently_and_rejects_only_at_admission_limit() {
        runtime().block_on(async {
            let queue = RpcQueue::new(1, 1);
            let writer = queue.acquire_for("account/import").await.unwrap();
            let mut reads = Vec::new();
            for _ in 0..RPC_READ_CONCURRENCY {
                reads.push(queue.acquire_for("account/list").await.unwrap());
            }
            let mut waiting = Vec::new();
            for _ in RPC_READ_CONCURRENCY..RPC_READ_ADMISSION_LIMIT {
                let mut read = Box::pin(queue.acquire_for("account/list"));
                assert!(read.as_mut().now_or_never().is_none());
                waiting.push(read);
            }
            assert_eq!(queue.snapshot().active_reads, RPC_READ_CONCURRENCY);
            assert_eq!(queue.snapshot().waiting_reads, waiting.len());
            assert!(matches!(
                queue.acquire_for("account/list").await,
                Err(QueueError::Full)
            ));
            let first_waiter = waiting.remove(0);
            drop(reads.pop());
            let read = first_waiter.await.unwrap();
            drop((waiting, reads, read, writer));
            assert_eq!(
                queue.read_admitted.available_permits(),
                RPC_READ_ADMISSION_LIMIT
            );
        });
    }

    #[test]
    fn cross_domain_barrier_waits_for_reads_and_blocks_new_work() {
        runtime().block_on(async {
            let queue = RpcQueue::new(6, 256);
            let read = queue.acquire_for("account/list").await.unwrap();
            let mut maintenance = Box::pin(queue.acquire_for("account/delete"));
            assert!(maintenance.as_mut().now_or_never().is_none());
            let mut next_read = Box::pin(queue.acquire_for("account/list"));
            assert!(next_read.as_mut().now_or_never().is_none());
            let mut key = Box::pin(queue.acquire_for("apikey/create"));
            assert!(key.as_mut().now_or_never().is_none());
            assert_eq!(queue.running.available_permits(), 6);
            drop(read);
            let maintenance = maintenance.await.unwrap();
            assert!(next_read.as_mut().now_or_never().is_none());
            assert_eq!(queue.snapshot().active_reads, 0);
            assert!(key.as_mut().now_or_never().is_none());
            drop(maintenance);
            assert!(next_read.await.is_ok());
            assert!(key.await.is_ok());
        });
    }

    #[test]
    fn read_timeout_while_maintenance_runs_releases_both_permits() {
        runtime().block_on(async {
            let queue = RpcQueue::new(1, 1);
            let maintenance = queue.acquire_for("account/delete").await.unwrap();
            let result = tokio::time::timeout(
                Duration::from_millis(1),
                queue.acquire_class(RpcClass::Read),
            )
            .await;
            assert!(result.is_err());
            assert_eq!(
                queue.read_admitted.available_permits(),
                RPC_READ_ADMISSION_LIMIT
            );
            assert_eq!(queue.reads.available_permits(), RPC_READ_CONCURRENCY);
            drop(maintenance);
            assert!(queue.acquire_for("account/list").await.is_ok());
        });
    }

    #[test]
    fn timeout_cancels_domain_wait_without_executing_or_leaking_permits() {
        runtime().block_on(async {
            let queue = RpcQueue::new(6, 256);
            let first = queue.acquire_for("account/import").await.unwrap();
            assert!(tokio::time::timeout(
                Duration::from_millis(1),
                queue.acquire_for("account/import")
            )
            .await
            .is_err());
            assert_eq!(queue.resources[0].1.available_permits(), 32);
            drop(first);
            assert!(queue.acquire_for("account/import").await.is_ok());
            assert_eq!(queue.resources[0].1.available_permits(), 33);
        });
    }

    #[test]
    fn sync_and_async_entries_share_resource_ordering() {
        let queue = Arc::new(RpcQueue::new(6, 256));
        let first = runtime()
            .block_on(queue.acquire_for("account/import"))
            .unwrap();
        let other = queue.clone();
        let worker =
            std::thread::spawn(move || other.acquire_blocking_for("account/warmup").is_ok());
        drop(first);
        assert!(worker.join().unwrap());
        assert_eq!(queue.running.available_permits(), 6);
    }
}
