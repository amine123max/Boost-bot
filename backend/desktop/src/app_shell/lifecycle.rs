use std::sync::atomic::Ordering;

use tauri::Manager;

use crate::service_runtime::stop_service;

use super::prompts::confirm_discard_unsaved_settings_for_app_exit;
use super::state::{
    has_unsaved_settings_draft_sections, should_keep_alive_for_lightweight_close,
    take_skip_next_unsaved_settings_exit_confirm, APP_EXIT_REQUESTED,
    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE,
};
#[cfg(target_os = "macos")]
use super::window::show_main_window;
use super::window::{hide_tray_preview_window, MAIN_WINDOW_LABEL, TRAY_PREVIEW_WINDOW_LABEL};

/// 函数 `should_confirm_unsaved_settings_before_app_exit`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - keep_alive_for_lightweight_close: 参数 keep_alive_for_lightweight_close
/// - skip_unsaved_settings_confirm: 参数 skip_unsaved_settings_confirm
/// - has_unsaved_settings: 参数 has_unsaved_settings
///
/// # 返回
/// 返回函数执行结果
fn should_confirm_unsaved_settings_before_app_exit(
    keep_alive_for_lightweight_close: bool,
    skip_unsaved_settings_confirm: bool,
    has_unsaved_settings: bool,
) -> bool {
    has_unsaved_settings && !keep_alive_for_lightweight_close && !skip_unsaved_settings_confirm
}

/// 函数 `handle_main_window_event`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 无
pub(crate) fn handle_main_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == super::close_prompt::LABEL {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            super::window::show_main_window(window.app_handle());
        }
        return;
    }
    if window.label() == TRAY_PREVIEW_WINDOW_LABEL {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            hide_tray_preview_window(window.app_handle());
        }
        return;
    }
    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if APP_EXIT_REQUESTED.load(Ordering::Relaxed) {
            return;
        }

        api.prevent_close();
        super::close_action::on_close_requested(window);
        return;
    }
    if let tauri::WindowEvent::Destroyed = event {
        if should_keep_alive_for_lightweight_close() {
            log::info!("main window destroyed for lightweight tray mode");
            return;
        }
        stop_service();
    }
}

/// 函数 `handle_run_event`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 无
pub(crate) fn handle_run_event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            let skip_unsaved_settings_confirm = take_skip_next_unsaved_settings_exit_confirm();
            let keep_alive_for_lightweight_close = should_keep_alive_for_lightweight_close();
            if keep_alive_for_lightweight_close {
                api.prevent_exit();
                log::info!("prevented app exit for lightweight tray mode");
                return;
            }
            if should_confirm_unsaved_settings_before_app_exit(
                keep_alive_for_lightweight_close,
                skip_unsaved_settings_confirm,
                has_unsaved_settings_draft_sections(),
            ) && !confirm_discard_unsaved_settings_for_app_exit()
            {
                api.prevent_exit();
                log::info!("prevented app exit because settings drafts are still unsaved");
                return;
            }
            APP_EXIT_REQUESTED.store(true, Ordering::Relaxed);
            KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, Ordering::Relaxed);
            stop_service();
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            show_main_window(app);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::should_confirm_unsaved_settings_before_app_exit;

    /// 函数 `confirms_app_exit_only_when_unsaved_drafts_would_be_lost`
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
    fn confirms_app_exit_only_when_unsaved_drafts_would_be_lost() {
        assert!(should_confirm_unsaved_settings_before_app_exit(
            false, false, true,
        ));
        assert!(!should_confirm_unsaved_settings_before_app_exit(
            false, true, true,
        ));
        assert!(!should_confirm_unsaved_settings_before_app_exit(
            true, false, true,
        ));
        assert!(!should_confirm_unsaved_settings_before_app_exit(
            false, false, false,
        ));
    }
}
