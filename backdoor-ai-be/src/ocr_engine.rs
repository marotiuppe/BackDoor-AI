#[cfg(target_os = "windows")]
use windows::core::HSTRING;
#[cfg(target_os = "windows")]
use windows::Globalization::Language;
#[cfg(target_os = "windows")]
use windows::Graphics::Imaging::SoftwareBitmap;
#[cfg(target_os = "windows")]
use windows::Media::Ocr::OcrEngine;

#[cfg(not(target_os = "windows"))]
pub struct SoftwareBitmap; // Dummy type to satisfy type checker on non-Windows platforms

pub struct OcrEngineWrapper;

#[cfg(target_os = "windows")]
impl OcrEngineWrapper {
    /// Checks if Windows native WinRT OCR is supported for the current user language or standard fallback.
    pub fn is_ocr_supported() -> bool {
        if OcrEngine::TryCreateFromUserProfileLanguages().is_ok() {
            return true;
        }
        if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("en-US")) {
            if OcrEngine::IsLanguageSupported(&lang).unwrap_or(false) {
                return true;
            }
        }
        false
    }

    /// Safely gets or creates an OCR engine with fallbacks.
    fn get_engine() -> Result<OcrEngine, String> {
        if let Ok(engine) = OcrEngine::TryCreateFromUserProfileLanguages() {
            return Ok(engine);
        }

        // Fallback 1: Try en-US
        if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("en-US")) {
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
                return Ok(engine);
            }
        }

        // Fallback 2: Try en-GB
        if let Ok(lang) = Language::CreateLanguage(&HSTRING::from("en-GB")) {
            if let Ok(engine) = OcrEngine::TryCreateFromLanguage(&lang) {
                return Ok(engine);
            }
        }

        Err("No supported Windows OCR language found. Please ensure Windows English Language Pack is installed.".to_string())
    }

    /// Extracts recognized text from a WinRT SoftwareBitmap image buffer safely.
    pub fn extract_text_from_bitmap(bitmap: &SoftwareBitmap) -> Result<String, String> {
        let bitmap_ref = std::panic::AssertUnwindSafe(bitmap);
        let result = std::panic::catch_unwind(move || {
            let engine = Self::get_engine()?;

            let async_op = engine
                .RecognizeAsync(*bitmap_ref)
                .map_err(|e| format!("OcrEngine RecognizeAsync error: {}", e))?;

            let ocr_result = async_op
                .get()
                .map_err(|e| format!("OcrEngine result error: {}", e))?;

            let text = ocr_result
                .Text()
                .map_err(|e| format!("Failed to extract OCR text: {}", e))?;

            Ok(text.to_string())
        });

        match result {
            Ok(res) => res,
            Err(_) => Err("WinRT OCR panic recovered".to_string()),
        }
    }
}

#[cfg(not(target_os = "windows"))]
impl OcrEngineWrapper {
    /// Checks if Windows native WinRT OCR is supported for the current user language or standard fallback.
    pub fn is_ocr_supported() -> bool {
        false
    }

    /// Extracts recognized text from a WinRT SoftwareBitmap image buffer safely.
    pub fn extract_text_from_bitmap(_bitmap: &SoftwareBitmap) -> Result<String, String> {
        Err("OCR is not supported on this platform".to_string())
    }
}

/// Re-export shared text similarity functions from text_utils module.
pub fn compute_string_similarity(s1: &str, s2: &str) -> f64 {
    crate::text_utils::compute_string_similarity(s1, s2)
}

/// Returns true if current text is significantly different from previous text (similarity < (1.0 - threshold)).
pub fn is_significantly_different(previous: &str, current: &str, change_threshold: f64) -> bool {
    crate::text_utils::is_significantly_different(previous, current, change_threshold)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_string_similarity_exact_match() {
        let sim = compute_string_similarity("Hello World", "Hello World");
        assert_eq!(sim, 1.0);
    }

    #[test]
    fn test_compute_string_similarity_different_strings() {
        let sim = compute_string_similarity("Java 21 Spring Boot", "Rust Tauri Application");
        assert!(sim < 0.3);
    }

    #[test]
    fn test_is_significantly_different_detects_changes() {
        let prev = "User editing KafkaProducer.java";
        let curr = "User editing KafkaProducer.java with new method";
        // Changes should be detected with a 10% threshold (0.1)
        assert!(is_significantly_different(prev, curr, 0.1));

        // Minor whitespace change should NOT trigger significant difference
        let minor = "User editing KafkaProducer.java ";
        assert!(!is_significantly_different(prev, minor, 0.1));
    }
}
