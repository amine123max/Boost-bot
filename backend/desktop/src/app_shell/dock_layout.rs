use serde::Serialize;
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
}

fn dimensions(horizontal: bool, rings: u32, metrics: u32) -> LogicalSize<f64> {
    let rings = rings.min(3);
    let metrics = metrics.min(3);
    let ring_space = f64::from(rings * 28 + rings.saturating_sub(1) * 6);
    if horizontal {
        LogicalSize::new(
            (ring_space
                + if metrics > 0 { 58.0 } else { 0.0 }
                + if rings > 0 && metrics > 0 { 10.0 } else { 0.0 }
                + 22.0)
                .max(52.0),
            38.0,
        )
    } else {
        LogicalSize::new(
            64.0,
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

pub(crate) fn sync(window: &tauri::Window, rings: u32, metrics: u32) -> Result<DockLayout, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("无法读取显示器")?;
    let position = window.outer_position().map_err(|e| e.to_string())?;
    let current = window.inner_size().map_err(|e| e.to_string())?;
    let mut previous = EDGE.lock().map_err(|_| "悬浮窗布局暂不可用")?;
    let (edge, size, next) = resolve(
        position,
        current,
        *monitor.work_area(),
        monitor.scale_factor(),
        *previous,
        rings,
        metrics,
    );
    *previous = edge;
    if current != size.to_physical::<u32>(monitor.scale_factor()) {
        window.set_size(size).map_err(|e| e.to_string())?;
    }
    if position != next {
        window.set_position(next).map_err(|e| e.to_string())?;
    }
    Ok(DockLayout {
        edge,
        horizontal: edge == Edge::Top,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
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
