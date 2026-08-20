use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayStatus {
    pub visible: bool,
    pub always_on_top: bool,
    pub hotkey_alt_space: String,
    pub hotkey_alt_i: String,
    pub capture_exclusion_active: bool,
}

/// Applies Windows native screen-capture exclusion (WDA_EXCLUDEFROMCAPTURE = 0x11)
/// to make the HUD window completely invisible to screen shares, screenshots, and OBS.
pub fn apply_capture_exclusion(window: &WebviewWindow, exclude: bool) -> Result<bool, String> {
    let raw_hwnd = window
        .hwnd()
        .map_err(|e| format!("Failed to get HWND from WebviewWindow: {}", e))?;

    let hwnd = raw_hwnd.0 as windows_sys::Win32::Foundation::HWND;
    let affinity = if exclude {
        windows_sys::Win32::UI::WindowsAndMessaging::WDA_EXCLUDEFROMCAPTURE
    } else {
        windows_sys::Win32::UI::WindowsAndMessaging::WDA_NONE
    };

    unsafe {
        let res = windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(hwnd, affinity);
        if res != 0 {
            println!(
                "[Overlay] SetWindowDisplayAffinity succeeded for HWND {:?} (Affinity: {:#X})",
                hwnd, affinity
            );
            Ok(true)
        } else {
            let err_code = windows_sys::Win32::Foundation::GetLastError();
            eprintln!(
                "[Overlay] SetWindowDisplayAffinity failed for HWND {:?} (Affinity: {:#X}, Windows Error Code: {})",
                hwnd, affinity, err_code
            );
            // Fallback to WDA_MONITOR (0x01) on older Windows builds
            if exclude {
                let fallback = windows_sys::Win32::UI::WindowsAndMessaging::SetWindowDisplayAffinity(
                    hwnd,
                    windows_sys::Win32::UI::WindowsAndMessaging::WDA_MONITOR,
                );
                if fallback != 0 {
                    println!("[Overlay] Fallback to WDA_MONITOR succeeded");
                    return Ok(true);
                }
            }
            Err(format!("SetWindowDisplayAffinity failed with error code: {}", err_code))
        }
    }
}

pub struct OverlayManager {
    pub visible: Arc<Mutex<bool>>,
    pub always_on_top: Arc<Mutex<bool>>,
    pub capture_exclusion_enabled: Arc<Mutex<bool>>,
}

impl OverlayManager {
    pub fn new() -> Self {
        Self {
            visible: Arc::new(Mutex::new(false)),
            always_on_top: Arc::new(Mutex::new(true)),
            capture_exclusion_enabled: Arc::new(Mutex::new(true)),
        }
    }

    pub fn is_visible(&self) -> bool {
        *self.visible.lock().unwrap()
    }

    pub fn is_capture_exclusion_enabled(&self) -> bool {
        *self.capture_exclusion_enabled.lock().unwrap()
    }

    pub fn get_status(&self) -> OverlayStatus {
        OverlayStatus {
            visible: self.is_visible(),
            always_on_top: *self.always_on_top.lock().unwrap(),
            hotkey_alt_space: "Disabled (Windows conflict)".to_string(),
            hotkey_alt_i: "Alt+I".to_string(),
            capture_exclusion_active: self.is_capture_exclusion_enabled(),
        }
    }

    pub fn set_capture_exclusion(&self, app: &AppHandle, enabled: bool) -> Result<bool, String> {
        {
            let mut guard = self.capture_exclusion_enabled.lock().unwrap();
            *guard = enabled;
        }

        if let Some(window) = app.get_webview_window("overlay") {
            let _ = apply_capture_exclusion(&window, enabled);
        }

        let _ = app.emit("overlay-status-changed", self.get_status());
        Ok(enabled)
    }

    pub fn show_overlay(&self, app: &AppHandle) -> Result<bool, String> {
        {
            let mut guard = self.visible.lock().unwrap();
            *guard = true;
        }

        let exclude = *self.capture_exclusion_enabled.lock().unwrap();
        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = apply_capture_exclusion(&window, exclude);
        }

        let _ = app.emit("overlay-status-changed", self.get_status());
        Ok(true)
    }

    pub fn hide_overlay(&self, app: &AppHandle) -> Result<bool, String> {
        {
            let mut guard = self.visible.lock().unwrap();
            *guard = false;
        }

        if let Some(window) = app.get_webview_window("overlay") {
            let _ = window.hide();
        }

        let _ = app.emit("overlay-status-changed", self.get_status());
        Ok(false)
    }

    pub fn toggle_overlay(&self, app: &AppHandle) -> Result<bool, String> {
        let current = self.is_visible();
        if current {
            self.hide_overlay(app)
        } else {
            self.show_overlay(app)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_overlay_manager_initial_state() {
        let manager = OverlayManager::new();
        assert!(!manager.is_visible());
        let status = manager.get_status();
        assert_eq!(status.hotkey_alt_space, "Disabled (Windows conflict)");
        assert_eq!(status.hotkey_alt_i, "Alt+I");
        assert!(status.capture_exclusion_active);
    }
}
