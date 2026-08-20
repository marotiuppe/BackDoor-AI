use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri::Emitter;

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModelItem>,
}

#[derive(Debug, Deserialize)]
struct OllamaModelItem {
    name: String,
    size: Option<u64>,
    details: Option<OllamaModelDetails>,
}

#[derive(Debug, Deserialize)]
struct OllamaModelDetails {
    parameter_size: Option<String>,
    quantization_level: Option<String>,
}

fn format_size(bytes: u64) -> String {
    if bytes == 0 {
        return "unknown size".to_string();
    }
    let kb = bytes as f64 / 1024.0;
    let mb = kb / 1024.0;
    let gb = mb / 1024.0;
    if gb >= 1.0 {
        format!("{:.2} GB", gb)
    } else if mb >= 1.0 {
        format!("{:.2} MB", mb)
    } else {
        format!("{:.2} KB", kb)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FetchedModel {
    pub id: String,
    pub name: String,
    pub description: String,
}

pub async fn fetch_models_for_provider(provider: &str, api_key: &str) -> Result<Vec<FetchedModel>, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| Client::new());
    let norm = provider.trim().to_uppercase();
    let key = api_key.trim();
    if key.is_empty() && norm != "OLLAMA" {
        return Err("API key is missing. Please enter your API key first.".to_string());
    }

    match norm.as_str() {
        "GEMINI" | "GOOGLE" => {
            let url = "https://generativelanguage.googleapis.com/v1beta/models";
            let res = client
                .get(url)
                .header("x-goog-api-key", key)
                .send()
                .await
                .map_err(|e| format!("Network/Connection Error: Could not reach Gemini API ({})", e))?;

            let status = res.status();
            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                return Err("Invalid API Key: Authentication failed. Please check your Gemini key.".to_string());
            } else if !status.is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Gemini API Error (HTTP {}): {}", status, err_text));
            }

            let data: Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
            let mut list = Vec::new();
            if let Some(models) = data.get("models").and_then(|m| m.as_array()) {
                for m in models {
                    if let Some(name_raw) = m.get("name").and_then(|n| n.as_str()) {
                        let id = name_raw.strip_prefix("models/").unwrap_or(name_raw).to_string();
                        let lower = id.to_lowercase();

                        // Filter out non-chat / utility models like embedding, tts, imagen
                        if lower.contains("embedding") || lower.contains("tts") || lower.contains("imagen") || lower.contains("aqa") {
                            continue;
                        }

                        let supported_methods = m.get("supportedGenerationMethods").and_then(|s| s.as_array());
                        let supports_generate = supported_methods.map_or(true, |methods| {
                            methods.iter().any(|v| v.as_str() == Some("generateContent"))
                        });
                        if supports_generate && (id.starts_with("gemini-") || id.starts_with("learnlm")) {
                            let display_name = m.get("displayName").and_then(|d| d.as_str()).unwrap_or(&id).to_string();
                            let description = m.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string();
                            list.push(FetchedModel {
                                id,
                                name: display_name,
                                description,
                            });
                        }
                    }
                }
            }
            if list.is_empty() {
                // Curated fallback list based on verified production models
                return Ok(vec![
                    FetchedModel { id: "gemini-2.5-flash".to_string(), name: "Gemini 2.5 Flash".to_string(), description: "Flagship fast multimodal reasoning (Recommended)".to_string() },
                    FetchedModel { id: "gemini-1.5-flash".to_string(), name: "Gemini 1.5 Flash".to_string(), description: "High speed multimodal assistance".to_string() },
                    FetchedModel { id: "gemini-1.5-pro".to_string(), name: "Gemini 1.5 Pro".to_string(), description: "Complex system design & long context".to_string() },
                    FetchedModel { id: "gemini-2.0-flash".to_string(), name: "Gemini 2.0 Flash".to_string(), description: "Next-gen experimental flash model".to_string() },
                ]);
            }
            Ok(list)
        }
        "GROQ" => {
            let res = client
                .get("https://api.groq.com/openai/v1/models")
                .bearer_auth(key)
                .send()
                .await
                .map_err(|e| format!("Network/Connection Error: Could not reach Groq API ({})", e))?;

            let status = res.status();
            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                return Err("Invalid API Key: Authentication failed. Please check your Groq key.".to_string());
            } else if !status.is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("Groq API Error (HTTP {}): {}", status, err_text));
            }

            let data: Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
            let mut list = Vec::new();
            if let Some(models) = data.get("data").and_then(|m| m.as_array()) {
                for m in models {
                    if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                        let is_active = m.get("active").and_then(|a| a.as_bool()).unwrap_or(true);
                        // Filter out whisper audio models from chat LLM list
                        if is_active && !id.starts_with("whisper-") {
                            list.push(FetchedModel {
                                id: id.to_string(),
                                name: id.to_string(),
                                description: format!("Groq LPU accelerated inference ({})", id),
                            });
                        }
                    }
                }
            }
            if list.is_empty() {
                return Ok(vec![
                    FetchedModel { id: "llama3-70b-8192".to_string(), name: "LLaMA 3 70B (8k)".to_string(), description: "Ultra-fast LPU inference (Recommended)".to_string() },
                    FetchedModel { id: "llama-3.3-70b-versatile".to_string(), name: "LLaMA 3.3 70B Versatile".to_string(), description: "High accuracy versatile chat".to_string() },
                    FetchedModel { id: "llama3-8b-8192".to_string(), name: "LLaMA 3 8B (8k)".to_string(), description: "Sub-100ms ultra-low latency".to_string() },
                    FetchedModel { id: "mixtral-8x7b-32768".to_string(), name: "Mixtral 8x7B (32k)".to_string(), description: "Large context window fast analysis".to_string() },
                    FetchedModel { id: "deepseek-r1-distill-llama-70b".to_string(), name: "DeepSeek R1 Distill 70B".to_string(), description: "High-level reasoning & coding".to_string() },
                ]);
            }
            Ok(list)
        }
        "OPENAI" => {
            let res = client
                .get("https://api.openai.com/v1/models")
                .bearer_auth(key)
                .send()
                .await
                .map_err(|e| format!("Network/Connection Error: Could not reach OpenAI API ({})", e))?;

            let status = res.status();
            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                return Err("Invalid API Key: Authentication failed. Please check your OpenAI key.".to_string());
            } else if !status.is_success() {
                let err_text = res.text().await.unwrap_or_default();
                return Err(format!("OpenAI API Error (HTTP {}): {}", status, err_text));
            }

            let data: Value = res.json().await.map_err(|e| format!("JSON parse error: {}", e))?;
            let mut list = Vec::new();
            if let Some(models) = data.get("data").and_then(|m| m.as_array()) {
                for m in models {
                    if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                        let lower = id.to_lowercase();
                        // Filter to chat/text models, excluding tts, whisper, dall-e, text-embedding
                        if (id.starts_with("gpt-") || id.starts_with("o1") || id.starts_with("o3") || id.starts_with("o4") || id.starts_with("chatgpt"))
                            && !lower.contains("tts") && !lower.contains("whisper") && !lower.contains("dall-e") && !lower.contains("embedding") {
                            list.push(FetchedModel {
                                id: id.to_string(),
                                name: id.to_string(),
                                description: format!("OpenAI model ({})", id),
                            });
                        }
                    }
                }
            }
            if list.is_empty() {
                return Ok(vec![
                    FetchedModel { id: "gpt-4o".to_string(), name: "GPT-4o (Omni)".to_string(), description: "Flagship multimodal vision & reasoning (Recommended)".to_string() },
                    FetchedModel { id: "gpt-4o-mini".to_string(), name: "GPT-4o Mini".to_string(), description: "Fast, lightweight and cost effective".to_string() },
                    FetchedModel { id: "o3-mini".to_string(), name: "o3-mini Reasoning".to_string(), description: "Fast STEM & coding reasoning".to_string() },
                ]);
            }
            list.sort_by(|a, b| b.id.cmp(&a.id));
            Ok(list)
        }
        "ANTHROPIC" | "CLAUDE" => {
            // Anthropic key validation check via test header
            let test_payload = json!({
                "model": "claude-3-5-sonnet-20241022",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "ping"}]
            });
            let res = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", key)
                .header("anthropic-version", "2023-06-01")
                .json(&test_payload)
                .send()
                .await
                .map_err(|e| format!("Network/Connection Error: Could not reach Anthropic API ({})", e))?;

            let status = res.status();
            if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
                return Err("Invalid API Key: Authentication failed. Please check your Anthropic key.".to_string());
            }

            Ok(vec![
                FetchedModel {
                    id: "claude-3-5-sonnet-20241022".to_string(),
                    name: "Claude 3.5 Sonnet v2".to_string(),
                    description: "Precision code generation & writing (Recommended)".to_string(),
                },
                FetchedModel {
                    id: "claude-3-5-haiku-20241022".to_string(),
                    name: "Claude 3.5 Haiku".to_string(),
                    description: "Ultra-fast responsive assistance".to_string(),
                },
                FetchedModel {
                    id: "claude-3-opus-20240229".to_string(),
                    name: "Claude 3 Opus".to_string(),
                    description: "Frontier reasoning & complex coding".to_string(),
                },
            ])
        }
        "OLLAMA" => {
            let base_url = if key.is_empty() {
                "http://localhost:11434"
            } else {
                key
            };
            let endpoint = format!("{}/api/tags", base_url.trim_end_matches('/'));
            
            match client.get(&endpoint).send().await {
                Ok(res) => {
                    if res.status().is_success() {
                        if let Ok(tags_res) = res.json::<OllamaTagsResponse>().await {
                            let mut list = Vec::new();
                            for item in tags_res.models {
                                let size_str = format_size(item.size.unwrap_or(0));
                                let details = item.details.unwrap_or(OllamaModelDetails {
                                    parameter_size: None,
                                    quantization_level: None,
                                });
                                let param_str = details.parameter_size.unwrap_or_else(|| "unknown".to_string());
                                let quant_str = details.quantization_level.unwrap_or_else(|| "unknown".to_string());
                                list.push(FetchedModel {
                                    id: item.name.clone(),
                                    name: item.name.clone(),
                                    description: format!("Local Ollama model (Size: {}, Params: {}, Quant: {})", size_str, param_str, quant_str),
                                });
                            }
                            if !list.is_empty() {
                                return Ok(list);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[ai_provider] Failed to fetch local Ollama models: {}", e);
                }
            }

            // Fallback if Ollama tags call fails or returns empty
            Ok(vec![
                FetchedModel {
                    id: "gemma4:31b-cloud".to_string(),
                    name: "Gemma 4 (31B Cloud)".to_string(),
                    description: "Local Ollama cloud model (Recommended fallback)".to_string(),
                },
                FetchedModel {
                    id: "llama3.3:latest".to_string(),
                    name: "LLaMA 3.3 (Flagship)".to_string(),
                    description: "Standard LLaMA 3.3 70B local model fallback".to_string(),
                },
                FetchedModel {
                    id: "deepseek-r1:8b".to_string(),
                    name: "DeepSeek R1 8B".to_string(),
                    description: "Local reasoning model fallback".to_string(),
                },
                FetchedModel {
                    id: "qwen2.5-coder:latest".to_string(),
                    name: "Qwen 2.5 Coder".to_string(),
                    description: "Local code generation model fallback".to_string(),
                }
            ])
        }
        _ => Err(format!("Unsupported provider for fetching models: {}", provider)),
    }
}

pub fn safe_clean_model_id(model: &str, default_fallback: &str) -> String {
    let clean = model.trim();
    if clean.is_empty() {
        default_fallback.to_string()
    } else {
        clean.to_string()
    }
}

pub async fn stream_openai_response(
    app_handle: AppHandle,
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    event_name: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| Client::new());
    let valid_model = safe_clean_model_id(model, "gpt-4o");

    // Map messages with multimodal vision support
    let mut formatted_messages = Vec::new();
    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let text = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        let image_b64 = msg.get("image_base64").and_then(|i| i.as_str());

        if let Some(b64) = image_b64 {
            if !b64.trim().is_empty() {
                formatted_messages.push(json!({
                    "role": role,
                    "content": [
                        { "type": "text", "text": text },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/jpeg;base64,{}", b64.trim())
                            }
                        }
                    ]
                }));
                continue;
            }
        }

        formatted_messages.push(json!({
            "role": role,
            "content": text
        }));
    }

    let payload = json!({
        "model": valid_model,
        "messages": formatted_messages,
        "stream": true,
    });

    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("OpenAI network error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("OpenAI Error (HTTP {}): {}", status, err_text));
    }

    let mut response = res.bytes_stream().eventsource();
    let mut full_content = String::new();
    let mut last_stream_error: Option<String> = None;

    while let Some(event_result) = response.next().await {
        match event_result {
            Ok(event) => {
                let data = event.data;
                if data == "[DONE]" {
                    break;
                }

                if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    full_content.push_str(content);
                                    let _ = app_handle.emit(event_name, content);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("OpenAI EventSource error: {}", e);
                last_stream_error = Some(format!("Stream interrupted: {}", e));
            }
        }
    }

    if full_content.is_empty() {
        if let Some(err) = last_stream_error {
            return Err(err);
        }
    }

    Ok(full_content)
}

pub async fn stream_groq_response(
    app_handle: AppHandle,
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    event_name: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| Client::new());
    let valid_model = safe_clean_model_id(model, "llama3-70b-8192");

    // Strip image_base64 fields — Groq doesn't support multimodal vision
    let formatted_messages: Vec<Value> = messages
        .into_iter()
        .map(|msg| {
            let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
            let text = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
            json!({ "role": role, "content": text })
        })
        .collect();

    let payload = json!({
        "model": valid_model,
        "messages": formatted_messages,
        "stream": true,
    });

    let res = client
        .post("https://api.groq.com/openai/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Groq network error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Groq Error (HTTP {}): {}", status, err_text));
    }

    let mut response = res.bytes_stream().eventsource();
    let mut full_content = String::new();
    let mut last_stream_error: Option<String> = None;

    while let Some(event_result) = response.next().await {
        match event_result {
            Ok(event) => {
                let data = event.data;
                if data == "[DONE]" {
                    break;
                }

                if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    full_content.push_str(content);
                                    let _ = app_handle.emit(event_name, content);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Groq EventSource error: {}", e);
                last_stream_error = Some(format!("Stream interrupted: {}", e));
            }
        }
    }

    if full_content.is_empty() {
        if let Some(err) = last_stream_error {
            return Err(err);
        }
    }

    Ok(full_content)
}

pub async fn stream_gemini_response(
    app_handle: AppHandle,
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    event_name: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| Client::new());
    let valid_model = safe_clean_model_id(model, "gemini-2.5-flash");

    let mut contents = Vec::new();
    let mut system_instruction_text = String::new();

    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let text = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        let image_b64 = msg.get("image_base64").and_then(|i| i.as_str());

        if role == "system" {
            if !system_instruction_text.is_empty() {
                system_instruction_text.push_str("\n\n");
            }
            system_instruction_text.push_str(text);
            continue;
        }

        let gemini_role = if role == "assistant" { "model" } else { "user" };
        let mut parts = Vec::new();
        if !text.trim().is_empty() {
            parts.push(json!({ "text": text }));
        }

        if let Some(b64) = image_b64 {
            if !b64.trim().is_empty() {
                parts.push(json!({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": b64.trim()
                    }
                }));
            }
        }

        if !parts.is_empty() {
            contents.push(json!({
                "role": gemini_role,
                "parts": parts
            }));
        }
    }

    let mut payload_map = serde_json::Map::new();
    payload_map.insert("contents".to_string(), json!(contents));
    if !system_instruction_text.is_empty() {
        payload_map.insert(
            "system_instruction".to_string(),
            json!({
                "parts": [{ "text": system_instruction_text }]
            }),
        );
    }
    let payload = Value::Object(payload_map);

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse",
        valid_model
    );

    let res = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Gemini network error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Gemini API Error (HTTP {}): {}", status, err_text));
    }

    let mut response = res.bytes_stream().eventsource();
    let mut full_content = String::new();
    let mut last_stream_error: Option<String> = None;

    while let Some(event_result) = response.next().await {
        match event_result {
            Ok(event) => {
                let data = event.data;
                if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                    if let Some(candidates) = parsed.get("candidates").and_then(|c| c.as_array()) {
                        if let Some(candidate) = candidates.get(0) {
                            if let Some(content) = candidate.get("content") {
                                if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                                    for part in parts {
                                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                            full_content.push_str(text);
                                            let _ = app_handle.emit(event_name, text);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Gemini EventSource error: {}", e);
                last_stream_error = Some(format!("Stream interrupted: {}", e));
            }
        }
    }

    if full_content.is_empty() {
        if let Some(err) = last_stream_error {
            return Err(err);
        }
    }

    Ok(full_content)
}

pub async fn stream_anthropic_response(
    app_handle: AppHandle,
    api_key: &str,
    model: &str,
    messages: Vec<Value>,
    event_name: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| Client::new());

    let mut anthropic_messages = Vec::new();
    let mut system_prompt = String::new();

    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let text = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        let image_b64 = msg.get("image_base64").and_then(|i| i.as_str());

        if role == "system" {
            if !system_prompt.is_empty() {
                system_prompt.push_str("\n\n");
            }
            system_prompt.push_str(text);
        } else if let Some(b64) = image_b64 {
            if !b64.trim().is_empty() {
                anthropic_messages.push(json!({
                    "role": role,
                    "content": [
                        { "type": "text", "text": text },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": b64.trim()
                            }
                        }
                    ]
                }));
            } else {
                anthropic_messages.push(json!({
                    "role": role,
                    "content": text
                }));
            }
        } else {
            anthropic_messages.push(json!({
                "role": role,
                "content": text
            }));
        }
    }

    let valid_model = safe_clean_model_id(model, "claude-3-5-sonnet-20241022");
    let mut payload_map = serde_json::Map::new();
    payload_map.insert("model".to_string(), json!(valid_model));
    payload_map.insert("max_tokens".to_string(), json!(4096));
    payload_map.insert("messages".to_string(), json!(anthropic_messages));
    payload_map.insert("stream".to_string(), json!(true));
    if !system_prompt.is_empty() {
        payload_map.insert("system".to_string(), json!(system_prompt));
    }
    let payload = Value::Object(payload_map);

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Anthropic network error: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Anthropic API Error (HTTP {}): {}", status, err_text));
    }

    let mut response = res.bytes_stream().eventsource();
    let mut full_content = String::new();
    let mut last_stream_error: Option<String> = None;

    while let Some(event_result) = response.next().await {
        match event_result {
            Ok(event) => {
                let data = event.data;
                if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                    if let Some(event_type) = parsed.get("type").and_then(|t| t.as_str()) {
                        if event_type == "content_block_delta" {
                            if let Some(delta) = parsed.get("delta") {
                                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                    full_content.push_str(text);
                                    let _ = app_handle.emit(event_name, text);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Anthropic EventSource error: {}", e);
                last_stream_error = Some(format!("Stream interrupted: {}", e));
            }
        }
    }

    if full_content.is_empty() {
        if let Some(err) = last_stream_error {
            return Err(err);
        }
    }

    Ok(full_content)
}

pub async fn stream_ollama_response(
    app_handle: AppHandle,
    base_url: &str,
    model: &str,
    messages: Vec<Value>,
    event_name: &str,
) -> Result<String, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| Client::new());
    
    let resolved_url = if base_url.trim().is_empty() {
        "http://localhost:11434"
    } else {
        base_url.trim()
    };
    
    let valid_model = if model.trim().is_empty() {
        "gemma4:31b-cloud"
    } else {
        model.trim()
    };

    let mut formatted_messages = Vec::new();
    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let text = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        let image_b64 = msg.get("image_base64").and_then(|i| i.as_str());

        if let Some(b64) = image_b64 {
            if !b64.trim().is_empty() {
                formatted_messages.push(json!({
                    "role": role,
                    "content": [
                        { "type": "text", "text": text },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:image/jpeg;base64,{}", b64.trim())
                            }
                        }
                    ]
                }));
                continue;
            }
        }

        formatted_messages.push(json!({
            "role": role,
            "content": text
        }));
    }

    let payload = json!({
        "model": valid_model,
        "messages": formatted_messages,
        "stream": true,
    });

    let endpoint = format!("{}/v1/chat/completions", resolved_url);
    let res = client
        .post(&endpoint)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Failed to reach local Ollama server at {}. Check if Ollama is running. ({})", resolved_url, e))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("Ollama Error (HTTP {}): {}", status, err_text));
    }

    let mut response = res.bytes_stream().eventsource();
    let mut full_content = String::new();
    let mut last_stream_error: Option<String> = None;

    while let Some(event_result) = response.next().await {
        match event_result {
            Ok(event) => {
                let data = event.data;
                if data == "[DONE]" {
                    break;
                }

                if let Ok(parsed) = serde_json::from_str::<Value>(&data) {
                    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    full_content.push_str(content);
                                    let _ = app_handle.emit(event_name, content);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Ollama EventSource error: {}", e);
                last_stream_error = Some(format!("Stream interrupted: {}", e));
            }
        }
    }

    if full_content.is_empty() {
        if let Some(err) = last_stream_error {
            return Err(err);
        }
    }

    Ok(full_content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_clean_model_id_passthrough() {
        // Verifies 100% exact model ID preservation without silent transformation
        assert_eq!(safe_clean_model_id("gemini-2.5-flash", "gemini-2.5-flash"), "gemini-2.5-flash");
        assert_eq!(safe_clean_model_id("gemini-1.5-flash", "gemini-2.5-flash"), "gemini-1.5-flash");
        assert_eq!(safe_clean_model_id("llama3-70b-8192", "llama3-70b-8192"), "llama3-70b-8192");
        assert_eq!(safe_clean_model_id("gpt-4o", "gpt-4o"), "gpt-4o");
        assert_eq!(safe_clean_model_id("claude-3-5-sonnet-20241022", "claude-3-5-sonnet-20241022"), "claude-3-5-sonnet-20241022");
    }

    #[test]
    fn test_safe_clean_model_id_empty_fallback() {
        assert_eq!(safe_clean_model_id("", "gemini-2.5-flash"), "gemini-2.5-flash");
        assert_eq!(safe_clean_model_id("   ", "llama3-70b-8192"), "llama3-70b-8192");
    }
}
