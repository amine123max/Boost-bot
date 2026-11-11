use crate::app_storage::apply_runtime_storage_env;

/// 函数 `service_listen_config_get`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - app: 参数 app
///
/// # 返回
/// 返回函数执行结果
#[tauri::command]
pub async fn service_listen_config_get(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    tauri::async_runtime::spawn_blocking(move || {
        Ok(serde_json::json!({
            "mode": boost_service::current_service_bind_mode(),
            "options": [
                boost_service::SERVICE_BIND_MODE_LOOPBACK,
                boost_service::SERVICE_BIND_MODE_ALL_INTERFACES
            ],
            "requiresRestart": true,
        }))
    })
    .await
    .map_err(|err| format!("service_listen_config_get task failed: {err}"))?
}

/// 函数 `service_listen_config_set`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - app: 参数 app
/// - mode: 参数 mode
///
/// # 返回
/// 返回函数执行结果
#[tauri::command]
pub async fn service_listen_config_set(
    app: tauri::AppHandle,
    mode: String,
) -> Result<serde_json::Value, String> {
    apply_runtime_storage_env(&app);
    tauri::async_runtime::spawn_blocking(move || {
        boost_service::set_service_bind_mode(&mode).map(|applied| {
            serde_json::json!({
                "mode": applied,
                "options": [
                    boost_service::SERVICE_BIND_MODE_LOOPBACK,
                    boost_service::SERVICE_BIND_MODE_ALL_INTERFACES
                ],
                "requiresRestart": true,
            })
        })
    })
    .await
    .map_err(|err| format!("service_listen_config_set task failed: {err}"))?
}
