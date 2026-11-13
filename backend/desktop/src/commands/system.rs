use crate::{
    app_shell::{hide_tray_preview_window, set_unsaved_settings_draft_sections, show_main_window},
    commands::shared::{
        open_external_url_blocking, open_in_browser_blocking, open_in_file_manager_blocking,
    },
};
use tauri::Manager;

/// 函数 `open_in_browser`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - url: 参数 url
///
/// # 返回
/// 返回函数执行结果
#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_in_browser_blocking(&url))
        .await
        .map_err(|err| format!("open_in_browser task failed: {err}"))?
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_external_url_blocking(&url))
        .await
        .map_err(|err| format!("open_external_url task failed: {err}"))?
}

/// 函数 `open_in_file_manager`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - path: 参数 path
///
/// # 返回
/// 返回函数执行结果
#[tauri::command]
pub async fn open_in_file_manager(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_in_file_manager_blocking(&path))
        .await
        .map_err(|err| format!("open_in_file_manager task failed: {err}"))?
}

/// 函数 `app_window_unsaved_draft_sections_set`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - sections: 参数 sections
///
/// # 返回
/// 返回函数执行结果
#[tauri::command]
pub fn app_window_unsaved_draft_sections_set(sections: Vec<String>) -> Result<(), String> {
    set_unsaved_settings_draft_sections(sections);
    Ok(())
}

#[tauri::command]
pub fn app_show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

#[tauri::command]
pub fn app_hide_tray_preview_window(app: tauri::AppHandle) -> Result<(), String> {
    hide_tray_preview_window(&app);
    Ok(())
}

#[tauri::command]
pub async fn app_main_window_close(
    window: tauri::Window,
    action: String,
    remember: bool,
) -> Result<bool, String> {
    if !matches!(window.label(), "main" | "close-confirm") {
        return Err("当前窗口不可执行此操作".to_string());
    }
    let main = window
        .app_handle()
        .get_webview_window("main")
        .ok_or("主窗口不存在")?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::app_shell::close_action::apply(&main.as_ref().window(), &action, remember)
    })
    .await
    .map_err(|error| format!("窗口操作失败：{error}"))?
}

#[tauri::command]
pub fn app_close_prompt_ready(window: tauri::Window) -> Result<(), String> {
    if window.label() != crate::app_shell::close_prompt::LABEL {
        return Err("当前窗口不是关闭确认窗口".to_string());
    }
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_tray_layout_sync(
    window: tauri::Window,
    rings: u32,
    metrics: u32,
    layout: Option<crate::app_shell::dock_layout::LayoutOptions>,
) -> Result<crate::app_shell::dock_layout::DockLayout, String> {
    if window.label() != "tray-preview" {
        return Err("当前窗口不是悬浮窗".into());
    }
    crate::app_shell::dock_layout::sync(&window, rings, metrics, layout)
}

#[tauri::command]
pub async fn app_local_agent_activity(window: tauri::Window) -> Result<serde_json::Value, String> {
    if !matches!(window.label(), "main" | "tray-preview") {
        return Err("当前窗口不可读取本机任务".into());
    }
    tauri::async_runtime::spawn_blocking(crate::local_activity::read)
        .await
        .map_err(|e| e.to_string())?
}
