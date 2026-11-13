use tauri::webview::Color;
use tauri::Manager;
use tauri::{PhysicalPosition, PhysicalRect, WebviewUrl, WebviewWindowBuilder};

use super::state::KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE;

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) const TRAY_PREVIEW_WINDOW_LABEL: &str = "tray-preview";
const TRAY_PREVIEW_WIDTH: f64 = 64.0;
const TRAY_PREVIEW_HEIGHT: f64 = 157.0;
const TRAY_PREVIEW_MARGIN: f64 = 0.0;

/// 函数 `show_main_window`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - crate: 参数 crate
///
/// # 返回
/// 无
pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE.store(false, std::sync::atomic::Ordering::Relaxed);
    let Some(window) = ensure_main_window(app) else {
        return;
    };
    if let Err(err) = window.show() {
        log::warn!("show main window failed: {}", err);
        return;
    }
    hide_tray_preview_window(app);
    super::close_prompt::hide(app);
    let _ = window.unminimize();
    let _ = window.set_focus();
}

pub(crate) fn hide_tray_preview_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(TRAY_PREVIEW_WINDOW_LABEL) {
        if let Err(err) = window.hide() {
            log::warn!("hide tray preview window failed: {}", err);
        }
    }
}

pub(crate) fn show_tray_dock(app: &tauri::AppHandle) -> Result<(), String> {
    let existing = app.get_webview_window(TRAY_PREVIEW_WINDOW_LABEL).is_some();
    let window = ensure_tray_preview_window(app).ok_or("无法创建悬浮窗")?;
    if let Some(monitor) = (!existing).then(|| app.primary_monitor().ok().flatten()).flatten() {
        let position =
            resolve_tray_preview_position(*monitor.work_area(), monitor.scale_factor());
        let _ = window.set_position(position);
    }
    window.show().map_err(|err| err.to_string())
}

/// 函数 `ensure_main_window`
///
///
/// 时间: 2026-04-02
///
/// # 参数
/// - app: 参数 app
///
/// # 返回
/// 返回函数执行结果
fn ensure_main_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        return Some(window);
    }

    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .or_else(|| app.config().app.windows.first().cloned())?;
    config.label = MAIN_WINDOW_LABEL.to_string();

    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| {
        builder.data_directory(crate::app_storage::storage(app).webview()).build()
    }) {
        Ok(window) => Some(window),
        Err(err) => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                return Some(window);
            }
            log::warn!("create main window failed: {}", err);
            None
        }
    }
}

fn ensure_tray_preview_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    if let Some(window) = app.get_webview_window(TRAY_PREVIEW_WINDOW_LABEL) {
        return Some(window);
    }

    match WebviewWindowBuilder::new(
        app,
        TRAY_PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("tray-preview/".into()),
    )
    .data_directory(crate::app_storage::storage(app).webview())
    .title("Boost")
    .inner_size(TRAY_PREVIEW_WIDTH, TRAY_PREVIEW_HEIGHT)
    .min_inner_size(32.0, 32.0)
    .max_inner_size(720.0, 720.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .decorations(false)
    .transparent(true)
    .background_color(Color(0, 0, 0, 0))
    .shadow(false)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    .skip_taskbar(true)
    .visible(false)
    .focused(false)
    .build()
    {
        Ok(window) => Some(window),
        Err(err) => {
            if let Some(window) = app.get_webview_window(TRAY_PREVIEW_WINDOW_LABEL) {
                return Some(window);
            }
            log::warn!("create tray preview window failed: {}", err);
            None
        }
    }
}

fn resolve_tray_preview_position(
    work_area: PhysicalRect<i32, u32>,
    scale_factor: f64,
) -> PhysicalPosition<i32> {
    let margin = TRAY_PREVIEW_MARGIN * scale_factor;
    let preview_width = TRAY_PREVIEW_WIDTH * scale_factor;
    let preview_height = TRAY_PREVIEW_HEIGHT * scale_factor;
    let work_x = f64::from(work_area.position.x);
    let work_y = f64::from(work_area.position.y);
    let work_width = f64::from(work_area.size.width);
    let work_height = f64::from(work_area.size.height);

    let min_x = work_x + margin;
    let max_x = (work_x + work_width - preview_width - margin).max(min_x);
    let x = max_x;

    let min_y = work_y + margin;
    let max_y = (work_y + work_height - preview_height - margin).max(min_y);
    let y = (work_y + (work_height - preview_height) / 2.0).clamp(min_y, max_y);

    PhysicalPosition::new(x.round() as i32, y.round() as i32)
}

#[cfg(test)]
mod tests {
    use super::resolve_tray_preview_position;
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize};

    #[test]
    fn tray_preview_is_centered_at_right_of_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 24),
            size: PhysicalSize::new(1440, 876),
        };

        let position = resolve_tray_preview_position(work_area, 1.0);

        assert_eq!(position, PhysicalPosition::new(1376, 384));
    }

    #[test]
    fn tray_preview_respects_scaled_secondary_monitor_and_taskbar() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-2560, 60),
            size: PhysicalSize::new(2560, 1380),
        };

        let position = resolve_tray_preview_position(work_area, 1.5);

        assert_eq!(position, PhysicalPosition::new(-96, 632));
    }

    #[test]
    fn tray_preview_fits_compact_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(1920, -400),
            size: PhysicalSize::new(800, 460),
        };

        let position = resolve_tray_preview_position(work_area, 1.0);

        assert_eq!(position, PhysicalPosition::new(2656, -249));
    }

}
