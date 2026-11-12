use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub(crate) const LABEL: &str = "close-confirm";

pub(crate) fn show(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window
            .emit("main-window-close-requested", "")
            .map_err(|e| e.to_string())?;
        window.show().map_err(|e| e.to_string())?;
        return window.set_focus().map_err(|e| e.to_string());
    }
    // Called from a blocking worker, never from the Windows event loop.
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("close-confirm/".into()))
        .data_directory(crate::app_storage::storage(app).webview())
        .title("Boost")
        .inner_size(392.0, 212.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .background_color(tauri::webview::Color(0, 0, 0, 0))
        .shadow(false)
        .center()
        .visible(false)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub(crate) fn hide(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}
