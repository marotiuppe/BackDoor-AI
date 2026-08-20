use crate::stt_engine::SttEngineWrapper;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub const MAX_PCM_SAMPLES: usize = 1_920_000; // 120 seconds @ 16,000 Hz
pub const DEFAULT_VAD_THRESHOLD: f32 = 0.015; // RMS energy threshold for speech activity

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioContextEventPayload {
    #[serde(rename = "sourceType")]
    pub source_type: String,
    #[serde(rename = "contentType")]
    pub content_type: String,
    pub payload: String,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DialogueTurn {
    pub speaker: String, // "Interviewer" | "Candidate"
    pub text: String,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioCaptureStatus {
    pub active: bool,
    pub mic_active: bool,
    pub loopback_active: bool,
    pub stt_supported: bool,
    pub device_name: String,
    pub mic_device_name: String,
    pub loopback_device_name: String,
    pub sample_rate: u32,
    pub vad_threshold: f32,
    pub buffer_samples: usize,
    pub last_speech_timestamp_ms: u64,
    pub last_transcript: String,
    pub last_mic_transcript: String,
    pub last_loopback_transcript: String,
    pub formatted_dialogue: String,
    pub dialogue_turns: Vec<DialogueTurn>,
    pub auto_assist_enabled: bool,
    pub error_message: Option<String>,
}

pub struct AudioCaptureManager {
    pub mic_active: Arc<Mutex<bool>>,
    pub loopback_active: Arc<Mutex<bool>>,
    pub mic_pcm_buffer: Arc<Mutex<Vec<f32>>>,
    pub loopback_pcm_buffer: Arc<Mutex<Vec<f32>>>,
    pub last_mic_transcript: Arc<Mutex<String>>,
    pub last_loopback_transcript: Arc<Mutex<String>>,
    pub dialogue_turns: Arc<Mutex<Vec<DialogueTurn>>>,
    pub formatted_dialogue: Arc<Mutex<String>>,
    pub last_speech_timestamp: Arc<Mutex<u64>>,
    pub last_interviewer_speech_ms: Arc<Mutex<u64>>,
    pub last_candidate_speech_ms: Arc<Mutex<u64>>,
    pub auto_assist_enabled: Arc<Mutex<bool>>,
    pub last_error: Arc<Mutex<Option<String>>>,
    pub vad_threshold: f32,
    pub mic_sample_rate: Arc<std::sync::atomic::AtomicU32>,
    pub loopback_sample_rate: Arc<std::sync::atomic::AtomicU32>,
    pub stt_engine: SttEngineWrapper,
    pub mic_noise_floor: Arc<Mutex<f32>>,
    pub loopback_noise_floor: Arc<Mutex<f32>>,
    pub transcription_worker_active: Arc<std::sync::atomic::AtomicBool>,
}

impl AudioCaptureManager {
    pub fn new() -> Self {
        Self {
            mic_active: Arc::new(Mutex::new(false)),
            loopback_active: Arc::new(Mutex::new(false)),
            mic_pcm_buffer: Arc::new(Mutex::new(Vec::with_capacity(MAX_PCM_SAMPLES))),
            loopback_pcm_buffer: Arc::new(Mutex::new(Vec::with_capacity(MAX_PCM_SAMPLES))),
            last_mic_transcript: Arc::new(Mutex::new(String::new())),
            last_loopback_transcript: Arc::new(Mutex::new(String::new())),
            dialogue_turns: Arc::new(Mutex::new(Vec::new())),
            formatted_dialogue: Arc::new(Mutex::new(String::new())),
            last_speech_timestamp: Arc::new(Mutex::new(0)),
            last_interviewer_speech_ms: Arc::new(Mutex::new(0)),
            last_candidate_speech_ms: Arc::new(Mutex::new(0)),
            auto_assist_enabled: Arc::new(Mutex::new(false)),
            last_error: Arc::new(Mutex::new(None)),
            vad_threshold: DEFAULT_VAD_THRESHOLD,
            mic_sample_rate: Arc::new(std::sync::atomic::AtomicU32::new(16_000)),
            loopback_sample_rate: Arc::new(std::sync::atomic::AtomicU32::new(48_000)),
            stt_engine: SttEngineWrapper::new(Default::default()),
            mic_noise_floor: Arc::new(Mutex::new(0.005)),
            loopback_noise_floor: Arc::new(Mutex::new(0.005)),
            transcription_worker_active: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    pub fn is_active(&self) -> bool {
        *self.mic_active.lock().unwrap() || *self.loopback_active.lock().unwrap()
    }

    pub fn is_mic_active(&self) -> bool {
        *self.mic_active.lock().unwrap()
    }

    pub fn is_loopback_active(&self) -> bool {
        *self.loopback_active.lock().unwrap()
    }

    pub fn set_mic_active(&self, enabled: bool) {
        let mut guard = self.mic_active.lock().unwrap();
        let was_active = *guard;
        *guard = enabled;
        drop(guard);

        if enabled && !was_active {
            self.set_error(None);
            self.start_mic_recording();
            self.ensure_transcription_worker();
        } else if !enabled && was_active {
            let mut buf = self.mic_pcm_buffer.lock().unwrap();
            buf.clear();
        }
    }

    pub fn set_loopback_active(&self, enabled: bool) {
        let mut guard = self.loopback_active.lock().unwrap();
        let was_active = *guard;
        *guard = enabled;
        drop(guard);

        if enabled && !was_active {
            self.set_error(None);
            self.start_loopback_recording();
            self.ensure_transcription_worker();
        } else if !enabled && was_active {
            let mut buf = self.loopback_pcm_buffer.lock().unwrap();
            buf.clear();
        }
    }

    pub fn set_both_active(&self, enabled: bool) {
        self.set_mic_active(enabled);
        self.set_loopback_active(enabled);
    }

    pub fn set_auto_assist(&self, enabled: bool) {
        let mut guard = self.auto_assist_enabled.lock().unwrap();
        *guard = enabled;
    }

    pub fn clear_dialogue(&self) {
        {
            let mut dt = self.dialogue_turns.lock().unwrap();
            dt.clear();
        }
        {
            let mut fd = self.formatted_dialogue.lock().unwrap();
            fd.clear();
        }
        {
            let mut lm = self.last_mic_transcript.lock().unwrap();
            lm.clear();
        }
        {
            let mut ll = self.last_loopback_transcript.lock().unwrap();
            ll.clear();
        }
        {
            let mut mbuf = self.mic_pcm_buffer.lock().unwrap();
            mbuf.clear();
        }
        {
            let mut lbuf = self.loopback_pcm_buffer.lock().unwrap();
            lbuf.clear();
        }
    }

    pub fn consume_current_question(&self) -> String {
        let question = {
            let mut ll = self.last_loopback_transcript.lock().unwrap();
            let q = ll.clone();
            ll.clear();
            q
        };
        {
            let mut its = self.last_interviewer_speech_ms.lock().unwrap();
            *its = 0;
        }
        {
            let mut lbuf = self.loopback_pcm_buffer.lock().unwrap();
            lbuf.clear();
        }
        {
            let mut lm = self.last_mic_transcript.lock().unwrap();
            lm.clear();
        }
        {
            let mut mbuf = self.mic_pcm_buffer.lock().unwrap();
            mbuf.clear();
        }
        {
            let mut fd = self.formatted_dialogue.lock().unwrap();
            fd.clear();
        }
        {
            let mut dt = self.dialogue_turns.lock().unwrap();
            dt.clear();
        }
        question
    }

    pub fn clear_transcripts(&self) {
        {
            let mut ll = self.last_loopback_transcript.lock().unwrap();
            ll.clear();
        }
        {
            let mut its = self.last_interviewer_speech_ms.lock().unwrap();
            *its = 0;
        }
        {
            let mut lm = self.last_mic_transcript.lock().unwrap();
            lm.clear();
        }
        {
            let mut lbuf = self.loopback_pcm_buffer.lock().unwrap();
            lbuf.clear();
        }
        {
            let mut mbuf = self.mic_pcm_buffer.lock().unwrap();
            mbuf.clear();
        }
        {
            let mut fd = self.formatted_dialogue.lock().unwrap();
            fd.clear();
        }
        {
            let mut dt = self.dialogue_turns.lock().unwrap();
            dt.clear();
        }
    }

    /// Spawns a background worker that transcribes both Microphone (Candidate) and Loopback (Interviewer).
    /// Guarded by an atomic flag to prevent spawning duplicate workers.
    pub fn ensure_transcription_worker(&self) {
        // Prevent spawning multiple workers
        if self.transcription_worker_active.swap(true, std::sync::atomic::Ordering::SeqCst) {
            println!("[Audio] Transcription worker already active, skipping duplicate spawn");
            return;
        }

        let mic_active = self.mic_active.clone();
        let loopback_active = self.loopback_active.clone();
        let mic_pcm_buffer = self.mic_pcm_buffer.clone();
        let loopback_pcm_buffer = self.loopback_pcm_buffer.clone();
        let last_mic_transcript = self.last_mic_transcript.clone();
        let last_loopback_transcript = self.last_loopback_transcript.clone();
        let dialogue_turns = self.dialogue_turns.clone();
        let formatted_dialogue = self.formatted_dialogue.clone();
        let last_speech_timestamp = self.last_speech_timestamp.clone();
        let last_interviewer_speech_ms = self.last_interviewer_speech_ms.clone();
        let last_candidate_speech_ms = self.last_candidate_speech_ms.clone();
        let mic_sample_rate_arc = self.mic_sample_rate.clone();
        let loopback_sample_rate_arc = self.loopback_sample_rate.clone();
        let stt_engine = self.stt_engine.clone();
        let worker_flag = self.transcription_worker_active.clone();

        struct WorkerGuard(Arc<std::sync::atomic::AtomicBool>);
        impl Drop for WorkerGuard {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::SeqCst);
                println!("[Audio] Dual-stream background STT worker stopped (guard dropped)");
            }
        }

        std::thread::spawn(move || {
            let _guard = WorkerGuard(worker_flag.clone());
            println!("[Audio] Dual-stream background STT worker spawned");
            let mut loopback_silence_ticks = 0;
            let mut mic_silence_ticks = 0;

            while *mic_active.lock().unwrap() || *loopback_active.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(1200));

                let is_mic_on = *mic_active.lock().unwrap();
                let is_loopback_on = *loopback_active.lock().unwrap();

                if !is_mic_on && !is_loopback_on {
                    break;
                }

                let api_key = if crate::credential_store::has_credential("GROQ") {
                    crate::credential_store::get_credential("GROQ").unwrap_or_default()
                } else if crate::credential_store::has_credential("OPENAI") {
                    crate::credential_store::get_credential("OPENAI").unwrap_or_default()
                } else {
                    String::new()
                };

                if api_key.is_empty() {
                    continue;
                }

                let now_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64;

                // 1. Process Speaker Loopback (Interviewer Audio)
                if is_loopback_on {
                    let (samples, srate) = {
                        let guard = loopback_pcm_buffer.lock().unwrap();
                        (guard.clone(), loopback_sample_rate_arc.load(std::sync::atomic::Ordering::Relaxed))
                    };

                    let min_samples = (srate as f32 * 0.4) as usize;
                    if samples.len() >= min_samples {
                        let rms = crate::stt_engine::calculate_rms(&samples);
                        // Adaptive threshold (calibrated for quiet audio on laptop mics / Zoom)
                        let active_threshold = 0.0020;
                        if rms < active_threshold {
                            loopback_silence_ticks += 1;
                            if loopback_silence_ticks > 4 && samples.len() > (srate as usize * 3) {
                                let mut guard = loopback_pcm_buffer.lock().unwrap();
                                guard.clear();
                                loopback_silence_ticks = 0;
                            }
                        } else {
                            loopback_silence_ticks = 0;
                            let prompt_context = {
                                let guard = last_loopback_transcript.lock().unwrap();
                                if guard.is_empty() { None } else { Some(guard.clone()) }
                            };

                            match stt_engine.transcribe_audio_pcm_with_prompt(&samples, srate, &api_key, prompt_context.as_deref()) {
                                Ok(text) => {
                                    let trimmed = text.trim();
                                    if !trimmed.is_empty() {
                                        #[cfg(debug_assertions)]
                                        println!("[Audio] Interviewer (Loopback): \"{}\"", trimmed);
                                        {
                                            let mut ll_guard = last_loopback_transcript.lock().unwrap();
                                            *ll_guard = merge_transcript(&ll_guard, trimmed);
                                        }
                                        {
                                            let mut ts_guard = last_speech_timestamp.lock().unwrap();
                                            *ts_guard = now_ms;
                                            let mut its_guard = last_interviewer_speech_ms.lock().unwrap();
                                            *its_guard = now_ms;
                                        }
                                        {
                                            let mut turns_guard = dialogue_turns.lock().unwrap();
                                            turns_guard.push(DialogueTurn {
                                                speaker: "Interviewer".to_string(),
                                                text: trimmed.to_string(),
                                                timestamp_ms: now_ms,
                                            });
                                            if turns_guard.len() > 30 {
                                                turns_guard.drain(0..10);
                                            }
                                        }
                                        {
                                            let mut fd_guard = formatted_dialogue.lock().unwrap();
                                            if !fd_guard.is_empty() {
                                                fd_guard.push('\n');
                                            }
                                            fd_guard.push_str(&format!("[Interviewer]: {}", trimmed));
                                        }
                                        let mut guard = loopback_pcm_buffer.lock().unwrap();
                                        let retain_samples = (srate as f32 * 0.25) as usize;
                                        if guard.len() > retain_samples {
                                            let drain_len = guard.len() - retain_samples;
                                            guard.drain(0..drain_len);
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[Audio] Loopback STT error: {}", e);
                                }
                            }
                        }
                    }
                }

                // 2. Process Microphone (Candidate Audio)
                if is_mic_on {
                    let (samples, srate) = {
                        let guard = mic_pcm_buffer.lock().unwrap();
                        (guard.clone(), mic_sample_rate_arc.load(std::sync::atomic::Ordering::Relaxed))
                    };

                    let min_samples = (srate as f32 * 0.4) as usize;
                    if samples.len() >= min_samples {
                        let rms = crate::stt_engine::calculate_rms(&samples);
                        let mic_active_threshold = 0.0020;
                        if rms < mic_active_threshold {
                            mic_silence_ticks += 1;
                            if mic_silence_ticks > 4 && samples.len() > (srate as usize * 3) {
                                let mut guard = mic_pcm_buffer.lock().unwrap();
                                guard.clear();
                                mic_silence_ticks = 0;
                            }
                        } else {
                            mic_silence_ticks = 0;
                            match stt_engine.transcribe_audio_pcm(&samples, srate, &api_key) {
                                Ok(text) => {
                                    let trimmed = text.trim();
                                    if !trimmed.is_empty() {
                                        #[cfg(debug_assertions)]
                                        println!("[Audio] Candidate (Mic): \"{}\"", trimmed);
                                        {
                                            let mut lm_guard = last_mic_transcript.lock().unwrap();
                                            *lm_guard = merge_transcript(&lm_guard, trimmed);
                                        }
                                        {
                                            let mut ts_guard = last_speech_timestamp.lock().unwrap();
                                            *ts_guard = now_ms;
                                            let mut cts_guard = last_candidate_speech_ms.lock().unwrap();
                                            *cts_guard = now_ms;
                                        }
                                        {
                                            let mut turns_guard = dialogue_turns.lock().unwrap();
                                            turns_guard.push(DialogueTurn {
                                                speaker: "Candidate".to_string(),
                                                text: trimmed.to_string(),
                                                timestamp_ms: now_ms,
                                            });
                                            if turns_guard.len() > 30 {
                                                turns_guard.drain(0..10);
                                            }
                                        }
                                        {
                                            let mut fd_guard = formatted_dialogue.lock().unwrap();
                                            if !fd_guard.is_empty() {
                                                fd_guard.push('\n');
                                            }
                                            fd_guard.push_str(&format!("[Candidate]: {}", trimmed));
                                        }
                                        let mut guard = mic_pcm_buffer.lock().unwrap();
                                        let retain_samples = (srate as f32 * 0.25) as usize;
                                        if guard.len() > retain_samples {
                                            let drain_len = guard.len() - retain_samples;
                                            guard.drain(0..drain_len);
                                        }
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[Audio] Mic STT error: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    /// Starts recording candidate audio from default microphone using CPAL WASAPI.
    pub fn start_mic_recording(&self) {
        println!("[Audio] Microphone start requested");
        let active = self.mic_active.clone();
        let pcm_buffer = self.mic_pcm_buffer.clone();
        let last_error = self.last_error.clone();
        let sample_rate_arc = self.mic_sample_rate.clone();

        std::thread::spawn(move || {
            use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

            let host = cpal::default_host();
            let device = match host.default_input_device() {
                Some(d) => d,
                None => {
                    let err_msg = "No default WASAPI microphone found".to_string();
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let device_name = device.name().unwrap_or_else(|_| "Default Microphone".to_string());
            println!("[Audio] Selected microphone: {}", device_name);

            let supported_config = match device.default_input_config() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Failed to get microphone config for '{}': {}", device_name, e);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let sample_rate = supported_config.sample_rate().0;
            sample_rate_arc.store(sample_rate, std::sync::atomic::Ordering::Relaxed);
            let channels = supported_config.channels();
            let sample_format = supported_config.sample_format();

            let pcm_buf = pcm_buffer.clone();
            let err_callback = move |err| {
                eprintln!("[Audio] Microphone stream error: {}", err);
            };

            let stream_config: cpal::StreamConfig = supported_config.into();

            let stream_res = match sample_format {
                cpal::SampleFormat::F32 => device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        process_pcm_samples_f32(data, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                cpal::SampleFormat::I16 => device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let f32_samples: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        process_pcm_samples_f32(&f32_samples, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                cpal::SampleFormat::U16 => device.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let f32_samples: Vec<f32> = data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                        process_pcm_samples_f32(&f32_samples, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                _ => {
                    let err_msg = format!("Unsupported mic audio sample format: {:?}", sample_format);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let stream = match stream_res {
                Ok(s) => s,
                Err(e) => {
                    let err_msg = format!("Failed to build microphone stream for '{}': {}", device_name, e);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                let err_msg = format!("Failed to play microphone stream for '{}': {}", device_name, e);
                eprintln!("[Audio] ERROR: {}", err_msg);
                let mut err = last_error.lock().unwrap();
                *err = Some(err_msg);
                return;
            }

            println!("[Audio] Microphone stream active on '{}'", device_name);

            while *active.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            println!("[Audio] Microphone stream stopped");
        });
    }

    /// Starts capturing interviewer audio from system output / speakers using CPAL WASAPI Loopback.
    pub fn start_loopback_recording(&self) {
        println!("[Audio] Speaker Loopback start requested");
        let active = self.loopback_active.clone();
        let pcm_buffer = self.loopback_pcm_buffer.clone();
        let last_error = self.last_error.clone();
        let sample_rate_arc = self.loopback_sample_rate.clone();

        std::thread::spawn(move || {
            use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

            let host = cpal::default_host();
            let output_device = match host.default_output_device() {
                Some(d) => d,
                None => {
                    let err_msg = "No default WASAPI output speaker device found for loopback".to_string();
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let device_name = output_device.name().unwrap_or_else(|_| "Default Speaker/Headphone".to_string());
            println!("[Audio] Selected loopback output device: {}", device_name);

            let supported_config = match output_device.default_output_config() {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("Failed to get default output config for '{}': {}", device_name, e);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let sample_rate = supported_config.sample_rate().0;
            sample_rate_arc.store(sample_rate, std::sync::atomic::Ordering::Relaxed);
            let channels = supported_config.channels();
            let sample_format = supported_config.sample_format();

            println!(
                "[Audio] Loopback config: sample_rate={}Hz, channels={}, format={:?}",
                sample_rate, channels, sample_format
            );

            let pcm_buf = pcm_buffer.clone();
            let err_callback = move |err| {
                eprintln!("[Audio] Loopback stream error: {}", err);
            };

            let stream_config: cpal::StreamConfig = supported_config.into();

            // On Windows WASAPI host, calling build_input_stream on an output device opens a WASAPI loopback capture stream.
            let stream_res = match sample_format {
                cpal::SampleFormat::F32 => output_device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        process_pcm_samples_f32(data, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                cpal::SampleFormat::I16 => output_device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let f32_samples: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                        process_pcm_samples_f32(&f32_samples, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                cpal::SampleFormat::U16 => output_device.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let f32_samples: Vec<f32> = data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                        process_pcm_samples_f32(&f32_samples, channels, &pcm_buf);
                    },
                    err_callback,
                    None,
                ),
                _ => {
                    let err_msg = format!("Unsupported loopback sample format: {:?}", sample_format);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            let stream = match stream_res {
                Ok(s) => s,
                Err(e) => {
                    let err_msg = format!("Failed to build WASAPI loopback stream for '{}': {}", device_name, e);
                    eprintln!("[Audio] ERROR: {}", err_msg);
                    let mut err = last_error.lock().unwrap();
                    *err = Some(err_msg);
                    return;
                }
            };

            if let Err(e) = stream.play() {
                let err_msg = format!("Failed to play loopback stream for '{}': {}", device_name, e);
                eprintln!("[Audio] ERROR: {}", err_msg);
                let mut err = last_error.lock().unwrap();
                *err = Some(err_msg);
                return;
            }

            println!("[Audio] WASAPI speaker loopback recording active on '{}'", device_name);

            while *active.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            println!("[Audio] WASAPI loopback stream stopped");
        });
    }

    pub fn set_error(&self, err: Option<String>) {
        let mut guard = self.last_error.lock().unwrap();
        *guard = err;
    }

    pub fn get_status(&self) -> AudioCaptureStatus {
        let mic_active = self.is_mic_active();
        let loopback_active = self.is_loopback_active();
        let active = mic_active || loopback_active;

        let last_mic = self.last_mic_transcript.lock().unwrap().clone();
        let last_loopback = self.last_loopback_transcript.lock().unwrap().clone();
        let formatted = self.formatted_dialogue.lock().unwrap().clone();
        let turns = self.dialogue_turns.lock().unwrap().clone();
        let auto_assist = *self.auto_assist_enabled.lock().unwrap();

        let combined_last = if !last_loopback.is_empty() && !last_mic.is_empty() {
            format!("[Interviewer]: {}\n[Candidate]: {}", last_loopback, last_mic)
        } else if !last_loopback.is_empty() {
            format!("[Interviewer]: {}", last_loopback)
        } else {
            last_mic.clone()
        };

        let err = {
            let guard = self.last_error.lock().unwrap();
            guard.clone()
        };

        let total_samples = self.mic_pcm_buffer.lock().unwrap().len() + self.loopback_pcm_buffer.lock().unwrap().len();

        AudioCaptureStatus {
            active,
            mic_active,
            loopback_active,
            stt_supported: SttEngineWrapper::is_stt_supported(),
            device_name: "Dual WASAPI (Mic + Speaker Loopback)".to_string(),
            mic_device_name: "Default Windows Microphone".to_string(),
            loopback_device_name: "Default Windows Speaker Loopback".to_string(),
            sample_rate: self.mic_sample_rate.load(std::sync::atomic::Ordering::Relaxed),
            vad_threshold: self.vad_threshold,
            buffer_samples: total_samples,
            last_speech_timestamp_ms: *self.last_speech_timestamp.lock().unwrap(),
            last_transcript: combined_last,
            last_mic_transcript: last_mic,
            last_loopback_transcript: last_loopback,
            formatted_dialogue: formatted,
            dialogue_turns: turns,
            auto_assist_enabled: auto_assist,
            error_message: err,
        }
    }
}

/// Intelligently merges a new transcript slice into an existing question turn without losing context or repeating words.
pub fn merge_transcript(existing: &str, new_chunk: &str) -> String {
    let existing_trimmed = existing.trim();
    let new_trimmed = new_chunk.trim();

    if existing_trimmed.is_empty() {
        return new_trimmed.to_string();
    }
    if new_trimmed.is_empty() {
        return existing_trimmed.to_string();
    }
    if existing_trimmed == new_trimmed || existing_trimmed.ends_with(new_trimmed) {
        return existing_trimmed.to_string();
    }
    if existing_trimmed.contains(new_trimmed) && new_trimmed.len() > 15 {
        return existing_trimmed.to_string();
    }

    let existing_words: Vec<&str> = existing_trimmed.split_whitespace().collect();
    let new_words: Vec<&str> = new_trimmed.split_whitespace().collect();

    let max_overlap = existing_words.len().min(new_words.len());
    for overlap_len in (1..=max_overlap).rev() {
        let suffix = &existing_words[existing_words.len() - overlap_len..];
        let prefix = &new_words[..overlap_len];
        if suffix.iter().zip(prefix.iter()).all(|(a, b)| a.eq_ignore_ascii_case(b)) {
            let non_overlapping = new_words[overlap_len..].join(" ");
            if non_overlapping.is_empty() {
                return existing_trimmed.to_string();
            }
            return format!("{} {}", existing_trimmed, non_overlapping);
        }
    }

    format!("{} {}", existing_trimmed, new_trimmed)
}

/// Downmixes multi-channel PCM audio to mono f32 and appends to ring buffer.
fn process_pcm_samples_f32(data: &[f32], channels: u16, pcm_buf: &Arc<Mutex<Vec<f32>>>) {
    if data.is_empty() {
        return;
    }

    let mono_samples: Vec<f32> = if channels > 1 {
        let ch = channels as usize;
        data.chunks(ch)
            .map(|chunk| chunk.iter().sum::<f32>() / chunk.len() as f32)
            .collect()
    } else {
        data.to_vec()
    };

    let mut guard = pcm_buf.lock().unwrap();
    guard.extend_from_slice(&mono_samples);
    if guard.len() > MAX_PCM_SAMPLES {
        let overflow = guard.len() - MAX_PCM_SAMPLES;
        guard.drain(0..overflow);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_dual_audio_capture_status() {
        let manager = AudioCaptureManager::new();
        assert!(!manager.is_active());
        assert!(!manager.is_mic_active());
        assert!(!manager.is_loopback_active());

        let status = manager.get_status();
        assert_eq!(status.dialogue_turns.len(), 0);
        assert!(!status.active);
    }

    #[tokio::test]
    async fn test_clear_dialogue() {
        let manager = AudioCaptureManager::new();
        {
            let mut turns = manager.dialogue_turns.lock().unwrap();
            turns.push(DialogueTurn {
                speaker: "Interviewer".to_string(),
                text: "What is Raft consensus?".to_string(),
                timestamp_ms: 1000,
            });
        }
        assert_eq!(manager.dialogue_turns.lock().unwrap().len(), 1);
        manager.clear_dialogue();
        assert_eq!(manager.dialogue_turns.lock().unwrap().len(), 0);
    }
}
