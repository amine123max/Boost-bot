use boost_core::storage::{now_ts, Storage};
use std::collections::HashMap;
use std::ops::Deref;
use std::sync::{Mutex, MutexGuard};

use super::normalize_optional_text;

/// 函数 `open_app_settings_storage`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
static SETTINGS_STORAGE: Mutex<Option<(String, Storage)>> = Mutex::new(None);

pub(crate) struct SettingsStorageHandle(MutexGuard<'static, Option<(String, Storage)>>);
impl Deref for SettingsStorageHandle {
    type Target = Storage;
    fn deref(&self) -> &Self::Target {
        &self.0.as_ref().expect("initialized settings connection").1
    }
}

pub(crate) fn open_app_settings_storage() -> Option<SettingsStorageHandle> {
    crate::process_env::ensure_default_db_path();
    let path = std::env::var("BOOST_DB_PATH").ok()?;
    let mut state = SETTINGS_STORAGE.lock().unwrap_or_else(|e| e.into_inner());
    if state.as_ref().map(|(current, _)| current) != Some(&path) {
        let storage = Storage::open(&path).ok()?;
        // Authentication may precede normal startup, but never migrate on every lookup.
        if storage.get_app_setting("__boost_schema_probe__").is_err() {
            storage.init().ok()?;
        }
        *state = Some((path, storage));
    }
    // A dedicated short-lived settings lock avoids nested acquisition from a saturated
    // inference pool. No caller may retain it across network I/O or another settings call.
    Some(SettingsStorageHandle(state))
}

/// 函数 `list_app_settings_map`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn list_app_settings_map() -> HashMap<String, String> {
    open_app_settings_storage()
        .and_then(|storage| storage.list_app_settings().ok())
        .unwrap_or_default()
        .into_iter()
        .collect()
}

/// 函数 `get_persisted_app_setting`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn get_persisted_app_setting(key: &str) -> Option<String> {
    open_app_settings_storage()
        .and_then(|storage| storage.get_app_setting(key).ok().flatten())
        .and_then(|value| normalize_optional_text(Some(&value)))
}

/// 函数 `save_persisted_app_setting`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn save_persisted_app_setting(key: &str, value: Option<&str>) -> Result<(), String> {
    let storage = open_app_settings_storage().ok_or_else(|| "storage unavailable".to_string())?;
    let text = normalize_optional_text(value).unwrap_or_default();
    storage
        .set_app_setting(key, &text, now_ts())
        .map_err(|err| format!("save {key} failed: {err}"))?;
    Ok(())
}

/// 函数 `save_persisted_bool_setting`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 返回函数执行结果
pub(crate) fn save_persisted_bool_setting(key: &str, value: bool) -> Result<(), String> {
    save_persisted_app_setting(key, Some(if value { "1" } else { "0" }))
}
