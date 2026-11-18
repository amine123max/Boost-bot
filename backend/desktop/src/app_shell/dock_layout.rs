use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{LogicalSize, PhysicalPosition, PhysicalRect, PhysicalSize};

#[derive(Clone, Copy, Default, PartialEq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Edge {
    #[default]
    Floating,
    Top,
    Left,
    Right,
}
static EDGE: Mutex<Edge> = Mutex::new(Edge::Floating);
#[derive(Serialize)]
pub(crate) struct DockLayout {
    edge: Edge,
    horizontal: bool,
    x: i32,
    y: i32,
    monitor: String,
    scale: f64,
}
#[derive(Clone, Deserialize)]
struct SavedPosition {
    x: i32,
    y: i32,
    monitor: Option<String>,
    scale: Option<f64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LayoutOptions {
    horizontal_width: f64,
    horizontal_height: f64,
    vertical_width: f64,
    vertical_height: f64,
    orientation: String,
    snap: bool,
    position: Option<SavedPosition>,
}

fn dimensions(horizontal: bool, rings: u32, metrics: u32) -> LogicalSize<f64> {
    let rings = rings.min(3);
    let metrics = metrics.min(3);
    let ring_gap = if horizontal { 4 } else { 6 };
    let ring_space = f64::from(rings * 32 + rings.saturating_sub(1) * ring_gap);
    if horizontal {
        LogicalSize::new(
            (ring_space
                + if metrics > 0 { 44.0 } else { 0.0 }
                + if rings > 0 && metrics > 0 { 4.0 } else { 0.0 }
                + 12.0)
                .max(52.0),
            40.0,
        )
    } else {
        LogicalSize::new(
            58.0,
            (ring_space
                + f64::from(metrics * 9)
                + if rings > 0 && metrics > 0 { 10.0 } else { 0.0 }
                + 24.0)
                .max(48.0),
        )
    }
}

fn resolve(
    position: PhysicalPosition<i32>,
    current: PhysicalSize<u32>,
    area: PhysicalRect<i32, u32>,
    scale: f64,
    previous: Edge,
    rings: u32,
    metrics: u32,
) -> (Edge, LogicalSize<f64>, PhysicalPosition<i32>) {
    let near = (24.0 * scale) as i32;
    let hold = (48.0 * scale) as i32;
    let right = area.position.x + area.size.width as i32;
    let edge = if position.y <= area.position.y + if previous == Edge::Top { hold } else { near } {
        Edge::Top
    } else if position.x <= area.position.x + if previous == Edge::Left { hold } else { near } {
        Edge::Left
    } else if right - position.x - current.width as i32
        <= if previous == Edge::Right { hold } else { near }
    {
        Edge::Right
    } else {
        Edge::Floating
    };
    let size = dimensions(edge == Edge::Top, rings, metrics);
    let pixels = size.to_physical::<u32>(scale);
    let max_x = (right - pixels.width as i32).max(area.position.x);
    let max_y =
        (area.position.y + area.size.height as i32 - pixels.height as i32).max(area.position.y);
    let x = match edge {
        Edge::Left => area.position.x,
        Edge::Right => max_x,
        _ => position.x + (current.width as i32 - pixels.width as i32) / 2,
    };
    let y = if edge == Edge::Top {
        area.position.y
    } else {
        position.y
    };
    (
        edge,
        size,
        PhysicalPosition::new(
            x.clamp(area.position.x, max_x),
            y.clamp(area.position.y, max_y),
        ),
    )
}

fn configured_layout(
    options: &LayoutOptions,
    mut edge: Edge,
    position: PhysicalPosition<i32>,
    area: PhysicalRect<i32, u32>,
    scale: f64,
) -> Result<(Edge, bool, LogicalSize<f64>, PhysicalPosition<i32>), String> {
    if !options.snap {
        edge = Edge::Floating;
    }
    let horizontal = match options.orientation.as_str() {
        "horizontal" => true,
        "vertical" => false,
        _ => edge == Edge::Top,
    };
    let (width, height) = if horizontal {
        (options.horizontal_width, options.horizontal_height)
    } else {
        (options.vertical_width, options.vertical_height)
    };
    if !width.is_finite()
        || !height.is_finite()
        || !(32.0..=720.0).contains(&width)
        || !(32.0..=720.0).contains(&height)
    {
        return Err("悬浮窗尺寸无效".into());
    }
    let size = LogicalSize::new(
        width.min(f64::from(area.size.width) / scale),
        height.min(f64::from(area.size.height) / scale),
    );
    let pixels = size.to_physical::<u32>(scale);
    let max_x =
        (area.position.x + area.size.width as i32 - pixels.width as i32).max(area.position.x);
    let max_y =
        (area.position.y + area.size.height as i32 - pixels.height as i32).max(area.position.y);
    let desired = position;
    let next = PhysicalPosition::new(
        (match edge {
            Edge::Left => area.position.x,
            Edge::Right => max_x,
            _ => desired.x,
        })
        .clamp(area.position.x, max_x),
        (if edge == Edge::Top {
            area.position.y
        } else {
            desired.y
        })
        .clamp(area.position.y, max_y),
    );
    Ok((edge, horizontal, size, next))
}

#[cfg(target_os = "macos")]
fn work_area(window: &tauri::Window, monitor: &tauri::Monitor) -> PhysicalRect<i32, u32> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSScreen;
    let scale = monitor.scale_factor();
    let origin = monitor.position().to_logical::<f64>(scale);
    let fallback = *monitor.work_area();
    // Tauri 2.10 converts the horizontal inset but leaves the macOS work area's
    // Y at the physical screen edge. AppKit's visibleFrame excludes the menu bar.
    let read = move |mtm: MainThreadMarker| {
        let screens = NSScreen::screens(mtm);
        let Some(primary) = screens.firstObject() else {
            return fallback;
        };
        let primary_frame = primary.frame();
        let primary_top = primary_frame.origin.y + primary_frame.size.height;
        for screen in screens.to_vec() {
            let frame = screen.frame();
            let top = primary_top - frame.origin.y - frame.size.height;
            if (frame.origin.x - origin.x).abs() > 1.0 || (top - origin.y).abs() > 1.0 {
                continue;
            }
            let visible = screen.visibleFrame();
            return PhysicalRect {
                position: tauri::LogicalPosition::new(
                    visible.origin.x,
                    primary_top - visible.origin.y - visible.size.height,
                )
                .to_physical(scale),
                size: LogicalSize::new(visible.size.width, visible.size.height).to_physical(scale),
            };
        }
        fallback
    };
    if let Some(mtm) = MainThreadMarker::new() {
        return read(mtm);
    }
    let (send, recv) = std::sync::mpsc::sync_channel(1);
    if window
        .run_on_main_thread(move || {
            if let Some(mtm) = MainThreadMarker::new() {
                let _ = send.send(read(mtm));
            }
        })
        .is_ok()
    {
        return recv
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap_or(fallback);
    }
    fallback
}

#[cfg(not(target_os = "macos"))]
fn work_area(_: &tauri::Window, monitor: &tauri::Monitor) -> PhysicalRect<i32, u32> {
    *monitor.work_area()
}

fn monitor_key(monitor: &tauri::Monitor) -> String {
    let position = monitor.position();
    let scale = if cfg!(target_os = "macos") {
        monitor.scale_factor()
    } else {
        1.0
    };
    let origin = position.to_logical::<f64>(scale);
    format!(
        "{}|{:.0}|{:.0}",
        monitor.name().map(String::as_str).unwrap_or(""),
        origin.x,
        origin.y
    )
}

pub(crate) fn sync(
    window: &tauri::Window,
    rings: u32,
    metrics: u32,
    options: Option<LayoutOptions>,
) -> Result<DockLayout, String> {
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let saved = options
        .as_ref()
        .and_then(|options| options.position.as_ref());
    let saved_monitor = if let Some(point) = saved {
        let monitors = window.available_monitors().map_err(|e| e.to_string())?;
        monitors
            .iter()
            .find(|monitor| point.monitor.as_deref() == Some(monitor_key(monitor).as_str()))
            .or_else(|| {
                monitors.iter().find(|monitor| {
                    let origin = monitor.position();
                    let size = monitor.size();
                    point.x >= origin.x
                        && point.y >= origin.y
                        && point.x < origin.x + size.width as i32
                        && point.y < origin.y + size.height as i32
                })
            })
            .cloned()
    } else {
        None
    };
    let monitor = saved_monitor
        .or(window.current_monitor().map_err(|e| e.to_string())?)
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or("无法读取显示器")?;
    let area = work_area(window, &monitor);
    let scale = monitor.scale_factor();
    let key = monitor_key(&monitor);
    let desired = saved.map_or(position, |p| {
        let point = PhysicalPosition::new(p.x, p.y);
        if cfg!(target_os = "macos") && p.monitor.as_deref() == Some(key.as_str()) {
            let saved_scale = p
                .scale
                .filter(|value| value.is_finite() && *value >= 1.0)
                .unwrap_or(scale);
            point.to_logical::<f64>(saved_scale).to_physical(scale)
        } else {
            point
        }
    });
    let current = window
        .inner_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|e| e.to_string())?)
        .to_physical(scale);
    let mut previous = EDGE.lock().map_err(|_| "悬浮窗布局暂不可用")?;
    let (mut edge, mut size, mut next) =
        resolve(desired, current, area, scale, *previous, rings, metrics);
    let mut horizontal = edge == Edge::Top;
    if let Some(options) = options {
        (edge, horizontal, size, next) = configured_layout(&options, edge, desired, area, scale)?;
    }
    *previous = edge;
    let resized = current != size.to_physical::<u32>(scale);
    if resized {
        window.set_size(size).map_err(|e| e.to_string())?;
    }
    if position != next || (resized && edge == Edge::Top) {
        #[cfg(target_os = "macos")]
        let next = next.to_logical::<f64>(scale);
        window.set_position(next).map_err(|e| e.to_string())?;
    }
    Ok(DockLayout {
        edge,
        horizontal,
        x: next.x,
        y: next.y,
        monitor: key,
        scale,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn free_position_restores_on_a_scaled_monitor_and_rejects_invalid_sizes() {
        let mut options = LayoutOptions {
            horizontal_width: 280.0,
            horizontal_height: 55.0,
            vertical_width: 64.0,
            vertical_height: 220.0,
            orientation: "horizontal".into(),
            snap: false,
            position: None,
        };
        let (edge, horizontal, size, position) = configured_layout(
            &options,
            Edge::Right,
            PhysicalPosition::new(-1500, 120),
            area(),
            1.5,
        )
        .unwrap();
        assert_eq!(edge, Edge::Floating);
        assert!(horizontal);
        assert_eq!(size.width, 280.0);
        assert_eq!(position, PhysicalPosition::new(-1500, 120));
        options.horizontal_width = f64::NAN;
        assert!(configured_layout(&options, Edge::Top, position, area(), 1.5).is_err());
    }
    fn area() -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(-1920, -200),
            size: PhysicalSize::new(1920, 1080),
        }
    }
    #[test]
    fn top_snap_is_flush_and_layout_has_hysteresis() {
        let current = PhysicalSize::new(64, 163);
        let (edge, size, pos) = resolve(
            PhysicalPosition::new(-900, -180),
            current,
            area(),
            1.0,
            Edge::Floating,
            3,
            3,
        );
        assert_eq!(edge, Edge::Top);
        assert_eq!(pos.y, -200);
        assert!(size.width > size.height);
        assert_eq!(
            resolve(
                PhysicalPosition::new(-900, -160),
                current,
                area(),
                1.0,
                Edge::Top,
                3,
                3
            )
            .0,
            Edge::Top
        );
        assert_eq!(
            resolve(
                PhysicalPosition::new(-900, -100),
                current,
                area(),
                1.0,
                Edge::Top,
                3,
                3
            )
            .0,
            Edge::Floating
        );
    }
    #[test]
    fn side_snap_and_content_changes_stay_on_scaled_monitor() {
        let area = PhysicalRect {
            position: PhysicalPosition::new(0, 30),
            size: PhysicalSize::new(2160, 1400),
        };
        let (edge, size, pos) = resolve(
            PhysicalPosition::new(2050, 500),
            PhysicalSize::new(96, 245),
            area,
            1.5,
            Edge::Floating,
            1,
            0,
        );
        assert_eq!(edge, Edge::Right);
        assert_eq!(pos.x + size.to_physical::<u32>(1.5).width as i32, 2160);
        assert!(dimensions(false, 1, 0).height < dimensions(false, 3, 3).height);
        assert!(dimensions(true, 0, 1).width < dimensions(true, 3, 3).width);
    }
    #[test]
    fn metric_only_strip_is_not_misclassified_by_its_aspect_ratio() {
        assert_eq!(
            resolve(
                PhysicalPosition::new(-900, 100),
                PhysicalSize::new(64, 55),
                area(),
                1.0,
                Edge::Floating,
                0,
                3
            )
            .0,
            Edge::Floating
        );
    }
}
