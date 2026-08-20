use crate::ocr_engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use windows::Graphics::Imaging::{BitmapAlphaMode, BitmapEncoder, BitmapPixelFormat, SoftwareBitmap};
use windows::Storage::Streams::{DataReader, DataWriter, InMemoryRandomAccessStream};
use windows_sys::Win32::Graphics::Gdi::{BITMAPINFO, BITMAPINFOHEADER};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextEventPayload {
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub payload: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCaptureStatus {
    pub active: bool,
    pub ocr_supported: bool,
    pub last_scan_timestamp_ms: u64,
    pub sample_interval_secs: u64,
    pub last_text: Option<String>,
    pub last_image_base64: Option<String>,
    pub error_message: Option<String>,
}

pub struct ScreenCaptureManager {
    pub active: Arc<Mutex<bool>>,
    pub last_text: Arc<Mutex<String>>,
    pub last_image_base64: Arc<Mutex<String>>,
    pub last_scan_timestamp: Arc<Mutex<u64>>,
    pub last_error: Arc<Mutex<Option<String>>>,
    pub sample_interval_secs: u64,
}

impl ScreenCaptureManager {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(false)),
            last_text: Arc::new(Mutex::new(String::new())),
            last_image_base64: Arc::new(Mutex::new(String::new())),
            last_scan_timestamp: Arc::new(Mutex::new(0)),
            last_error: Arc::new(Mutex::new(None)),
            sample_interval_secs: 3,
        }
    }

    pub fn is_active(&self) -> bool {
        *self.active.lock().unwrap()
    }

    pub fn set_active(&self, enabled: bool) {
        println!("[Capture] start requested (enabled: {})", enabled);
        let mut guard = self.active.lock().unwrap();
        let was_active = *guard;
        *guard = enabled;
        drop(guard);

        if enabled && !was_active {
            println!("[Capture] capture loop started");
            let mut err_guard = self.last_error.lock().unwrap();
            *err_guard = None;
            drop(err_guard);

            let active_clone = self.active.clone();
            let last_text_clone = self.last_text.clone();
            let last_image_clone = self.last_image_base64.clone();
            let last_ts_clone = self.last_scan_timestamp.clone();
            let last_err_clone = self.last_error.clone();
            let interval = self.sample_interval_secs;

            tauri::async_runtime::spawn(async move {
                while *active_clone.lock().unwrap() {
                    let ocr_result = tokio::task::spawn_blocking(|| {
                        capture_screen_with_image()
                    })
                    .await;

                    match ocr_result {
                        Ok(Ok((extracted_text, image_b64))) => {
                            let mut text_guard = last_text_clone.lock().unwrap();
                            let previous = text_guard.clone();
                            let trimmed = extracted_text.trim().to_string();

                            if !trimmed.is_empty()
                                && ocr_engine::is_significantly_different(&previous, &trimmed, 0.08)
                            {
                                *text_guard = trimmed;
                            }

                            if !image_b64.is_empty() {
                                let mut img_guard = last_image_clone.lock().unwrap();
                                *img_guard = image_b64;
                            }

                            let mut ts_guard = last_ts_clone.lock().unwrap();
                            *ts_guard = std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis() as u64;

                            let mut err_guard = last_err_clone.lock().unwrap();
                            *err_guard = None;
                        }
                        Ok(Err(e)) => {
                            let mut err_guard = last_err_clone.lock().unwrap();
                            *err_guard = Some(e);
                        }
                        Err(e) => {
                            let mut err_guard = last_err_clone.lock().unwrap();
                            *err_guard = Some(format!("Join error: {}", e));
                        }
                    }

                    tokio::time::sleep(tokio::time::Duration::from_secs(interval)).await;
                }
                println!("[Capture] capture loop ended");
            });
        }
    }

    pub fn get_status(&self) -> ScreenCaptureStatus {
        let active = *self.active.lock().unwrap();
        let last_scan_timestamp_ms = *self.last_scan_timestamp.lock().unwrap();
        let last_text_val = self.last_text.lock().unwrap().clone();
        let last_image_val = self.last_image_base64.lock().unwrap().clone();
        let error_message = self.last_error.lock().unwrap().clone();

        ScreenCaptureStatus {
            active,
            ocr_supported: true,
            last_scan_timestamp_ms,
            sample_interval_secs: self.sample_interval_secs,
            last_text: if last_text_val.is_empty() {
                None
            } else {
                Some(last_text_val)
            },
            last_image_base64: if last_image_val.is_empty() {
                None
            } else {
                Some(last_image_val)
            },
            error_message,
        }
    }

    pub fn get_latest_text(&self) -> String {
        self.last_text.lock().unwrap().clone()
    }

    pub fn get_latest_image_base64(&self) -> String {
        self.last_image_base64.lock().unwrap().clone()
    }

    pub fn clear_text(&self) {
        let mut guard = self.last_text.lock().unwrap();
        guard.clear();
        let mut img_guard = self.last_image_base64.lock().unwrap();
        img_guard.clear();
    }
}

/// Helper function to encode raw bytes to standard Base64 string.
pub fn to_base64(data: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;

        result.push(CHARSET[(triple >> 18) & 0x3F] as char);
        result.push(CHARSET[(triple >> 12) & 0x3F] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[(triple >> 6) & 0x3F] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[triple & 0x3F] as char);
        } else {
            result.push('=');
        }
    }
    result
}

type HDC = *mut core::ffi::c_void;
type HBITMAP = *mut core::ffi::c_void;
type HWND = *mut core::ffi::c_void;
type HGDIOBJ = *mut core::ffi::c_void;

#[link(name = "user32")]
extern "system" {
    fn GetDC(hwnd: HWND) -> HDC;
    fn ReleaseDC(hwnd: HWND, hdc: HDC) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
}

#[link(name = "gdi32")]
extern "system" {
    fn CreateCompatibleDC(hdc: HDC) -> HDC;
    fn DeleteDC(hdc: HDC) -> i32;
    fn CreateCompatibleBitmap(hdc: HDC, cx: i32, cy: i32) -> HBITMAP;
    fn DeleteObject(ho: HGDIOBJ) -> i32;
    fn SelectObject(hdc: HDC, h: HGDIOBJ) -> HGDIOBJ;
    fn BitBlt(
        hdc_dest: HDC,
        x_dest: i32,
        y_dest: i32,
        w: i32,
        h: i32,
        hdc_src: HDC,
        x_src: i32,
        y_src: i32,
        rop: u32,
    ) -> i32;
    fn GetDIBits(
        hdc: HDC,
        hbm: HBITMAP,
        start: u32,
        cLines: u32,
        lpvBits: *mut core::ffi::c_void,
        lpbmi: *mut BITMAPINFO,
        usage: u32,
    ) -> i32;
    fn SetStretchBltMode(hdc: HDC, mode: i32) -> i32;
    fn SetBrushOrgEx(hdc: HDC, x: i32, y: i32, lppt: *mut core::ffi::c_void) -> i32;
    fn StretchBlt(
        hdc_dest: HDC,
        x_dest: i32,
        y_dest: i32,
        w_dest: i32,
        h_dest: i32,
        hdc_src: HDC,
        x_src: i32,
        y_src: i32,
        w_src: i32,
        h_src: i32,
        rop: u32,
    ) -> i32;
}

const SRCCOPY: u32 = 0x00CC0020;
const SM_CXSCREEN: i32 = 0;
const SM_CYSCREEN: i32 = 1;
const DIB_RGB_COLORS: u32 = 0;
const BI_RGB: u32 = 0;

struct ComGuard {
    com_init: bool,
}

impl ComGuard {
    fn new() -> Self {
        unsafe {
            let hr_com = windows_sys::Win32::System::Com::CoInitializeEx(
                std::ptr::null_mut(),
                windows_sys::Win32::System::Com::COINIT_MULTITHREADED as u32,
            );
            // S_OK (0) means initialized successfully on this thread
            ComGuard {
                com_init: hr_com == 0,
            }
        }
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        unsafe {
            if self.com_init {
                windows_sys::Win32::System::Com::CoUninitialize();
            }
        }
    }
}

/// RAII Guard that manages GDI device contexts and bitmaps safely.
/// Guarantees all GDI handles are released in proper reverse order on Drop.
struct GdiCaptureGuard {
    hdc_screen: HDC,
    mem_dc: HDC,
    mem_bitmap: HBITMAP,
    old_bitmap: HGDIOBJ,
}

impl GdiCaptureGuard {
    fn new(width: i32, height: i32) -> Result<Self, String> {
        unsafe {
            let hdc_screen = GetDC(std::ptr::null_mut());
            if hdc_screen.is_null() {
                return Err("Failed to get desktop DC".into());
            }

            let mem_dc = CreateCompatibleDC(hdc_screen);
            if mem_dc.is_null() {
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err("Failed to create compatible DC".into());
            }

            let mem_bitmap = CreateCompatibleBitmap(hdc_screen, width, height);
            if mem_bitmap.is_null() {
                DeleteDC(mem_dc);
                ReleaseDC(std::ptr::null_mut(), hdc_screen);
                return Err("Failed to create compatible bitmap".into());
            }

            let old_bitmap = SelectObject(mem_dc, mem_bitmap);

            Ok(GdiCaptureGuard {
                hdc_screen,
                mem_dc,
                mem_bitmap,
                old_bitmap,
            })
        }
    }
}

impl Drop for GdiCaptureGuard {
    fn drop(&mut self) {
        unsafe {
            if !self.mem_dc.is_null() {
                if !self.old_bitmap.is_null() {
                    SelectObject(self.mem_dc, self.old_bitmap);
                }
                if !self.mem_bitmap.is_null() {
                    DeleteObject(self.mem_bitmap);
                }
                DeleteDC(self.mem_dc);
            }
            if !self.hdc_screen.is_null() {
                ReleaseDC(std::ptr::null_mut(), self.hdc_screen);
            }
        }
    }
}

/// Captures the primary monitor screen via GDI BitBlt, encodes to JPEG, and runs WinRT OCR.
/// Returns (extracted_text, jpeg_base64) or error without ever panicking.
pub fn capture_screen_with_image() -> Result<(String, String), String> {
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _com = ComGuard::new();
        capture_screen_internal()
    }));

    match result {
        Ok(res) => res,
        Err(_) => Err("Screen capture recovered from unexpected system exception".to_string()),
    }
}

fn capture_screen_internal() -> Result<(String, String), String> {
    let width = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let height = unsafe { GetSystemMetrics(SM_CYSCREEN) };
    if width <= 0 || height <= 0 {
        return Err("Failed to determine screen metrics".into());
    }

    let gdi = GdiCaptureGuard::new(width, height)?;

    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .and_then(|wh| wh.checked_mul(4))
        .ok_or_else(|| "Screen metrics arithmetic overflow".to_string())?;
    let mut pixels = vec![0u8; pixel_count];

    unsafe {
        let blt_result = BitBlt(gdi.mem_dc, 0, 0, width, height, gdi.hdc_screen, 0, 0, SRCCOPY);
        if blt_result == 0 {
            return Err("BitBlt screen capture failed".into());
        }

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height; // top-down
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let scan_lines = GetDIBits(
            gdi.mem_dc,
            gdi.mem_bitmap,
            0,
            height as u32,
            pixels.as_mut_ptr() as *mut _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        if scan_lines == 0 {
            return Err("GetDIBits failed to extract pixel data".into());
        }
    }

        // Convert to WinRT SoftwareBitmap via DataWriter
        let stream = InMemoryRandomAccessStream::new()
            .map_err(|e| format!("Failed to create InMemoryRandomAccessStream: {}", e))?;
        let writer = DataWriter::CreateDataWriter(&stream)
            .map_err(|e| format!("Failed to create DataWriter: {}", e))?;
        writer
            .WriteBytes(&pixels)
            .map_err(|e| format!("Failed to write pixel data: {}", e))?;
        let buffer = writer
            .DetachBuffer()
            .map_err(|e| format!("Failed to detach buffer: {}", e))?;

        let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
            &buffer,
            BitmapPixelFormat::Bgra8,
            width,
            height,
            BitmapAlphaMode::Premultiplied,
        )
        .map_err(|e| format!("Failed to create SoftwareBitmap: {}", e))?;

        // 1. Run WinRT OCR
        let ocr_text = crate::ocr_engine::OcrEngineWrapper::extract_text_from_bitmap(&bitmap)
            .unwrap_or_default();

        // 2. Downscale and encode to JPEG in-memory safely (to prevent prompt size exceeding Ollama context limits)
        let max_dimension = 1024;
        let mut scaled_width = width;
        let mut scaled_height = height;
        if width > max_dimension || height > max_dimension {
            if width > height {
                scaled_width = max_dimension;
                scaled_height = (height as f64 * (max_dimension as f64 / width as f64)) as i32;
            } else {
                scaled_height = max_dimension;
                scaled_width = (width as f64 * (max_dimension as f64 / height as f64)) as i32;
            }
        }

        let mut jpeg_b64 = String::new();
        if let Ok(scaled_gdi) = GdiCaptureGuard::new(scaled_width, scaled_height) {
            unsafe {
                SetStretchBltMode(scaled_gdi.mem_dc, 4); // HALFTONE
                SetBrushOrgEx(scaled_gdi.mem_dc, 0, 0, std::ptr::null_mut());
                let blt_result = StretchBlt(
                    scaled_gdi.mem_dc,
                    0,
                    0,
                    scaled_width,
                    scaled_height,
                    gdi.hdc_screen,
                    0,
                    0,
                    width,
                    height,
                    SRCCOPY,
                );
                if blt_result != 0 {
                    let scaled_pixel_count = (scaled_width as usize) * (scaled_height as usize) * 4;
                    let mut scaled_pixels = vec![0u8; scaled_pixel_count];
                    let mut bmi: BITMAPINFO = std::mem::zeroed();
                    bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
                    bmi.bmiHeader.biWidth = scaled_width;
                    bmi.bmiHeader.biHeight = -scaled_height; // top-down
                    bmi.bmiHeader.biPlanes = 1;
                    bmi.bmiHeader.biBitCount = 32;
                    bmi.bmiHeader.biCompression = BI_RGB;

                    let scan_lines = GetDIBits(
                        scaled_gdi.mem_dc,
                        scaled_gdi.mem_bitmap,
                        0,
                        scaled_height as u32,
                        scaled_pixels.as_mut_ptr() as *mut _,
                        &mut bmi,
                        DIB_RGB_COLORS,
                    );

                    if scan_lines != 0 {
                        if let Ok(stream_out) = InMemoryRandomAccessStream::new() {
                            if let Ok(writer) = DataWriter::CreateDataWriter(&stream_out) {
                                if writer.WriteBytes(&scaled_pixels).is_ok() {
                                    if let Ok(buffer) = writer.DetachBuffer() {
                                        if let Ok(scaled_bitmap) = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
                                            &buffer,
                                            BitmapPixelFormat::Bgra8,
                                            scaled_width,
                                            scaled_height,
                                            BitmapAlphaMode::Premultiplied,
                                        ) {
                                            jpeg_b64 = encode_jpeg_base64_safe(&scaled_bitmap);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if jpeg_b64.is_empty() {
            // Fallback to full resolution if downscaling fails
            jpeg_b64 = encode_jpeg_base64_safe(&bitmap);
        }

        Ok((ocr_text, jpeg_b64))
}

fn encode_jpeg_base64_safe(bitmap: &SoftwareBitmap) -> String {
    let bitmap_ref = std::panic::AssertUnwindSafe(bitmap);
    let result = std::panic::catch_unwind(move || {
        let mut jpeg_b64 = String::new();
        if let Ok(stream_out) = InMemoryRandomAccessStream::new() {
            if let Ok(jpeg_id) = BitmapEncoder::JpegEncoderId() {
                if let Ok(encoder_async) = BitmapEncoder::CreateAsync(jpeg_id, &stream_out) {
                    if let Ok(encoder) = encoder_async.get() {
                        if encoder.SetSoftwareBitmap(*bitmap_ref).is_ok() {
                            if let Ok(flush_async) = encoder.FlushAsync() {
                                if flush_async.get().is_ok() {
                                    if let Ok(size) = stream_out.Size() {
                                        if let Ok(reader) = DataReader::CreateDataReader(&stream_out) {
                                            if reader.LoadAsync(size as u32).and_then(|a| a.get()).is_ok() {
                                                let mut bytes = vec![0u8; size as usize];
                                                if reader.ReadBytes(&mut bytes).is_ok() {
                                                    jpeg_b64 = to_base64(&bytes);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        jpeg_b64
    });

    result.unwrap_or_default()
}

/// Standalone GDI screen capture & OCR helper.
pub fn capture_screen_and_ocr() -> Result<String, String> {
    let (text, _) = capture_screen_with_image()?;
    Ok(text)
}

/// Helper to get the primary screen dimensions for diagnostic reporting.
pub fn get_screen_dimensions() -> (i32, i32) {
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);
        (width, height)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_base64() {
        let input = b"Hello, BackDoor AI Multimodal Vision!";
        let encoded = to_base64(input);
        assert!(!encoded.is_empty());
        assert_eq!(encoded, "SGVsbG8sIEJhY2tEb29yIEFJIE11bHRpbW9kYWwgVmlzaW9uIQ==");
    }

    #[tokio::test]
    async fn test_screen_capture_manager_deduplication() {
        let manager = ScreenCaptureManager::new();
        manager.set_active(true);

        assert!(manager.is_active());

        // First snippet should trigger dispatch logic
        let previous = {
            let guard = manager.last_text.lock().unwrap();
            guard.clone()
        };
        assert!(ocr_engine::is_significantly_different(
            &previous,
            "IDE: KafkaProducer.java",
            0.10
        ));

        // Exact same snippet should be deduplicated (not significantly different)
        assert!(!ocr_engine::is_significantly_different(
            "IDE: KafkaProducer.java",
            "IDE: KafkaProducer.java",
            0.10
        ));
    }
}
