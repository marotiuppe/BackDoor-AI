use crate::audio_capture::{AudioCaptureManager, AudioCaptureStatus};
use crate::credential_store;
use crate::overlay_manager::{OverlayManager, OverlayStatus};
use crate::process_manager::ProcessManager;
use crate::screen_capture::{ScreenCaptureManager, ScreenCaptureStatus};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarInfoResponse {
    pub qdrant_port: u16,
    pub backend_ready: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialStatusResponse {
    pub provider: String,
    pub configured: bool,
}

pub struct AppState {
    pub process_manager: Arc<Mutex<ProcessManager>>,
    pub screen_capture_manager: Arc<ScreenCaptureManager>,
    pub audio_capture_manager: Arc<AudioCaptureManager>,
    pub overlay_manager: Arc<OverlayManager>,
    pub db_conn: Arc<Mutex<rusqlite::Connection>>,
}

#[tauri::command]
pub fn get_sidecar_info(app_state: State<'_, AppState>) -> Result<SidecarInfoResponse, String> {
    let pm_guard = app_state
        .process_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let state_guard = pm_guard
        .state
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    Ok(SidecarInfoResponse {
        qdrant_port: state_guard.qdrant_port,
        backend_ready: state_guard.backend_ready,
    })
}

#[tauri::command]
pub fn save_provider_credential(
    provider: String,
    api_key: String,
    _app_state: State<'_, AppState>,
) -> Result<CredentialStatusResponse, String> {
    let normalized = credential_store::normalize_provider(&provider)?;
    credential_store::save_credential(&normalized, &api_key)?;

    Ok(CredentialStatusResponse {
        provider: normalized,
        configured: true,
    })
}

#[tauri::command]
pub fn delete_provider_credential(
    provider: String,
    _app_state: State<'_, AppState>,
) -> Result<CredentialStatusResponse, String> {
    let normalized = credential_store::normalize_provider(&provider)?;
    credential_store::delete_credential(&normalized)?;

    Ok(CredentialStatusResponse {
        provider: normalized,
        configured: false,
    })
}

#[tauri::command]
pub fn get_provider_credential_status(provider: String) -> Result<CredentialStatusResponse, String> {
    let normalized = credential_store::normalize_provider(&provider)?;
    let configured = credential_store::has_credential(&normalized);
    Ok(CredentialStatusResponse {
        provider: normalized,
        configured,
    })
}

#[tauri::command]
pub fn toggle_screen_capture(enabled: bool, app_state: State<'_, AppState>) -> Result<ScreenCaptureStatus, String> {
    app_state.screen_capture_manager.set_active(enabled);
    Ok(app_state.screen_capture_manager.get_status())
}

#[tauri::command]
pub fn get_screen_capture_status(app_state: State<'_, AppState>) -> Result<ScreenCaptureStatus, String> {
    Ok(app_state.screen_capture_manager.get_status())
}

#[tauri::command]
pub async fn dispatch_screen_snippet(snippet: String, app_state: State<'_, AppState>) -> Result<bool, String> {
    let mut guard = app_state.screen_capture_manager.last_text.lock().unwrap();
    *guard = snippet;
    Ok(true)
}

#[tauri::command]
pub fn toggle_audio_capture(enabled: bool, app_state: State<'_, AppState>) -> Result<AudioCaptureStatus, String> {
    app_state.audio_capture_manager.set_mic_active(enabled);
    Ok(app_state.audio_capture_manager.get_status())
}

#[tauri::command]
pub fn toggle_loopback_capture(enabled: bool, app_state: State<'_, AppState>) -> Result<AudioCaptureStatus, String> {
    app_state.audio_capture_manager.set_loopback_active(enabled);
    Ok(app_state.audio_capture_manager.get_status())
}

#[tauri::command]
pub fn toggle_both_audio_capture(enabled: bool, app_state: State<'_, AppState>) -> Result<AudioCaptureStatus, String> {
    app_state.audio_capture_manager.set_both_active(enabled);
    Ok(app_state.audio_capture_manager.get_status())
}

#[tauri::command]
pub fn set_auto_assist(enabled: bool, app_state: State<'_, AppState>) -> Result<bool, String> {
    app_state.audio_capture_manager.set_auto_assist(enabled);
    Ok(enabled)
}

#[tauri::command]
pub fn clear_dialogue_history(app_state: State<'_, AppState>) -> Result<bool, String> {
    app_state.audio_capture_manager.clear_dialogue();
    Ok(true)
}

#[tauri::command]
pub fn get_audio_capture_status(app_state: State<'_, AppState>) -> Result<AudioCaptureStatus, String> {
    Ok(app_state.audio_capture_manager.get_status())
}

#[tauri::command]
pub fn toggle_overlay(app: AppHandle, app_state: State<'_, AppState>) -> Result<bool, String> {
    app_state.overlay_manager.toggle_overlay(&app)
}

#[tauri::command]
pub fn show_overlay(app: AppHandle, app_state: State<'_, AppState>) -> Result<bool, String> {
    app_state.overlay_manager.show_overlay(&app)
}

#[tauri::command]
pub fn hide_overlay(app: AppHandle, app_state: State<'_, AppState>) -> Result<bool, String> {
    app_state.overlay_manager.hide_overlay(&app)
}

#[tauri::command]
pub fn get_overlay_status(app_state: State<'_, AppState>) -> Result<OverlayStatus, String> {
    Ok(app_state.overlay_manager.get_status())
}

#[tauri::command]
pub fn set_overlay_capture_exclusion(
    app: AppHandle,
    app_state: State<'_, AppState>,
    enabled: bool,
) -> Result<bool, String> {
    app_state.overlay_manager.set_capture_exclusion(&app, enabled)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScreenTestResult {
    pub width: i32,
    pub height: i32,
    pub buffer_size: usize,
    pub bitblt_succeeded: bool,
    pub software_bitmap_succeeded: bool,
    pub ocr_succeeded: bool,
    pub extracted_text_length: usize,
    pub extracted_text: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn capture_screen_test() -> ScreenTestResult {
    let (width, height) = crate::screen_capture::get_screen_dimensions();
    match crate::screen_capture::capture_screen_and_ocr() {
        Ok(text) => ScreenTestResult {
            width,
            height,
            buffer_size: text.len(),
            bitblt_succeeded: true,
            software_bitmap_succeeded: true,
            ocr_succeeded: true,
            extracted_text_length: text.len(),
            extracted_text: text,
            error: None,
        },
        Err(e) => ScreenTestResult {
            width,
            height,
            buffer_size: 0,
            bitblt_succeeded: false,
            software_bitmap_succeeded: false,
            ocr_succeeded: false,
            extracted_text_length: 0,
            extracted_text: String::new(),
            error: Some(e),
        },
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioTestResult {
    pub device_name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub sample_format: String,
    pub samples_captured: usize,
    pub max_amplitude: f32,
    pub rms: f32,
    pub speech_detected: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn test_microphone_capture() -> AudioTestResult {
    tokio::task::spawn_blocking(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                return AudioTestResult {
                    device_name: "None".to_string(),
                    sample_rate: 0,
                    channels: 0,
                    sample_format: "None".to_string(),
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some("No default WASAPI input microphone found".to_string()),
                };
            }
        };

        let device_name = device.name().unwrap_or_else(|_| "Unknown Microphone".to_string());
        let supported_config = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                return AudioTestResult {
                    device_name,
                    sample_rate: 0,
                    channels: 0,
                    sample_format: "None".to_string(),
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some(format!("Failed to get default input stream config: {}", e)),
                };
            }
        };

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels();
        let sample_format = format!("{:?}", supported_config.sample_format());

        let captured_samples = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let samples_clone = captured_samples.clone();

        let stream_config: cpal::StreamConfig = supported_config.clone().into();
        let err_cb = move |err| {
            eprintln!("[AudioTest] Stream error: {}", err);
        };

        let stream_res = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        guard.extend_from_slice(data);
                    }
                },
                err_cb,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        guard.extend_from_slice(&f32_data);
                    }
                },
                err_cb,
                None,
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &stream_config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        let f32_data: Vec<f32> = data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                        guard.extend_from_slice(&f32_data);
                    }
                },
                err_cb,
                None,
            ),
            _ => {
                return AudioTestResult {
                    device_name,
                    sample_rate,
                    channels,
                    sample_format,
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some("Unsupported sample format".to_string()),
                };
            }
        };

        let stream = match stream_res {
            Ok(s) => s,
            Err(e) => {
                return AudioTestResult {
                    device_name,
                    sample_rate,
                    channels,
                    sample_format,
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some(format!("Failed to build input stream: {}", e)),
                };
            }
        };

        if let Err(e) = stream.play() {
            return AudioTestResult {
                device_name,
                sample_rate,
                channels,
                sample_format,
                samples_captured: 0,
                max_amplitude: 0.0,
                rms: 0.0,
                speech_detected: false,
                error: Some(format!("Failed to start stream play: {}", e)),
            };
        }

        std::thread::sleep(std::time::Duration::from_secs(2));
        drop(stream);

        let guard = captured_samples.lock().unwrap();
        let samples_captured = guard.len();
        let max_amp = guard.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);
        let rms = crate::stt_engine::calculate_rms(&guard);
        let speech_detected = rms >= 0.015;

        AudioTestResult {
            device_name,
            sample_rate,
            channels,
            sample_format,
            samples_captured,
            max_amplitude: max_amp,
            rms,
            speech_detected,
            error: None,
        }
    })
    .await
    .unwrap_or_else(|e| AudioTestResult {
        device_name: "Error".to_string(),
        sample_rate: 0,
        channels: 0,
        sample_format: "None".to_string(),
        samples_captured: 0,
        max_amplitude: 0.0,
        rms: 0.0,
        speech_detected: false,
        error: Some(format!("Spawn blocking error: {}", e)),
    })
}

#[tauri::command]
pub async fn test_speaker_loopback_capture() -> AudioTestResult {
    tokio::task::spawn_blocking(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        let host = cpal::default_host();
        let device = match host.default_output_device() {
            Some(d) => d,
            None => {
                return AudioTestResult {
                    device_name: "None".to_string(),
                    sample_rate: 0,
                    channels: 0,
                    sample_format: "None".to_string(),
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some("No default WASAPI output speaker device found for loopback".to_string()),
                };
            }
        };

        let device_name = device.name().unwrap_or_else(|_| "Unknown Output Device".to_string());
        let supported_config = match device.default_output_config() {
            Ok(c) => c,
            Err(e) => {
                return AudioTestResult {
                    device_name,
                    sample_rate: 0,
                    channels: 0,
                    sample_format: "None".to_string(),
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some(format!("Failed to get default output config: {}", e)),
                };
            }
        };

        let sample_rate = supported_config.sample_rate().0;
        let channels = supported_config.channels();
        let sample_format = format!("{:?}", supported_config.sample_format());

        let captured_samples = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let samples_clone = captured_samples.clone();

        let stream_config: cpal::StreamConfig = supported_config.clone().into();
        let err_cb = move |err| {
            eprintln!("[LoopbackTest] Stream error: {}", err);
        };

        let stream_res = match supported_config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &stream_config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        guard.extend_from_slice(data);
                    }
                },
                err_cb,
                None,
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &stream_config,
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        let f32_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        guard.extend_from_slice(&f32_data);
                    }
                },
                err_cb,
                None,
            ),
            cpal::SampleFormat::U16 => device.build_input_stream(
                &stream_config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    let mut guard = samples_clone.lock().unwrap();
                    if guard.len() < 100000 {
                        let f32_data: Vec<f32> = data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                        guard.extend_from_slice(&f32_data);
                    }
                },
                err_cb,
                None,
            ),
            _ => {
                return AudioTestResult {
                    device_name,
                    sample_rate,
                    channels,
                    sample_format,
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some("Unsupported sample format".to_string()),
                };
            }
        };

        let stream = match stream_res {
            Ok(s) => s,
            Err(e) => {
                return AudioTestResult {
                    device_name,
                    sample_rate,
                    channels,
                    sample_format,
                    samples_captured: 0,
                    max_amplitude: 0.0,
                    rms: 0.0,
                    speech_detected: false,
                    error: Some(format!("Failed to build loopback stream: {}", e)),
                };
            }
        };

        if let Err(e) = stream.play() {
            return AudioTestResult {
                device_name,
                sample_rate,
                channels,
                sample_format,
                samples_captured: 0,
                max_amplitude: 0.0,
                rms: 0.0,
                speech_detected: false,
                error: Some(format!("Failed to start loopback stream play: {}", e)),
            };
        }

        std::thread::sleep(std::time::Duration::from_secs(2));
        drop(stream);

        let guard = captured_samples.lock().unwrap();
        let samples_captured = guard.len();
        let max_amp = guard.iter().map(|&s| s.abs()).fold(0.0f32, f32::max);
        let rms = crate::stt_engine::calculate_rms(&guard);
        let speech_detected = rms >= 0.005;

        AudioTestResult {
            device_name,
            sample_rate,
            channels,
            sample_format,
            samples_captured,
            max_amplitude: max_amp,
            rms,
            speech_detected,
            error: None,
        }
    })
    .await
    .unwrap_or_else(|e| AudioTestResult {
        device_name: "Error".to_string(),
        sample_rate: 0,
        channels: 0,
        sample_format: "None".to_string(),
        samples_captured: 0,
        max_amplitude: 0.0,
        rms: 0.0,
        speech_detected: false,
        error: Some(format!("Spawn blocking error: {}", e)),
    })
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisionSnapshotResult {
    pub image_base64: String,
    pub ocr_text: String,
    pub width: u32,
    pub height: u32,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn capture_screen_vision_snapshot(
    _state: tauri::State<'_, AppState>,
) -> Result<VisionSnapshotResult, String> {
    tokio::task::spawn_blocking(move || {
        let (width, height) = crate::screen_capture::get_screen_dimensions();
        match crate::screen_capture::capture_screen_with_image() {
            Ok((ocr_text, image_b64)) => Ok(VisionSnapshotResult {
                image_base64: image_b64,
                ocr_text,
                width: width as u32,
                height: height as u32,
                error: None,
            }),
            Err(e) => Ok(VisionSnapshotResult {
                image_base64: String::new(),
                ocr_text: String::new(),
                width: width as u32,
                height: height as u32,
                error: Some(e),
            }),
        }
    })
    .await
    .map_err(|e| format!("Vision snapshot task join error: {}", e))?
}

#[tauri::command]
pub fn list_star_stories(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::database::StarStory>, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::list_star_stories(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_star_story(
    state: tauri::State<'_, AppState>,
    story: crate::database::StarStory,
) -> Result<bool, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::create_star_story(&conn, &story).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn delete_star_story(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::delete_star_story(&conn, &id).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn list_mock_interview_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::database::MockInterviewSession>, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::list_mock_interview_sessions(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_mock_interview_session(
    state: tauri::State<'_, AppState>,
    session: crate::database::MockInterviewSession,
) -> Result<bool, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::save_mock_interview_session(&conn, &session).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn delete_mock_interview_session(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::delete_mock_interview_session(&conn, &id).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn pull_ollama_model(
    app_handle: tauri::AppHandle,
    model: String,
) -> Result<(), String> {
    use tauri::Emitter;
    use futures::StreamExt;

    let host = crate::credential_store::get_credential("OLLAMA")
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    let base_url = if host.trim().is_empty() {
        "http://127.0.0.1:11434".to_string()
    } else {
        host.trim().to_string()
    };

    let client = reqwest::Client::new();
    let url = format!("{}/api/pull", base_url);
    let payload = serde_json::json!({
        "name": model,
        "stream": true
    });

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama at {}: {}", url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama pull error (HTTP {}): {}", status, err_text));
    }

    let mut stream = res.bytes_stream();
    let mut line_buffer = Vec::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Stream error during pull: {}", e))?;
        for &byte in chunk.iter() {
            if byte == b'\n' {
                if !line_buffer.is_empty() {
                    if let Ok(line_str) = std::str::from_utf8(&line_buffer) {
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line_str) {
                            let _ = app_handle.emit("ollama-pull-progress", &parsed);
                        }
                    }
                    line_buffer.clear();
                }
            } else {
                line_buffer.push(byte);
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn install_ollama(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri::Emitter;
    use futures::StreamExt;
    use std::io::Write;

    let client = reqwest::Client::new();
    let url = "https://ollama.com/download/OllamaSetup.exe";

    let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
        "status": "Downloading Ollama Setup...",
        "progress": 0
    }));

    let res = client.get(url).send().await.map_err(|e| format!("Failed to download Ollama setup: {}", e))?;
    if !res.status().is_success() {
        return Err(format!("Failed to download Ollama setup (HTTP {})", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    
    let temp_dir = std::env::temp_dir();
    let installer_path = temp_dir.join("OllamaSetup.exe");
    let mut file = std::fs::File::create(&installer_path).map_err(|e| format!("Failed to create temporary file: {}", e))?;

    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("Error downloading chunk: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Failed to write to file: {}", e))?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64 * 100.0) as u32;
            let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
                "status": format!("Downloading: {}%", progress),
                "progress": progress
            }));
        }
    }

    drop(file);

    let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
        "status": "Launching Ollama installer...",
        "progress": 100
    }));

    let install_status = std::process::Command::new(&installer_path)
        .arg("/VERYSILENT")
        .arg("/SUPPRESSMSGBOXES")
        .arg("/NORESTART")
        .arg("/SP-")
        .status();

    match install_status {
        Ok(status) if status.success() => {
            let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
                "status": "Ollama installed successfully! Starting server...",
                "progress": 100,
                "completed": true
            }));

            let _ = std::process::Command::new("ollama")
                .arg("serve")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();

            tokio::time::sleep(std::time::Duration::from_millis(2000)).await;

            Ok(())
        }
        _ => {
            let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
                "status": "Silent install blocked or failed. Launching interactive installer...",
                "progress": 95
            }));
            let run_interactive = std::process::Command::new(&installer_path).spawn();
            match run_interactive {
                Ok(_) => {
                    let _ = app_handle.emit("ollama-install-progress", serde_json::json!({
                        "status": "Please follow the setup window on your screen to complete installation.",
                        "progress": 100,
                        "completed": true
                    }));
                    Ok(())
                }
                Err(e2) => Err(format!("Failed to launch installer: {}", e2))
            }
        }
    }
}


