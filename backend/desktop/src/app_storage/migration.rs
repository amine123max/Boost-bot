use rusqlite::{backup::Backup, Connection, OpenFlags};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const PRIMARY_APP_IDENTIFIER: &str = "com.boost.desktop";
const QA_APP_IDENTIFIER: &str = "com.boost.desktop.qa";

/// 函数 `maybe_migrate_legacy_db`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - super: 参数 super
///
/// # 返回
/// 无
pub(super) fn maybe_migrate_legacy_db(current_db: &Path) {
    let current_has_data = db_has_user_data(current_db);
    if current_has_data {
        return;
    }

    let needs_bootstrap = !current_db.is_file() || !current_has_data;
    if !needs_bootstrap {
        return;
    }

    for legacy_db in bootstrap_db_candidates(current_db) {
        if !legacy_db.is_file() {
            continue;
        }
        if !db_has_user_data(&legacy_db) {
            continue;
        }

        if let Some(parent) = current_db.parent() {
            let _ = fs::create_dir_all(parent);
        }

        match copy_db_snapshot(&legacy_db, current_db) {
            Ok(_) => {
                log::info!(
                    "Migrated legacy db {} -> {}",
                    legacy_db.display(),
                    current_db.display()
                );
                return;
            }
            Err(err) => {
                log::warn!(
                    "Failed to migrate legacy db {} -> {}: {}",
                    legacy_db.display(),
                    current_db.display(),
                    err
                );
            }
        }
    }
}

/// 函数 `copy_db_snapshot`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - source: 参数 source
/// - target: 参数 target
///
/// # 返回
/// 返回函数执行结果
fn copy_db_snapshot(source: &Path, target: &Path) -> Result<(), String> {
    remove_db_sidecars(target);
    if target.is_file() {
        fs::remove_file(target).map_err(|err| {
            format!(
                "remove existing target db {} failed: {err}",
                target.display()
            )
        })?;
    }

    let source_conn = Connection::open(source)
        .map_err(|err| format!("open source db {} failed: {err}", source.display()))?;
    source_conn
        .busy_timeout(Duration::from_millis(3000))
        .map_err(|err| format!("configure source db {} failed: {err}", source.display()))?;

    let mut target_conn = Connection::open(target)
        .map_err(|err| format!("open target db {} failed: {err}", target.display()))?;
    target_conn
        .busy_timeout(Duration::from_millis(3000))
        .map_err(|err| format!("configure target db {} failed: {err}", target.display()))?;

    let backup = Backup::new(&source_conn, &mut target_conn).map_err(|err| {
        format!(
            "create sqlite backup {} -> {} failed: {err}",
            source.display(),
            target.display()
        )
    })?;
    backup
        .run_to_completion(64, Duration::from_millis(25), None)
        .map_err(|err| {
            format!(
                "run sqlite backup {} -> {} failed: {err}",
                source.display(),
                target.display()
            )
        })?;
    Ok(())
}

/// 函数 `remove_db_sidecars`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - path: 参数 path
///
/// # 返回
/// 无
fn remove_db_sidecars(path: &Path) {
    for sidecar in db_sidecar_paths(path) {
        if sidecar.is_file() {
            let _ = fs::remove_file(sidecar);
        }
    }
}

/// 函数 `db_sidecar_paths`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - path: 参数 path
///
/// # 返回
/// 返回函数执行结果
fn db_sidecar_paths(path: &Path) -> [PathBuf; 2] {
    let base = path.as_os_str().to_string_lossy();
    [
        PathBuf::from(format!("{base}-wal")),
        PathBuf::from(format!("{base}-shm")),
    ]
}

/// 函数 `db_has_user_data`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - path: 参数 path
///
/// # 返回
/// 返回函数执行结果
fn db_has_user_data(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let connection = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(connection) => connection,
        Err(_) => return false,
    };
    ["accounts", "tokens", "api_keys"].iter().any(|table| {
        connection.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} LIMIT 1)"), [], |row| row.get::<_, bool>(0))
            .unwrap_or(false)
    })
}

/// 函数 `legacy_db_candidates`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - current_db: 参数 current_db
///
/// # 返回
/// 返回函数执行结果
fn legacy_db_candidates(current_db: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Some(parent) = current_db.parent() {
        out.push(parent.join("gpttools.db"));
        if parent
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case("com.boost.desktop"))
        {
            if let Some(root) = parent.parent() {
                out.push(root.join("com.gpttools.desktop").join("gpttools.db"));
            }
        }
    }

    dedup_candidates(current_db, out)
}

/// 函数 `bootstrap_db_candidates`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - current_db: 参数 current_db
///
/// # 返回
/// 返回函数执行结果
fn bootstrap_db_candidates(current_db: &Path) -> Vec<PathBuf> {
    let mut out = profile_db_candidates(current_db);
    out.extend(legacy_db_candidates(current_db));
    dedup_candidates(current_db, out)
}

/// 函数 `profile_db_candidates`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - current_db: 参数 current_db
///
/// # 返回
/// 返回函数执行结果
fn profile_db_candidates(current_db: &Path) -> Vec<PathBuf> {
    let Some(parent) = current_db.parent() else {
        return Vec::new();
    };
    let Some(parent_name) = parent.file_name().and_then(|name| name.to_str()) else {
        return Vec::new();
    };
    if !parent_name.eq_ignore_ascii_case(QA_APP_IDENTIFIER) {
        return Vec::new();
    }

    let Some(root) = parent.parent() else {
        return Vec::new();
    };
    vec![root.join(PRIMARY_APP_IDENTIFIER).join("boost.db")]
}

/// 函数 `dedup_candidates`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - current_db: 参数 current_db
/// - candidates: 参数 candidates
///
/// # 返回
/// 返回函数执行结果
fn dedup_candidates(current_db: &Path, candidates: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut dedup = Vec::new();
    for candidate in candidates {
        if candidate == current_db {
            continue;
        }
        if !dedup.iter().any(|item| item == &candidate) {
            dedup.push(candidate);
        }
    }
    dedup
}

#[cfg(test)]
mod tests {
    use super::{
        maybe_migrate_legacy_db, profile_db_candidates, PRIMARY_APP_IDENTIFIER, QA_APP_IDENTIFIER,
    };
    use boost_core::storage::{now_ts, Account, Storage};
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    /// 函数 `unique_temp_dir`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// 无
    ///
    /// # 返回
    /// 返回函数执行结果
    fn unique_temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("boost-qa-migration-test-{unique}"))
    }

    /// 函数 `create_populated_db`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// - path: 参数 path
    ///
    /// # 返回
    /// 返回函数执行结果
    fn create_populated_db(path: &Path) -> Storage {
        let storage = Storage::open(path).expect("open storage");
        storage.init().expect("init storage");
        storage
            .insert_account(&Account {
                id: "acc-1".to_string(),
                label: "main".to_string(),
                issuer: "https://auth.openai.com".to_string(),
                chatgpt_account_id: Some("acct_123".to_string()),
                workspace_id: Some("org_123".to_string()),
                group_name: None,
                sort: 0,
                status: "healthy".to_string(),
                created_at: now_ts(),
                updated_at: now_ts(),
            })
            .expect("insert account");
        storage
    }

    /// 函数 `profile_db_candidates_only_seed_qa_profile_from_primary_profile`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// 无
    ///
    /// # 返回
    /// 无
    #[test]
    fn profile_db_candidates_only_seed_qa_profile_from_primary_profile() {
        let qa_db = PathBuf::from(format!(
            "C:/Users/test/AppData/Roaming/{QA_APP_IDENTIFIER}/boost.db"
        ));
        assert_eq!(
            profile_db_candidates(&qa_db),
            vec![PathBuf::from(format!(
                "C:/Users/test/AppData/Roaming/{PRIMARY_APP_IDENTIFIER}/boost.db"
            ))]
        );

        let primary_db = PathBuf::from(format!(
            "C:/Users/test/AppData/Roaming/{PRIMARY_APP_IDENTIFIER}/boost.db"
        ));
        assert!(profile_db_candidates(&primary_db).is_empty());
    }

    /// 函数 `maybe_migrate_legacy_db_seeds_empty_qa_profile_from_primary_profile`
    ///
    ///
    /// 时间: 2026-04-02
    ///
    /// # 参数
    /// 无
    ///
    /// # 返回
    /// 无
    #[test]
    fn maybe_migrate_legacy_db_seeds_empty_qa_profile_from_primary_profile() {
        let root = unique_temp_dir();
        let qa_dir = root.join(QA_APP_IDENTIFIER);
        let primary_dir = root.join(PRIMARY_APP_IDENTIFIER);
        std::fs::create_dir_all(&qa_dir).expect("create qa dir");
        std::fs::create_dir_all(&primary_dir).expect("create primary dir");

        let qa_db = qa_dir.join("boost.db");
        let primary_db = primary_dir.join("boost.db");

        let qa_storage = Storage::open(&qa_db).expect("open qa storage");
        qa_storage.init().expect("init qa storage");
        drop(qa_storage);

        let _source_storage = create_populated_db(&primary_db);

        maybe_migrate_legacy_db(&qa_db);

        assert!(!qa_db.with_extension("db.empty.bak").exists());

        let migrated = Storage::open(&qa_db).expect("open migrated qa storage");
        migrated.init().expect("init migrated qa storage");
        assert_eq!(migrated.account_count().expect("count accounts"), 1);

        let _ = std::fs::remove_dir_all(&root);
    }
}
