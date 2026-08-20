/// Shared text utility functions for string similarity and comparison.
/// Used by both OCR deduplication and STT transcript comparison.

/// Computes string similarity using normalized Levenshtein distance (returns value between 0.0 and 1.0).
pub fn compute_string_similarity(s1: &str, s2: &str) -> f64 {
    let s1_trimmed = s1.trim();
    let s2_trimmed = s2.trim();

    if s1_trimmed.is_empty() && s2_trimmed.is_empty() {
        return 1.0;
    }
    if s1_trimmed.is_empty() || s2_trimmed.is_empty() {
        return 0.0;
    }
    if s1_trimmed == s2_trimmed {
        return 1.0;
    }

    let len1 = s1_trimmed.chars().count();
    let len2 = s2_trimmed.chars().count();
    let max_len = len1.max(len2);

    let dist = levenshtein_distance(s1_trimmed, s2_trimmed);
    1.0 - (dist as f64 / max_len as f64)
}

/// Returns true if current text is significantly different from previous text (similarity < (1.0 - threshold)).
pub fn is_significantly_different(previous: &str, current: &str, change_threshold: f64) -> bool {
    let similarity = compute_string_similarity(previous, current);
    let difference = 1.0 - similarity;
    difference >= change_threshold
}

/// Returns true if the current transcript is a near-duplicate of the previous (difference < threshold).
pub fn is_duplicate_transcript(previous: &str, current: &str, change_threshold: f64) -> bool {
    let similarity = compute_string_similarity(previous, current);
    let difference = 1.0 - similarity;
    difference < change_threshold
}

fn levenshtein_distance(s1: &str, s2: &str) -> usize {
    let v1: Vec<char> = s1.chars().collect();
    let v2: Vec<char> = s2.chars().collect();

    let len1 = v1.len();
    let len2 = v2.len();

    let mut column: Vec<usize> = (0..=len2).collect();

    for i in 1..=len1 {
        let mut previous_diagonal = column[0];
        column[0] = i;

        for j in 1..=len2 {
            let old_column_j = column[j];
            let cost = if v1[i - 1] == v2[j - 1] { 0 } else { 1 };
            column[j] = (column[j] + 1)
                .min(column[j - 1] + 1)
                .min(previous_diagonal + cost);
            previous_diagonal = old_column_j;
        }
    }

    column[len2]
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
        assert!(is_significantly_different(prev, curr, 0.1));

        let minor = "User editing KafkaProducer.java ";
        assert!(!is_significantly_different(prev, minor, 0.1));
    }

    #[test]
    fn test_is_duplicate_transcript() {
        assert!(is_duplicate_transcript("hello world", "hello world", 0.1));
        assert!(!is_duplicate_transcript("hello world", "goodbye world", 0.1));
    }
}
