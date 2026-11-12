use super::{prompts, state, window};
use tauri::{Emitter, Manager};

pub(crate) fn on_close_requested(main: &tauri::Window) {
    let action = boost_service::current_main_window_close_action();
    if let Err(error) = main.hide() {
        let _ = main.emit("main-window-close-error", error.to_string());
        return;
    }
    let main = main.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = if action == "ask" {
            super::close_prompt::show(main.app_handle())
        } else {
            apply(&main, &action, false).map(|_| ())
        };
        if let Err(error) = result {
            window::show_main_window(main.app_handle());
            let _ = main.emit("main-window-close-error", error);
        }
    });
}

pub(crate) fn apply(main: &tauri::Window, action: &str, remember: bool) -> Result<bool, String> {
    if !matches!(action, "exit" | "floating" | "minimize") {
        return Err("无效的窗口关闭行为".to_string());
    }
    if action == "exit"
        && state::has_unsaved_settings_draft_sections()
        && !prompts::confirm_discard_unsaved_settings_for_app_exit()
    {
        window::show_main_window(main.app_handle());
        return Ok(false);
    }
    if remember {
        boost_service::set_main_window_close_action(action)?;
        let _ = main.emit("main-window-close-action-changed", action);
    }
    match action {
        "exit" => {
            state::prepare_for_forced_app_exit();
            main.app_handle().exit(0);
        }
        // Keep previously saved floating preferences compatible with minimize.
        "floating" | "minimize" => {
            window::show_tray_dock(main.app_handle())?;
            main.minimize().map_err(|err| err.to_string())?;
        }
        _ => unreachable!(),
    }
    super::close_prompt::hide(main.app_handle());
    Ok(true)
}
