use keyring::Entry;

const SERVICE_NAME: &str = "BackDoorAI";

pub fn normalize_provider(provider: &str) -> Result<String, String> {
    if provider.trim().is_empty() {
        return Err("Provider name cannot be blank".to_string());
    }

    let normalized = provider.trim().to_uppercase();
    match normalized.as_str() {
        "OPENAI" => Ok("OPENAI".to_string()),
        "GEMINI" | "GOOGLE" => Ok("GEMINI".to_string()),
        "ANTHROPIC" | "CLAUDE" => Ok("ANTHROPIC".to_string()),
        "GROQ" => Ok("GROQ".to_string()),
        "OLLAMA" => Ok("OLLAMA".to_string()),
        _ => Err(format!("Unsupported provider: {}", normalized)),
    }
}

fn get_credential_target(provider: &str) -> Result<String, String> {
    let norm = normalize_provider(provider)?;
    let slug = match norm.as_str() {
        "OPENAI" => "openai",
        "GEMINI" => "google",
        "ANTHROPIC" => "anthropic",
        "GROQ" => "groq",
        "OLLAMA" => "ollama",
        _ => "unknown",
    };
    Ok(format!("{}/api-key", slug))
}

pub fn save_credential(provider: &str, api_key: &str) -> Result<(), String> {
    if api_key.trim().is_empty() {
        return Err("API key cannot be blank".to_string());
    }

    let target = get_credential_target(provider)?;
    let entry = Entry::new(SERVICE_NAME, &target).map_err(|e| e.to_string())?;
    
    entry.set_password(api_key.trim()).map_err(|e| {
        format!("Failed to save credential to Windows Credential Manager: {}", e)
    })?;

    Ok(())
}

pub fn delete_credential(provider: &str) -> Result<(), String> {
    let target = get_credential_target(provider)?;
    let entry = Entry::new(SERVICE_NAME, &target).map_err(|e| e.to_string())?;

    match entry.delete_password() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
        Err(e) => Err(format!("Failed to delete credential: {}", e)),
    }
}

pub fn get_credential(provider: &str) -> Result<String, String> {
    let target = get_credential_target(provider)?;
    let entry = Entry::new(SERVICE_NAME, &target).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(pwd) if !pwd.trim().is_empty() => Ok(pwd),
        _ => {
            // Fallback to legacy "MyPersonalAI" service name in Windows Credential Manager
            if let Ok(legacy_entry) = Entry::new("MyPersonalAI", &target) {
                if let Ok(legacy_pwd) = legacy_entry.get_password() {
                    if !legacy_pwd.trim().is_empty() {
                        let _ = entry.set_password(&legacy_pwd);
                        return Ok(legacy_pwd);
                    }
                }
            }
            Err("Credential not found".to_string())
        }
    }
}

pub fn has_credential(provider: &str) -> bool {
    get_credential(provider).map(|pwd| !pwd.trim().is_empty()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_provider() {
        assert_eq!(normalize_provider("OPENAI").unwrap(), "OPENAI");
        assert_eq!(normalize_provider("openai").unwrap(), "OPENAI");
        assert_eq!(normalize_provider("GEMINI").unwrap(), "GEMINI");
        assert_eq!(normalize_provider("google").unwrap(), "GEMINI");
        assert_eq!(normalize_provider("ANTHROPIC").unwrap(), "ANTHROPIC");
        assert_eq!(normalize_provider("claude").unwrap(), "ANTHROPIC");
        assert_eq!(normalize_provider("GROQ").unwrap(), "GROQ");
        assert_eq!(normalize_provider("OLLAMA").unwrap(), "OLLAMA");
        assert_eq!(normalize_provider("ollama").unwrap(), "OLLAMA");
        assert!(normalize_provider("").is_err());
        assert!(normalize_provider("UNKNOWN_PROVIDER").is_err());
    }

    #[test]
    fn test_credential_target_naming() {
        assert_eq!(get_credential_target("OPENAI").unwrap(), "openai/api-key");
        assert_eq!(get_credential_target("GEMINI").unwrap(), "google/api-key");
        assert_eq!(get_credential_target("ANTHROPIC").unwrap(), "anthropic/api-key");
        assert_eq!(get_credential_target("GROQ").unwrap(), "groq/api-key");
        assert_eq!(get_credential_target("OLLAMA").unwrap(), "ollama/api-key");
    }
}
