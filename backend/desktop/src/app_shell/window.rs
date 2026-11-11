use tauri::webview::Color;
use tauri::Manager;
use tauri::{LogicalSize, PhysicalPosition, PhysicalRect, WebviewUrl, WebviewWindowBuilder};

use super::state::KEEP_ALIVE_FOR_LIGHTWEIGHT_CLOSE;

pub(crate) const MAIN_WINDOW_LABEL: &str = "main";
pub(crate) const TRAY_PREVIEW_WINDOW_LABEL: &str = "tray-preview";
const TRAY_PREVIEW_WIDTH: f64 = 80.0;
const TRAY_PREVIEW_EXPANDED_WIDTH: f64 = 376.0;
const TRAY_PREVIEW_HEIGHT: f64 = 420.0;
const TRAY_PREVIEW_MARGIN: f64 = 12.0;

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

pub(crate) fn show_tray_dock(app: &tauri::AppHandle) {
    let Some(window) = ensure_tray_preview_window(app) else {
        return;
    };
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let position =
            resolve_tray_preview_position(*monitor.work_area(), monitor.scale_factor(), false);
        let _ = window.set_position(position);
    }
    if let Err(err) = window.show() {
        log::warn!("show tray dock failed: {}", err);
    }
}

pub(crate) fn set_tray_preview_expanded(
    app: &tauri::AppHandle,
    expanded: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(TRAY_PREVIEW_WINDOW_LABEL)
        .ok_or_else(|| "悬浮条尚未创建".to_string())?;
    let scale = window.scale_factor().map_err(|err| err.to_string())?;
    let position = window.outer_position().map_err(|err| err.to_string())?;
    let current = window.inner_size().map_err(|err| err.to_string())?;
    let width = if expanded {
        TRAY_PREVIEW_EXPANDED_WIDTH
    } else {
        TRAY_PREVIEW_WIDTH
    };
    let size = LogicalSize::new(width, TRAY_PREVIEW_HEIGHT);
    let next = size.to_physical::<u32>(scale);
    let position = resolve_tray_preview_resize(position, current.width, next.width);
    window.set_size(size).map_err(|err| err.to_string())?;
    window
        .set_position(position)
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn resolve_tray_preview_resize(
    position: PhysicalPosition<i32>,
    old_width: u32,
    new_width: u32,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(position.x + old_width as i32 - new_width as i32, position.y)
}

pub(crate) fn toggle_tray_preview_window(
    app: &tauri::AppHandle,
    click_position: PhysicalPosition<f64>,
) {
    let Some(window) = ensure_tray_preview_window(app) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        if let Err(err) = window.hide() {
            log::warn!("hide tray preview window failed: {}", err);
        }
        return;
    }

    position_tray_preview_window(app, &window, click_position);
    if let Err(err) = window.show() {
        log::warn!("show tray preview window failed: {}", err);
        return;
    }
    let _ = window.set_focus();
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

    match WebviewWindowBuilder::from_config(app, &config).and_then(|builder| builder.build()) {
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
    .title("Boost")
    .inner_size(TRAY_PREVIEW_WIDTH, TRAY_PREVIEW_HEIGHT)
    .min_inner_size(TRAY_PREVIEW_WIDTH, TRAY_PREVIEW_HEIGHT)
    .max_inner_size(TRAY_PREVIEW_EXPANDED_WIDTH, TRAY_PREVIEW_HEIGHT)
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

fn position_tray_preview_window(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    click_position: PhysicalPosition<f64>,
) {
    let monitor = app
        .monitor_from_point(click_position.x, click_position.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return;
    };
    let current_scale = window.scale_factor().unwrap_or(monitor.scale_factor());
    let expanded = window
        .inner_size()
        .map(|size| f64::from(size.width) / current_scale > TRAY_PREVIEW_WIDTH + 1.0)
        .unwrap_or(false);
    let position =
        resolve_tray_preview_position(*monitor.work_area(), monitor.scale_factor(), expanded);
    if let Err(err) = window.set_position(position) {
        log::warn!("position tray preview window failed: {}", err);
    }
}

fn resolve_tray_preview_position(
    work_area: PhysicalRect<i32, u32>,
    scale_factor: f64,
    expanded: bool,
) -> PhysicalPosition<i32> {
    let margin = TRAY_PREVIEW_MARGIN * scale_factor;
    let preview_width = if expanded {
        TRAY_PREVIEW_EXPANDED_WIDTH
    } else {
        TRAY_PREVIEW_WIDTH
    } * scale_factor;
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
    use super::{resolve_tray_preview_position, resolve_tray_preview_resize};
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize};

    #[test]
    fn tray_preview_is_centered_at_right_of_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 24),
            size: PhysicalSize::new(1440, 876),
        };

        let position = resolve_tray_preview_position(work_area, 1.0, false);

        assert_eq!(position, PhysicalPosition::new(1348, 252));
    }

    #[test]
    fn tray_preview_respects_scaled_secondary_monitor_and_taskbar() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-2560, 60),
            size: PhysicalSize::new(2560, 1380),
        };

        let position = resolve_tray_preview_position(work_area, 1.5, false);

        assert_eq!(position, PhysicalPosition::new(-138, 435));
    }

    #[test]
    fn tray_preview_fits_compact_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(1920, -400),
            size: PhysicalSize::new(800, 460),
        };

        let position = resolve_tray_preview_position(work_area, 1.0, false);

        assert_eq!(position, PhysicalPosition::new(2628, -380));
    }

    #[test]
    fn details_expand_left_and_collapse_without_moving_the_dock() {
        let dock = PhysicalPosition::new(-120, 435);
        let expanded = resolve_tray_preview_resize(dock, 120, 564);
        assert_eq!(expanded, PhysicalPosition::new(-564, 435));
        assert_eq!(resolve_tray_preview_resize(expanded, 564, 120), dock);
    }

    #[test]
    fn reopening_expanded_details_keeps_the_dock_at_the_screen_edge() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 24),
            size: PhysicalSize::new(1440, 876),
        };
        assert_eq!(
            resolve_tray_preview_position(work_area, 1.0, true),
            PhysicalPosition::new(1052, 252)
        );
    }
}
