//! SQLCipher keys never enter SQLite settings, command responses or logs.
use fs2::FileExt;
use rand::RngCore;
use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use zeroize::Zeroizing;

pub(super) struct Secret(Zeroizing<[u8; 32]>);
impl Secret {
    pub(super) fn bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Metadata {
    format_version: u32,
    provider: String,
    credential_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityStatus {
    pub encrypted: bool,
    pub provider: &'static str,
    pub encryption_requested: bool,
    pub requires_restart: bool,
    pub sqlcipher_available: bool,
    pub bot_encryption_policy: &'static str,
    pub integrity: String,
}

fn failure(message: impl Into<String>) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
        Some(message.into()),
    )
}
fn io_error(error: std::io::Error) -> rusqlite::Error {
    failure(error.to_string())
}
pub(super) fn append(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}
fn metadata(path: &Path) -> Result<Option<Metadata>> {
    let file = append(path, ".security.json");
    let bytes = match fs::read(file) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(io_error(e)),
    };
    if bytes.len() > 4096 {
        return Err(failure("invalid database security metadata"));
    }
    let value: Metadata = serde_json::from_slice(&bytes)
        .map_err(|_| failure("invalid database security metadata"))?;
    if value.format_version != 1
        || value.provider != "keyring"
        || value.credential_id.len() != 32
        || !value.credential_id.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(failure("unsupported database security metadata"));
    }
    Ok(Some(value))
}
pub(super) fn plain_file(path: &Path) -> Result<bool> {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(io_error(e)),
    };
    let mut header = [0u8; 16];
    match file.read_exact(&mut header) {
        Ok(()) => Ok(&header == b"SQLite format 3\0"),
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => Ok(false),
        Err(e) => Err(io_error(e)),
    }
}
fn configured_file() -> Option<PathBuf> {
    let value = std::env::var_os("BOOST_DB_KEY_FILE").filter(|v| !v.is_empty())?;
    let path = PathBuf::from(value);
    Some(if path.is_absolute() {
        path
    } else {
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
            .unwrap_or_default()
            .join(path)
    })
}
fn parse_key(value: &[u8]) -> Result<Secret> {
    let mut key = Zeroizing::new([0u8; 32]);
    if value.len() == 32 {
        key.copy_from_slice(value);
        return Ok(Secret(key));
    }
    let hex = std::str::from_utf8(value)
        .map_err(|_| failure("database key must be 32 bytes or 64 hexadecimal digits"))?
        .trim();
    if hex.len() != 64 {
        return Err(failure(
            "database key must be 32 bytes or 64 hexadecimal digits",
        ));
    }
    for (i, pair) in hex.as_bytes().chunks_exact(2).enumerate() {
        let digit = |b: u8| {
            (b as char)
                .to_digit(16)
                .ok_or_else(|| failure("invalid database key encoding"))
        };
        key[i] = ((digit(pair[0])? << 4) | digit(pair[1])?) as u8;
    }
    Ok(Secret(key))
}
fn read_key_file(path: &Path) -> Result<Secret> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::metadata(path).map_err(io_error)?.permissions().mode() & 0o077 != 0 {
            return Err(failure("database key file must be private (chmod 600)"));
        }
    }
    let mut value = Zeroizing::new(Vec::new());
    File::open(path)
        .map_err(io_error)?
        .take(129)
        .read_to_end(&mut value)
        .map_err(io_error)?;
    parse_key(&value)
}

pub(super) fn configured_key(path: &Path) -> Result<Option<Arc<Secret>>> {
    static KEYS: OnceLock<Mutex<HashMap<PathBuf, Option<Arc<Secret>>>>> = OnceLock::new();
    let name = path
        .file_name()
        .ok_or_else(|| failure("database path has no file name"))?;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let identity = parent.canonicalize().map_err(io_error)?.join(name);
    let mut keys = KEYS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(key) = keys.get(&identity) {
        return Ok(key.clone());
    }
    let key = if let Some(key_file) = configured_file() {
        Some(Arc::new(read_key_file(&key_file)?))
    } else {
        let mode = std::env::var("BOOST_DB_ENCRYPTION").unwrap_or_default();
        if !["", "off", "keyring"].contains(&mode.trim()) {
            return Err(failure("BOOST_DB_ENCRYPTION must be off or keyring"));
        }
        if mode.trim() == "keyring" && metadata(path)?.is_none() {
            request_keyring_encryption(path)?;
        }
        match metadata(path)? {
            Some(meta) => {
                if mode.trim() == "off" {
                    return Err(failure(
                        "encrypted database cannot be opened with encryption disabled",
                    ));
                }
                let entry = keyring::Entry::new("Boost.SQLite", &meta.credential_id)
                    .map_err(|_| failure("system credential provider unavailable"))?;
                let value = Zeroizing::new(entry.get_secret().map_err(|_| failure("database key missing or credential provider unavailable; restore the original credential"))?);
                Some(Arc::new(parse_key(&value)?))
            }
            None => None,
        }
    };
    keys.insert(identity, key.clone());
    Ok(key)
}

/// Records a restart-only request. It does not migrate an active database or generate a replacement for a lost key.
pub fn request_keyring_encryption(path: &Path) -> Result<()> {
    if !cfg!(feature = "sqlcipher") {
        return Err(failure("this build does not support SQLCipher"));
    }
    let coordination = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(append(path, ".credential.lock"))
        .map_err(io_error)?;
    let started = Instant::now();
    loop {
        match FileExt::try_lock_exclusive(&coordination) {
            Ok(()) => break,
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    && started.elapsed() < Duration::from_secs(5) =>
            {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(_) => return Err(failure("database credential setup is already in progress")),
        }
    }
    if metadata(path)?.is_some() {
        return Ok(());
    }
    if configured_file().is_some() {
        return Err(failure(
            "database already uses an explicit key-file provider",
        ));
    }
    if path.exists() && fs::metadata(path).map_err(io_error)?.len() > 0 && !plain_file(path)? {
        return Err(failure(
            "encrypted database metadata is missing; refusing to replace its key",
        ));
    }
    let mut random = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let id = random
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let mut key = Zeroizing::new([0u8; 32]);
    rand::rngs::OsRng.fill_bytes(key.as_mut());
    let entry = keyring::Entry::new("Boost.SQLite", &id)
        .map_err(|_| failure("system credential provider unavailable"))?;
    entry
        .set_secret(key.as_ref())
        .map_err(|_| failure("cannot save the database key in the system credential provider"))?;
    let meta = Metadata {
        format_version: 1,
        provider: "keyring".into(),
        credential_id: id,
    };
    let destination = append(path, ".security.json");
    let staging = append(path, &format!(".security-{}.tmp", rand::random::<u64>()));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&staging)
            .map_err(io_error)?;
        serde_json::to_writer(&mut file, &meta)
            .map_err(|_| failure("cannot write database security metadata"))?;
        file.write_all(b"\n").map_err(io_error)?;
        file.sync_all().map_err(io_error)?;
        drop(file);
        fs::rename(&staging, &destination).map_err(io_error)
    })();
    if result.is_err() {
        let _ = fs::remove_file(staging);
        let _ = entry.delete_credential();
    }
    result
}

pub fn security_status(path: &Path) -> Result<SecurityStatus> {
    let key_file = configured_file().is_some();
    let requested = key_file || metadata(path)?.is_some();
    let encrypted = if path.exists()
        && fs::metadata(path).map_err(io_error)?.len() > 16
        && !plain_file(path)?
    {
        let key = configured_key(path)?.ok_or_else(|| {
            failure("database is encrypted or damaged and no key provider is configured")
        })?;
        let connection =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        apply_key(&connection, key.bytes())?;
        true
    } else {
        false
    };
    static CHECKS: OnceLock<Mutex<HashMap<PathBuf, (Instant, String)>>> = OnceLock::new();
    let integrity = {
        let mut checks = CHECKS
            .get_or_init(|| Mutex::new(HashMap::new()))
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((at, value)) = checks
            .get(path)
            .filter(|(at, _)| at.elapsed() < Duration::from_secs(60))
        {
            let _ = at;
            value.clone()
        } else if path.exists() {
            let connection =
                Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
            connection.busy_timeout(super::connection::BUSY_TIMEOUT)?;
            if encrypted {
                apply_key(
                    &connection,
                    configured_key(path)?
                        .ok_or_else(|| failure("key unavailable"))?
                        .bytes(),
                )?;
            }
            let value: String = connection.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
            checks.insert(path.to_path_buf(), (Instant::now(), value.clone()));
            value
        } else {
            "not_initialized".to_string()
        }
    };
    Ok(SecurityStatus {
        encrypted,
        provider: if key_file {
            "key_file"
        } else if requested {
            "keyring"
        } else {
            "none"
        },
        encryption_requested: requested,
        requires_restart: requested && !encrypted,
        sqlcipher_available: cfg!(feature = "sqlcipher"),
        bot_encryption_policy: if encrypted {
            "derived_key_on_host_start"
        } else {
            "plain_until_main_encrypted"
        },
        integrity,
    })
}

/// Domain-separated per-actor key; sent only through the owned child's private bootstrap pipe.
pub fn derive_bot_database_key(
    path: &Path,
    actor_scope: &str,
) -> Result<Option<Zeroizing<[u8; 32]>>> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    let Some(key) = configured_key(path)? else {
        return Ok(None);
    };
    let mut mac = Hmac::<Sha256>::new_from_slice(key.bytes())
        .map_err(|_| failure("cannot derive Bot storage key"))?;
    mac.update(b"Boost.Bot.SQLite.v1\0");
    mac.update(actor_scope.as_bytes());
    let mut result = Zeroizing::new([0u8; 32]);
    result.copy_from_slice(&mac.finalize().into_bytes());
    Ok(Some(result))
}

pub(super) fn access_lock(path: &Path, exclusive: bool) -> Result<File> {
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(append(path, ".access.lock"))
        .map_err(io_error)?;
    let started = Instant::now();
    loop {
        let result = if exclusive {
            FileExt::try_lock_exclusive(&lock)
        } else {
            FileExt::try_lock_shared(&lock)
        };
        match result {
            Ok(()) => return Ok(lock),
            Err(e)
                if e.kind() == std::io::ErrorKind::WouldBlock
                    && started.elapsed() < Duration::from_secs(5) =>
            {
                std::thread::sleep(Duration::from_millis(10))
            }
            Err(_) => {
                return Err(failure(
                    "database is in use by another process or maintenance operation",
                ))
            }
        }
    }
}

pub(super) fn apply_key(conn: &Connection, key: &[u8; 32]) -> Result<()> {
    if !cfg!(feature = "sqlcipher") {
        return Err(failure("this build does not support SQLCipher"));
    }
    let raw = Zeroizing::new(format!(
        "x'{}'",
        key.iter().map(|b| format!("{b:02x}")).collect::<String>()
    ));
    conn.pragma_update(None, "key", raw.as_str())?;
    // PRAGMA key itself accepts wrong keys. Force authenticated page decoding before WAL or migrations.
    conn.query_row("SELECT COUNT(*) FROM sqlite_master", [], |row| {
        row.get::<_, i64>(0)
    })
    .map_err(|_| {
        failure("database decryption failed; verify the original key and database integrity")
    })?;
    Ok(())
}

pub(super) fn migrate_plaintext(path: &Path, key: &[u8; 32]) -> Result<()> {
    if !plain_file(path)? {
        return Ok(());
    }
    if fs::symlink_metadata(path)
        .map_err(io_error)?
        .file_type()
        .is_symlink()
    {
        return Err(failure(
            "refusing to replace a symlink during encryption migration",
        ));
    }
    let staging = append(path, &format!(".cipher-{}.tmp", rand::random::<u64>()));
    let result = migrate_to_staging(path, &staging, key).and_then(|()| {
        OpenOptions::new()
            .read(true)
            .write(true)
            .open(&staging)
            .map_err(io_error)?
            .sync_all()
            .map_err(io_error)?;
        fs::rename(&staging, path).map_err(io_error)
    });
    if result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    result
}

fn migrate_to_staging(source: &Path, staging: &Path, key: &[u8; 32]) -> Result<()> {
    let conn = Connection::open(source)?;
    conn.busy_timeout(super::connection::BUSY_TIMEOUT)?;
    let checkpoint: (i64, i64, i64) =
        conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })?;
    if checkpoint.0 != 0 {
        return Err(failure(
            "database readers must close before encryption migration",
        ));
    }
    conn.execute_batch("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;")?;
    let raw = Zeroizing::new(format!(
        "x'{}'",
        key.iter().map(|b| format!("{b:02x}")).collect::<String>()
    ));
    let filename = staging
        .to_str()
        .ok_or_else(|| failure("database migration path is not UTF-8"))?;
    conn.execute(
        "ATTACH DATABASE ?1 AS encrypted KEY ?2",
        (filename, raw.as_str()),
    )?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(staging, fs::Permissions::from_mode(0o600)).map_err(io_error)?;
    }
    conn.query_row("SELECT sqlcipher_export('encrypted')", [], |_| Ok(()))?;
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    conn.pragma_update(
        Some(rusqlite::DatabaseName::Attached("encrypted")),
        "user_version",
        version,
    )?;
    conn.execute_batch("COMMIT; DETACH DATABASE encrypted;")?;
    let target = Connection::open(staging)?;
    apply_key(&target, key)?;
    let check: String = target.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
    if check != "ok" {
        return Err(failure("encrypted database failed integrity validation"));
    }
    let mut tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")?;
    let names = tables
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>>>()?;
    for name in names {
        let sql = format!("SELECT COUNT(*) FROM \"{}\"", name.replace('"', "\"\""));
        let before: i64 = conn.query_row(&sql, [], |r| r.get(0))?;
        let after: i64 = target.query_row(&sql, [], |r| r.get(0))?;
        if before != after {
            return Err(failure("encrypted database row counts differ"));
        }
    }
    drop(tables);
    drop(target);
    drop(conn);
    Ok(())
}

#[cfg(all(test, feature = "sqlcipher"))]
mod tests {
    use super::*;
    use crate::storage::Storage;

    fn fixture() -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "boost-cipher-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir_all(&directory).unwrap();
        directory
    }
    fn cleanup(directory: PathBuf) {
        let resolved = directory.canonicalize().unwrap();
        assert!(resolved.starts_with(std::env::temp_dir().canonicalize().unwrap()));
        assert!(directory
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("boost-cipher-"));
        fs::remove_dir_all(resolved).unwrap();
    }

    #[test]
    fn encrypted_roundtrip_rejects_wrong_key_without_modifying_the_database() {
        let directory = fixture();
        let path = directory.join("encrypted.db");
        let key = [0x31; 32];
        {
            let db = Storage::open_with_key(&path, &key).unwrap();
            db.conn.execute_batch("CREATE TABLE secrets(value TEXT); INSERT INTO secrets VALUES ('cipher-fixture-secret');").unwrap();
            assert!(db.connection_status().unwrap().encrypted);
            assert_eq!(db.quick_check().unwrap(), vec!["ok"]);
        }
        let before = fs::read(&path).unwrap();
        assert_ne!(&before[..16], b"SQLite format 3\0");
        assert!(!before
            .windows(b"cipher-fixture-secret".len())
            .any(|v| v == b"cipher-fixture-secret"));
        assert!(Storage::open_with_key(&path, &[0x32; 32]).is_err());
        assert_eq!(fs::read(&path).unwrap(), before);
        assert!(Connection::open(&path)
            .unwrap()
            .query_row("SELECT COUNT(*) FROM secrets", [], |r| r.get::<_, i64>(0))
            .is_err());
        {
            let db = Storage::open_read_only_with_key(&path, &key).unwrap();
            assert_eq!(
                db.conn
                    .query_row("SELECT value FROM secrets", [], |r| r.get::<_, String>(0))
                    .unwrap(),
                "cipher-fixture-secret"
            );
            assert!(db.conn.execute("DELETE FROM secrets", []).is_err());
        }
        cleanup(directory);
    }

    #[test]
    fn legacy_plaintext_is_exported_and_verified_without_a_backup_copy() {
        let directory = fixture();
        let path = directory.join("legacy.db");
        {
            let plain = Connection::open(&path).unwrap();
            plain
                .execute_batch(
                    "PRAGMA journal_mode=WAL; PRAGMA user_version=7;
                CREATE TABLE legacy(id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO legacy(value) VALUES ('first'), ('second');",
                )
                .unwrap();
        }
        assert!(plain_file(&path).unwrap());
        {
            let db = Storage::open_with_key(&path, &[0x45; 32]).unwrap();
            assert_eq!(
                db.conn
                    .query_row("SELECT COUNT(*) FROM legacy", [], |r| r.get::<_, i64>(0))
                    .unwrap(),
                2
            );
            assert_eq!(
                db.conn
                    .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                    .unwrap(),
                7
            );
        }
        assert!(!plain_file(&path).unwrap());
        assert!(!append(&path, ".bak").exists());
        assert!(fs::read_dir(&directory).unwrap().all(|entry| !entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".cipher-")));
        cleanup(directory);
    }

    #[test]
    fn corrupt_plaintext_is_not_replaced_or_reinitialized() {
        let directory = fixture();
        let path = directory.join("corrupt.db");
        let mut original = b"SQLite format 3\0".to_vec();
        original.extend_from_slice(&[0x55; 496]);
        fs::write(&path, &original).unwrap();
        assert!(Storage::open_with_key(&path, &[0x11; 32]).is_err());
        assert_eq!(fs::read(&path).unwrap(), original);
        cleanup(directory);
    }

    #[test]
    #[cfg(windows)]
    fn system_credential_roundtrip_keeps_key_out_of_metadata() {
        let directory = fixture();
        let path = directory.join("credential.db");
        request_keyring_encryption(&path).unwrap();
        let meta = metadata(&path).unwrap().unwrap();
        let entry = keyring::Entry::new("Boost.SQLite", &meta.credential_id).unwrap();
        let result = (|| -> Result<()> {
            let secret = Zeroizing::new(
                entry
                    .get_secret()
                    .map_err(|_| failure("test key unavailable"))?,
            );
            let stored = fs::read(append(&path, ".security.json")).map_err(io_error)?;
            assert!(!stored
                .windows(secret.len())
                .any(|bytes| bytes == secret.as_slice()));
            let key = configured_key(&path)?.unwrap();
            assert_eq!(key.bytes().as_slice(), secret.as_slice());
            let db = Storage::open(&path)?;
            db.conn.execute_batch(
                "CREATE TABLE protected(value TEXT); INSERT INTO protected VALUES ('test');",
            )?;
            assert!(db.connection_status()?.encrypted);
            Ok(())
        })();
        entry.delete_credential().unwrap();
        cleanup(directory);
        result.unwrap();
    }
}
