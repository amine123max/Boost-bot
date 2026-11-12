//! Desktop-owned files live below the user's .boost directory.
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::{backup::Backup, Connection, OpenFlags};
use tauri::Manager;

#[derive(Clone, Debug)]
pub(crate) struct DesktopStorage {
    pub root: PathBuf,
}

impl DesktopStorage {
    pub fn for_home(home: &Path, identifier: &str) -> Self {
        let root = home.join(".boost");
        Self {
            root: if identifier == "com.boost.desktop" {
                root
            } else {
                root.join("profiles").join(identifier)
            },
        }
    }

    pub fn resolve(identifier: &str) -> io::Result<Self> {
        let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
        let home = std::env::var_os(variable)
            .filter(|path| !path.is_empty())
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(dirs::home_dir)
            .ok_or_else(|| io::Error::other("User home directory not found"))?;
        Ok(Self::for_home(&home, identifier))
    }

    pub fn data(&self) -> PathBuf {
        self.root.join("data")
    }

    pub fn cache(&self) -> PathBuf {
        self.root.join("cache")
    }

    pub fn webview(&self) -> PathBuf {
        self.cache().join("webview")
    }

    pub fn logs(&self) -> PathBuf {
        self.root.join("logs")
    }

    pub fn runtime(&self) -> PathBuf {
        self.root.join("runtime")
    }

    pub fn updates(&self) -> PathBuf {
        self.root.join("updates")
    }

    pub fn prepare(&self, app: &tauri::AppHandle) -> io::Result<()> {
        let legacy_data = app.path().app_data_dir().map_err(io::Error::other)?;
        let legacy_cache = app.path().app_cache_dir().map_err(io::Error::other)?;
        let legacy_logs = app.path().app_log_dir().map_err(io::Error::other)?;
        let import_data = std::env::var_os("BOOST_DB_PATH")
            .is_none_or(|value| value.to_string_lossy().trim().is_empty());
        self.migrate(&legacy_data, &legacy_cache, &legacy_logs, import_data)?;
        for path in [
            self.data(),
            self.cache(),
            self.logs(),
            self.runtime(),
            self.updates(),
        ] {
            fs::create_dir_all(path)?;
        }
        Ok(())
    }

    fn migrate(&self, data: &Path, cache: &Path, logs: &Path, import_data: bool) -> io::Result<()> {
        let marker = self.data().join(".legacy-migration-v1");
        if marker.exists() {
            return Ok(());
        }
        fs::create_dir_all(self.data())?;
        // Do not initialize the old database: initialization can compact historical usage.
        if import_data {
            copy_database_if_missing(&data.join("boost.db"), &self.data().join("boost.db"))?;
            for name in ["boost.rpc-token", "installation_id"] {
                copy_file_if_missing(&data.join(name), &self.data().join(name))?;
            }
            for name in ["bots", "proxy-core"] {
                copy_tree_if_missing(&data.join(name), &self.data().join(name))?;
            }
        }
        move_directory_if_missing(logs, &self.logs())?;
        for name in ["gateway-trace.log", "gateway-error.txt"] {
            copy_file_if_missing(&data.join(name), &self.logs().join(name))?;
        }
        move_directory_if_missing(&data.join("updates"), &self.updates())?;
        move_directory_if_missing(
            &cache.join("bot-runtime"),
            &self.runtime().join("bot-runtime"),
        )?;
        // WebView2 owns the entire profile, including localStorage and cookies.
        #[cfg(windows)]
        move_directory_if_missing(&cache.join("EBWebView"), &self.webview())?;
        if import_data {
            fs::write(marker, b"1\n")?;
        }
        Ok(())
    }
}

pub(crate) fn storage(app: &tauri::AppHandle) -> tauri::State<'_, DesktopStorage> {
    app.state::<DesktopStorage>()
}

fn copy_file_if_missing(source: &Path, target: &Path) -> io::Result<()> {
    if source.is_file() && !target.exists() {
        fs::create_dir_all(target.parent().unwrap())?;
        // create_new prevents an existing destination from being truncated.
        let mut original = fs::File::open(source)?;
        let mut destination = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(target)?;
        let copied = io::copy(&mut original, &mut destination).and_then(|_| destination.sync_all());
        drop(destination);
        if let Err(error) = copied {
            let _ = fs::remove_file(target);
            return Err(error);
        }
    }
    Ok(())
}

fn copy_database_if_missing(source: &Path, target: &Path) -> io::Result<()> {
    if !source.is_file() || target.exists() {
        return Ok(());
    }
    fs::create_dir_all(target.parent().unwrap())?;
    let temporary = target.with_extension(format!("migrating-{}", std::process::id()));
    let result = (|| {
        let source = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(io::Error::other)?;
        let mut destination = Connection::open(&temporary).map_err(io::Error::other)?;
        {
            let migration = Backup::new(&source, &mut destination).map_err(io::Error::other)?;
            migration
                .run_to_completion(64, std::time::Duration::from_millis(10), None)
                .map_err(io::Error::other)?;
        }
        let integrity: String = destination
            .query_row("PRAGMA quick_check", [], |row| row.get(0))
            .map_err(io::Error::other)?;
        if integrity != "ok" {
            return Err(io::Error::other(
                "Migrated database failed its integrity check",
            ));
        }
        drop(destination);
        if !target.exists() {
            fs::rename(&temporary, target)?;
        }
        Ok(())
    })();
    if temporary.exists() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn copy_tree_if_missing(source: &Path, target: &Path) -> io::Result<()> {
    if !source.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = target.join(entry.file_name());
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            copy_tree_if_missing(&entry.path(), &target)?;
        } else {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.ends_with("-wal") || name.ends_with("-shm") {
                continue;
            }
            if entry.path().extension().is_some_and(|ext| ext == "db") {
                copy_database_if_missing(&entry.path(), &target)?;
            } else {
                copy_file_if_missing(&entry.path(), &target)?;
            }
        }
    }
    Ok(())
}

fn move_directory_if_missing(source: &Path, target: &Path) -> io::Result<()> {
    if source.is_dir() && !target.exists() {
        fs::create_dir_all(target.parent().unwrap())?;
        fs::rename(source, target).map_err(|error| {
            io::Error::new(
                error.kind(),
                format!(
                    "Cannot migrate {} to {}. Close other Boost processes and retry: {error}",
                    source.display(),
                    target.display()
                ),
            )
        })?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "boost-layout-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let parent = std::env::temp_dir().canonicalize().unwrap();
            let path = self.0.canonicalize().unwrap();
            assert_eq!(path.parent(), Some(parent.as_path()));
            fs::remove_dir_all(path).unwrap();
        }
    }

    #[test]
    fn isolates_profiles_under_the_user_home() {
        let home = Path::new("user");
        assert_eq!(
            DesktopStorage::for_home(home, "com.boost.desktop").data(),
            home.join(".boost/data")
        );
        assert_eq!(
            DesktopStorage::for_home(home, "com.boost.desktop.qa").root,
            home.join(".boost/profiles/com.boost.desktop.qa")
        );
    }

    #[test]
    fn migrates_wal_usage_bot_history_and_profile_without_reimporting_deleted_data() {
        let fixture = Fixture::new();
        let old = fixture.0.join("legacy");
        fs::create_dir_all(old.join("bots/actor")).unwrap();
        let database = Connection::open(old.join("boost.db")).unwrap();
        database.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE usage(tokens INTEGER); INSERT INTO usage VALUES(12345);").unwrap();
        let bot = Connection::open(old.join("bots/actor/boost-bot.db")).unwrap();
        bot.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE messages(body TEXT); INSERT INTO messages VALUES('history');").unwrap();
        fs::write(old.join("boost.rpc-token"), "existing-secret").unwrap();
        fs::write(old.join("installation_id"), "installation").unwrap();
        fs::create_dir_all(old.join("EBWebView/Default/Local Storage")).unwrap();
        fs::write(
            old.join("EBWebView/Default/Local Storage/state"),
            "preferences",
        )
        .unwrap();
        fs::create_dir_all(old.join("logs")).unwrap();
        fs::write(old.join("logs/Boost.log"), "desktop logs").unwrap();
        let layout = DesktopStorage::for_home(&fixture.0, "com.boost.desktop");
        layout.migrate(&old, &old, &old.join("logs"), true).unwrap();
        let migrated = Connection::open(layout.data().join("boost.db")).unwrap();
        assert_eq!(
            migrated
                .query_row("SELECT tokens FROM usage", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            12345
        );
        let migrated_bot = Connection::open(layout.data().join("bots/actor/boost-bot.db")).unwrap();
        assert_eq!(
            migrated_bot
                .query_row("SELECT body FROM messages", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "history"
        );
        #[cfg(windows)]
        assert_eq!(
            fs::read_to_string(layout.webview().join("Default/Local Storage/state")).unwrap(),
            "preferences"
        );
        assert_eq!(
            fs::read_to_string(layout.logs().join("Boost.log")).unwrap(),
            "desktop logs"
        );
        fs::remove_file(layout.data().join("boost.rpc-token")).unwrap();
        layout.migrate(&old, &old, &old.join("logs"), true).unwrap();
        assert!(!layout.data().join("boost.rpc-token").exists());
        assert_eq!(
            database
                .query_row("SELECT tokens FROM usage", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            12345
        );
    }

    #[test]
    fn never_overwrites_existing_destination_data() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source.db");
        fs::write(&source, "invalid legacy database").unwrap();
        let target = fixture.0.join("target.db");
        fs::write(&target, "existing new database").unwrap();
        copy_database_if_missing(&source, &target).unwrap();
        assert_eq!(
            fs::read_to_string(&target).unwrap(),
            "existing new database"
        );
    }

    #[test]
    fn invalid_database_does_not_publish_a_partial_destination() {
        let fixture = Fixture::new();
        let source = fixture.0.join("source.db");
        let target = fixture.0.join("target.db");
        fs::write(&source, "invalid legacy database").unwrap();
        assert!(copy_database_if_missing(&source, &target).is_err());
        assert!(!target.exists());
        assert!(!target
            .with_extension(format!("migrating-{}", std::process::id()))
            .exists());
    }

    #[test]
    fn explicit_database_override_does_not_import_the_default_database() {
        let fixture = Fixture::new();
        let old = fixture.0.join("legacy");
        fs::create_dir(&old).unwrap();
        fs::write(old.join("boost.db"), "unused default database").unwrap();
        fs::write(old.join("boost.rpc-token"), "unused default secret").unwrap();
        let layout = DesktopStorage::for_home(&fixture.0, "com.boost.desktop");
        layout
            .migrate(&old, &old, &old.join("logs"), false)
            .unwrap();
        assert!(!layout.data().join("boost.db").exists());
        assert!(!layout.data().join("boost.rpc-token").exists());
        assert!(!layout.data().join(".legacy-migration-v1").exists());
    }
}
