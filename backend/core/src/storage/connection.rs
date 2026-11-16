use super::{now_ts, Storage};
use rusqlite::{Connection, OpenFlags, Result};
use std::path::Path;
use std::time::Duration;

pub(super) const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStatus {
    pub journal_mode: String,
    pub synchronous: i64,
    pub busy_timeout_ms: i64,
    pub query_only: bool,
    pub encrypted: bool,
    pub checked_at: i64,
}

pub(super) fn configure_file_connection(conn: &Connection) -> Result<()> {
    conn.busy_timeout(BUSY_TIMEOUT)?;
    // Read the returned value: execute_batch alone cannot prove WAL was accepted.
    let mode: String = conn.query_row("PRAGMA journal_mode=WAL", [], |row| row.get(0))?;
    if !mode.eq_ignore_ascii_case("wal") && !mode.eq_ignore_ascii_case("memory") {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
            Some(format!("WAL mode unavailable: journal_mode={mode}")),
        ));
    }
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    Ok(())
}

impl Storage {
    /// Opens an existing database without migration, creation or write capability.
    pub fn open_read_only(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let key = super::encryption::configured_key(path)?;
        Self::open_read_only_file(path, key.as_ref().map(|key| key.bytes()))
    }

    pub fn open_read_only_with_key(path: impl AsRef<Path>, key: &[u8; 32]) -> Result<Self> {
        Self::open_read_only_file(path.as_ref(), Some(key))
    }

    fn open_read_only_file(path: &Path, key: Option<&[u8; 32]>) -> Result<Self> {
        let access = super::encryption::access_lock(path, false)?;
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        if let Some(key) = key {
            super::encryption::apply_key(&conn, key)?;
        }
        conn.busy_timeout(BUSY_TIMEOUT)?;
        conn.pragma_update(None, "query_only", true)?;
        Ok(Self {
            conn,
            encrypted: key.is_some(),
            _access: Some(access),
        })
    }

    pub fn connection_status(&self) -> Result<StorageStatus> {
        Ok(StorageStatus {
            journal_mode: self
                .conn
                .pragma_query_value(None, "journal_mode", |r| r.get(0))?,
            synchronous: self
                .conn
                .pragma_query_value(None, "synchronous", |r| r.get(0))?,
            busy_timeout_ms: self
                .conn
                .pragma_query_value(None, "busy_timeout", |r| r.get(0))?,
            query_only: self
                .conn
                .pragma_query_value(None, "query_only", |r| r.get(0))?,
            encrypted: self.encrypted,
            checked_at: now_ts(),
        })
    }

    /// Explicit maintenance operation. Never called on every connection checkout.
    pub fn quick_check(&self) -> Result<Vec<String>> {
        let mut statement = self.conn.prepare("PRAGMA quick_check")?;
        let rows = statement.query_map([], |row| row.get(0))?;
        rows.collect()
    }

    pub fn passive_checkpoint(&self) -> Result<(i64, i64, i64)> {
        self.conn
            .query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    #[test]
    fn wal_readers_do_not_block_writers_and_read_only_connections_reject_writes() {
        let directory = std::env::temp_dir().join(format!(
            "boost-wal-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("load.db");
        {
            let db = Storage::open(&path).unwrap();
            db.conn
                .execute_batch("CREATE TABLE load (id INTEGER PRIMARY KEY, value INTEGER NOT NULL)")
                .unwrap();
            let status = db.connection_status().unwrap();
            assert_eq!(status.journal_mode, "wal");
            assert_eq!(status.busy_timeout_ms, 5000);
            let read = Storage::open_read_only(&path).unwrap();
            assert!(read.connection_status().unwrap().query_only);
            assert!(read
                .conn
                .execute("INSERT INTO load(value) VALUES (1)", [])
                .is_err());
            read.conn
                .execute_batch("BEGIN; SELECT * FROM load;")
                .unwrap();
            let barrier = Arc::new(Barrier::new(9));
            let workers: Vec<_> = (0..8)
                .map(|_| {
                    let path = path.clone();
                    let barrier = barrier.clone();
                    std::thread::spawn(move || {
                        let mut db = Storage::open(path).unwrap();
                        barrier.wait();
                        for _ in 0..100 {
                            let tx = db
                                .conn
                                .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
                                .unwrap();
                            tx.execute("INSERT INTO load(value) VALUES (1)", [])
                                .unwrap();
                            tx.commit().unwrap();
                        }
                    })
                })
                .collect();
            barrier.wait();
            for worker in workers {
                worker.join().unwrap();
            }
            // A long-lived snapshot is unchanged while all 800 writes complete.
            assert_eq!(
                read.conn
                    .query_row("SELECT COUNT(*) FROM load", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                0
            );
            read.conn.execute_batch("ROLLBACK").unwrap();
            assert_eq!(
                read.conn
                    .query_row("SELECT COUNT(*) FROM load", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                800
            );
            assert_eq!(db.quick_check().unwrap(), vec!["ok"]);
            assert_eq!(db.passive_checkpoint().unwrap().0, 0);
        }
        let resolved = directory.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(directory
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("boost-wal-"));
        std::fs::remove_dir_all(resolved).unwrap();
    }
}
