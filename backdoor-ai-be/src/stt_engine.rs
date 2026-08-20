use std::io::Cursor;
use reqwest::blocking::multipart;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct SttEngineConfig {
    pub sample_rate: u32,
    pub vad_threshold: f32,
}

impl Default for SttEngineConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            vad_threshold: 0.015,
        }
    }
}

#[derive(Debug, Clone)]
pub struct SttEngineWrapper {
    pub config: SttEngineConfig,
}

#[derive(Deserialize)]
struct GroqWhisperResponse {
    text: String,
}

impl SttEngineWrapper {
    pub fn new(config: SttEngineConfig) -> Self {
        Self { config }
    }

    /// Checks whether local Speech-to-Text is supported (always true now via Cloud API).
    pub fn is_stt_supported() -> bool {
        true
    }

    pub fn detect_model_status(&self) -> (bool, String) {
        (true, "Groq Whisper API Available".to_string())
    }

    /// Performs Cloud Speech-to-Text transcription on an in-memory PCM sample buffer.
    pub fn transcribe_audio_pcm(&self, pcm_samples: &[f32], sample_rate: u32, api_key: &str) -> Result<String, String> {
        self.transcribe_audio_pcm_with_prompt(pcm_samples, sample_rate, api_key, None)
    }

    /// Performs Cloud Speech-to-Text transcription with optional prompt context for continuous speech continuation.
    pub fn transcribe_audio_pcm_with_prompt(
        &self,
        pcm_samples: &[f32],
        sample_rate: u32,
        api_key: &str,
        prompt_context: Option<&str>,
    ) -> Result<String, String> {
        if pcm_samples.is_empty() {
            return Ok(String::new());
        }

        if api_key.trim().is_empty() {
            return Err("Groq API key is missing. Please configure it in the Settings panel.".to_string());
        }

        let rms = calculate_rms(pcm_samples);
        println!("[STT] Transcription started (samples: {}, RMS: {:.5})", pcm_samples.len(), rms);

        // Resample to 16kHz if needed (Whisper prefers 16kHz) with DSP Anti-Aliasing
        let samples_16k: Vec<f32> = if sample_rate != 16000 && sample_rate > 0 {
            let ratio = 16000.0 / sample_rate as f64;
            
            // 1. Moving Average Anti-Aliasing Filter
            let window_size = (1.0 / ratio).ceil() as usize;
            let mut filtered = Vec::with_capacity(pcm_samples.len());
            if window_size > 1 {
                let mut sum = 0.0;
                for (i, &sample) in pcm_samples.iter().enumerate() {
                    sum += sample;
                    if i >= window_size {
                        sum -= pcm_samples[i - window_size];
                    }
                    let count = (i + 1).min(window_size) as f32;
                    filtered.push(sum / count);
                }
            } else {
                filtered = pcm_samples.to_vec();
            }

            // 2. Linear Interpolation Downsampling
            let new_len = (pcm_samples.len() as f64 * ratio) as usize;
            let mut resampled = Vec::with_capacity(new_len);
            for i in 0..new_len {
                let exact_idx = i as f64 / ratio;
                let idx1 = exact_idx.floor() as usize;
                let idx2 = (idx1 + 1).min(filtered.len() - 1);
                let fraction = (exact_idx - idx1 as f64) as f32;
                
                let val1 = filtered[idx1];
                let val2 = filtered[idx2];
                let interpolated = val1 + fraction * (val2 - val1);
                resampled.push(interpolated);
            }
            resampled
        } else {
            pcm_samples.to_vec()
        };

        // Encode to WAV in memory
        let mut wav_buffer = Vec::new();
        {
            let cursor = Cursor::new(&mut wav_buffer);
            let spec = hound::WavSpec {
                channels: 1,
                sample_rate: 16000,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut writer = hound::WavWriter::new(cursor, spec).map_err(|e| format!("WAV write error: {}", e))?;
            for &sample in &samples_16k {
                let scaled = (sample * i16::MAX as f32).clamp(i16::MIN as f32, i16::MAX as f32) as i16;
                writer.write_sample(scaled).map_err(|e| format!("WAV sample error: {}", e))?;
            }
            writer.finalize().map_err(|e| format!("WAV finalize error: {}", e))?;
        }

        // Check whether this is an OpenAI key (starts with sk-) or Groq key (starts with gsk_)
        let is_openai = api_key.starts_with("sk-proj-") || (api_key.starts_with("sk-") && !api_key.starts_with("gsk_"));
        
        let (endpoint, default_model) = if is_openai {
            ("https://api.openai.com/v1/audio/transcriptions", "whisper-1")
        } else {
            ("https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3-turbo")
        };

        let selected_model = if is_openai {
            "whisper-1"
        } else {
            // Groq models: whisper-large-v3-turbo, whisper-large-v3, distil-whisper-large-v3-en
            default_model
        };

        // Post to API
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(10))
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        let part = multipart::Part::bytes(wav_buffer)
            .file_name("audio.wav")
            .mime_str("audio/wav")
            .map_err(|e| e.to_string())?;
            
        let mut form = multipart::Form::new()
            .text("model", selected_model)
            .text("language", "en")
            .part("file", part);

        if let Some(ctx) = prompt_context {
            if !ctx.trim().is_empty() {
                // Pass last ~200 chars to Whisper prompt safely using char boundaries
                let prompt_str = if ctx.chars().count() > 200 {
                    match ctx.char_indices().rev().nth(199) {
                        Some((idx, _)) => &ctx[idx..],
                        None => ctx,
                    }
                } else {
                    ctx
                };
                form = form.text("prompt", prompt_str.to_string());
            }
        }

        let res = client.post(endpoint)
            .bearer_auth(api_key.trim())
            .multipart(form)
            .send()
            .map_err(|e| format!("STT API network error: {}", e))?;

        if !res.status().is_success() {
            let err_text = res.text().unwrap_or_default();
            eprintln!("[STT] API Failed: {}", err_text);
            return Err(format!("STT API Error: {}", err_text));
        }

        let parsed: GroqWhisperResponse = res.json().map_err(|e| format!("JSON parse error: {}", e))?;
        
        let mut trimmed = parsed.text.trim().to_string();
        
        // Comprehensive Whisper silence artifact and hallucination filtering
        let artifacts = [
            "[BLANK_AUDIO]",
            "[Silence]",
            "[Music]",
            "[Applause]",
            "[Laughter]",
            "Thank you for watching.",
            "Thank you for watching",
            "Thanks for watching.",
            "Thanks for watching",
            "Please subscribe.",
            "Please subscribe",
            "Subtitles by",
            "Subtitle by",
        ];
        for art in &artifacts {
            trimmed = trimmed.replace(art, "").trim().to_string();
        }
        
        if trimmed == "Thank you." || trimmed == "Thanks." || trimmed == "." {
            trimmed.clear();
        }
        
        println!("[STT] Transcription completed (length: {} chars)", trimmed.len());
        #[cfg(debug_assertions)]
        if !trimmed.is_empty() {
            println!("[STT] transcript: '{}'", trimmed);
        }
        
        Ok(trimmed)
    }
}

pub fn calculate_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_squares: f32 = samples.iter().map(|&s| s * s).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

pub fn compute_transcript_similarity(s1: &str, s2: &str) -> f64 {
    crate::text_utils::compute_string_similarity(s1, s2)
}

pub fn is_duplicate_transcript(previous: &str, current: &str, change_threshold: f64) -> bool {
    crate::text_utils::is_duplicate_transcript(previous, current, change_threshold)
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_utf8_prompt_context_slicing() {
        // Multi-byte unicode string (curly quotes, emojis, non-ASCII accents)
        let ctx = "Candidate explained Java finalize() with smart quotes “test” and accents café 😊 ".repeat(5);
        assert!(ctx.chars().count() > 200);

        // Verify slicing at char index boundary does not panic
        let prompt_str = if ctx.chars().count() > 200 {
            match ctx.char_indices().rev().nth(199) {
                Some((idx, _)) => &ctx[idx..],
                None => &ctx,
            }
        } else {
            &ctx
        };

        assert!(prompt_str.len() <= ctx.len());
        assert!(!prompt_str.is_empty());
    }
}
