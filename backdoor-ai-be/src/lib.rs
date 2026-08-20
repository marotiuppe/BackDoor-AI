pub mod ai_provider;
pub mod audio_capture;
pub mod commands;
pub mod context_orchestrator;
pub mod credential_store;
pub mod database;
pub mod ocr_engine;
pub mod overlay_manager;
pub mod port_picker;
pub mod process_manager;
pub mod qdrant_client;
pub mod screen_capture;
pub mod stt_engine;
pub mod text_utils;

use crate::database::{Conversation, Message};
use audio_capture::AudioCaptureManager;
use commands::{
    capture_screen_test, capture_screen_vision_snapshot, clear_dialogue_history, create_star_story,
    delete_mock_interview_session, delete_provider_credential, delete_star_story,
    dispatch_screen_snippet, get_audio_capture_status, get_overlay_status,
    get_provider_credential_status, get_screen_capture_status, get_sidecar_info, hide_overlay,
    install_ollama, list_mock_interview_sessions, list_star_stories, pull_ollama_model,
    save_mock_interview_session, save_provider_credential, set_auto_assist,
    set_overlay_capture_exclusion, show_overlay, test_microphone_capture,
    test_speaker_loopback_capture, toggle_audio_capture, toggle_both_audio_capture,
    toggle_loopback_capture, toggle_overlay, toggle_screen_capture, AppState,
};
use overlay_manager::OverlayManager;
use process_manager::ProcessManager;
use screen_capture::ScreenCaptureManager;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelDescriptor {
    pub model_id: String,
    pub display_name: String,
    pub default_model: bool,
    pub context_window: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMetadata {
    pub provider_name: String,
    pub configured: bool,
    pub healthy: bool,
    pub status_message: String,
    pub capabilities: Vec<String>,
    pub supported_models: Vec<ModelDescriptor>,
    pub default_model: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateConversationInput {
    pub title: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponseDto {
    pub user_message: Message,
    pub assistant_message: Message,
}

// ---- Native Tauri Commands for Desktop Assistant ----

#[tauri::command]
fn get_providers() -> Result<Vec<ProviderMetadata>, String> {
    let providers = vec![
        ProviderMetadata {
            provider_name: "GEMINI".to_string(),
            configured: crate::credential_store::has_credential("GEMINI"),
            healthy: true,
            status_message: "Google Gemini 3.7 Flash, 3.6, 3.5 & 3.1 Pro ready".to_string(),
            capabilities: vec![
                "chat".to_string(),
                "multimodal".to_string(),
                "streaming".to_string(),
                "thinking".to_string(),
            ],
            supported_models: vec![
                ModelDescriptor {
                    model_id: "gemini-3.7-flash".to_string(),
                    display_name: "Gemini 3.7 Flash Medium (Fast)".to_string(),
                    default_model: true,
                    context_window: 1000000,
                },
                ModelDescriptor {
                    model_id: "gemini-3.6-flash".to_string(),
                    display_name: "Gemini 3.6 Flash Medium (Fast)".to_string(),
                    default_model: false,
                    context_window: 1000000,
                },
                ModelDescriptor {
                    model_id: "gemini-3.5-flash".to_string(),
                    display_name: "Gemini 3.5 Flash Medium (Fast)".to_string(),
                    default_model: false,
                    context_window: 1000000,
                },
                ModelDescriptor {
                    model_id: "gemini-3.1-pro".to_string(),
                    display_name: "Gemini 3.1 Pro Low".to_string(),
                    default_model: false,
                    context_window: 2000000,
                },
            ],
            default_model: "gemini-3.7-flash".to_string(),
        },
        ProviderMetadata {
            provider_name: "OPENAI".to_string(),
            configured: crate::credential_store::has_credential("OPENAI"),
            healthy: true,
            status_message: "OpenAI GPT-5.4, GPT-5.6 Sol & o4-mini ready".to_string(),
            capabilities: vec![
                "chat".to_string(),
                "streaming".to_string(),
                "reasoning".to_string(),
                "audio".to_string(),
            ],
            supported_models: vec![
                ModelDescriptor {
                    model_id: "gpt-5.4".to_string(),
                    display_name: "GPT-5.4 (Workhorse & Coding)".to_string(),
                    default_model: true,
                    context_window: 256000,
                },
                ModelDescriptor {
                    model_id: "gpt-5.6-sol".to_string(),
                    display_name: "GPT-5.6 Sol (Flagship Omnimodal)".to_string(),
                    default_model: false,
                    context_window: 256000,
                },
                ModelDescriptor {
                    model_id: "o4-mini".to_string(),
                    display_name: "o4-mini (Next-Gen Fast Reasoning)".to_string(),
                    default_model: false,
                    context_window: 256000,
                },
                ModelDescriptor {
                    model_id: "o3-mini".to_string(),
                    display_name: "o3-mini (STEM & Code Reasoning)".to_string(),
                    default_model: false,
                    context_window: 200000,
                },
                ModelDescriptor {
                    model_id: "gpt-4o".to_string(),
                    display_name: "GPT-4o (Omni Legacy)".to_string(),
                    default_model: false,
                    context_window: 128000,
                },
                ModelDescriptor {
                    model_id: "gpt-4o-mini".to_string(),
                    display_name: "GPT-4o Mini".to_string(),
                    default_model: false,
                    context_window: 128000,
                },
            ],
            default_model: "gpt-5.4".to_string(),
        },
        ProviderMetadata {
            provider_name: "ANTHROPIC".to_string(),
            configured: crate::credential_store::has_credential("ANTHROPIC"),
            healthy: true,
            status_message: "Anthropic Claude Sonnet 5, Opus 5 & Fable 5 ready".to_string(),
            capabilities: vec![
                "chat".to_string(),
                "streaming".to_string(),
                "thinking".to_string(),
            ],
            supported_models: vec![
                ModelDescriptor {
                    model_id: "claude-sonnet-5".to_string(),
                    display_name: "Claude Sonnet 5 (Standard Coding & Chat)".to_string(),
                    default_model: true,
                    context_window: 200000,
                },
                ModelDescriptor {
                    model_id: "claude-opus-5".to_string(),
                    display_name: "Claude Opus 5 (Frontier Deep Reasoning)".to_string(),
                    default_model: false,
                    context_window: 200000,
                },
                ModelDescriptor {
                    model_id: "claude-fable-5".to_string(),
                    display_name: "Claude Fable 5 (Autonomous Agents & Thinking)".to_string(),
                    default_model: false,
                    context_window: 200000,
                },
                ModelDescriptor {
                    model_id: "claude-haiku-4-5".to_string(),
                    display_name: "Claude Haiku 4.5 (Ultra Fast)".to_string(),
                    default_model: false,
                    context_window: 200000,
                },
                ModelDescriptor {
                    model_id: "claude-3-7-sonnet-20250219".to_string(),
                    display_name: "Claude 3.7 Sonnet (Hybrid Fallback)".to_string(),
                    default_model: false,
                    context_window: 200000,
                },
            ],
            default_model: "claude-sonnet-5".to_string(),
        },
        ProviderMetadata {
            provider_name: "GROQ".to_string(),
            configured: crate::credential_store::has_credential("GROQ"),
            healthy: true,
            status_message: "Groq Ultra-Fast LLaMA 4 Scout, 3.3 & Whisper Turbo ready".to_string(),
            capabilities: vec![
                "chat".to_string(),
                "fast_inference".to_string(),
                "streaming".to_string(),
                "audio_stt".to_string(),
            ],
            supported_models: vec![
                ModelDescriptor {
                    model_id: "llama-3.3-70b-versatile".to_string(),
                    display_name: "LLaMA 3.3 70B Versatile (Flagship Quality)".to_string(),
                    default_model: true,
                    context_window: 128000,
                },
                ModelDescriptor {
                    model_id: "llama-4-scout-17b".to_string(),
                    display_name: "LLaMA 4 Scout 17B (Ultra-Fast Multimodal)".to_string(),
                    default_model: false,
                    context_window: 128000,
                },
                ModelDescriptor {
                    model_id: "deepseek-r1-distill-llama-70b".to_string(),
                    display_name: "DeepSeek R1 Distill 70B (Frontier Reasoning)".to_string(),
                    default_model: false,
                    context_window: 128000,
                },
                ModelDescriptor {
                    model_id: "llama-3.1-8b-instant".to_string(),
                    display_name: "LLaMA 3.1 8B Instant (Sub-Second Latency)".to_string(),
                    default_model: false,
                    context_window: 128000,
                },
                ModelDescriptor {
                    model_id: "mixtral-8x7b-32768".to_string(),
                    display_name: "Mixtral 8x7B 32k".to_string(),
                    default_model: false,
                    context_window: 32768,
                },
            ],
            default_model: "llama-3.3-70b-versatile".to_string(),
        },
        ProviderMetadata {
            provider_name: "OLLAMA".to_string(),
            configured: true,
            healthy: true,
            status_message: "Local Ollama server (runs on http://localhost:11434)".to_string(),
            capabilities: vec!["chat".to_string(), "streaming".to_string()],
            supported_models: vec![ModelDescriptor {
                model_id: "gemma4:31b-cloud".to_string(),
                display_name: "Gemma 4 (31B Cloud)".to_string(),
                default_model: true,
                context_window: 8192,
            }],
            default_model: "gemma4:31b-cloud".to_string(),
        },
    ];

    Ok(providers)
}

#[tauri::command]
async fn fetch_provider_models(
    provider: String,
    api_key: Option<String>,
) -> Result<Vec<crate::ai_provider::FetchedModel>, String> {
    let key = if let Some(k) = api_key {
        if !k.trim().is_empty() {
            k
        } else {
            crate::credential_store::get_credential(&provider).unwrap_or_default()
        }
    } else {
        crate::credential_store::get_credential(&provider).unwrap_or_default()
    };

    if key.is_empty() && provider != "OLLAMA" {
        return Err(format!(
            "No API key found for '{}'. Please enter or save your key first.",
            provider
        ));
    }

    crate::ai_provider::fetch_models_for_provider(&provider, &key).await
}

#[tauri::command]
fn get_conversations(state: tauri::State<'_, AppState>) -> Result<Vec<Conversation>, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::list_conversations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_conversation(state: tauri::State<'_, AppState>, id: String) -> Result<Conversation, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::get_conversation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_conversation(
    state: tauri::State<'_, AppState>,
    input: CreateConversationInput,
) -> Result<Conversation, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    let id = uuid::Uuid::new_v4().to_string();
    let conv = Conversation {
        id: id.clone(),
        title: if input.title.trim().is_empty() {
            "New conversation".to_string()
        } else {
            input.title
        },
        provider: input.provider,
        model: input.model,
        created_at: "".to_string(),
        updated_at: "".to_string(),
        messages: Some(vec![]),
    };
    crate::database::create_conversation(&conn, &conv).map_err(|e| e.to_string())?;
    crate::database::get_conversation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_message(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    content: String,
    model: Option<String>,
) -> Result<ChatResponseDto, String> {
    let port = {
        let pm = state.process_manager.lock().unwrap();
        let s = pm.state.lock().unwrap();
        s.qdrant_port
    };
    let semantic_rag_context = crate::qdrant_client::fetch_semantic_rag_context(&content, port).await;

    let (messages_prompt, conv, user_msg) = {
        let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());

        // Save User message
        let user_msg_id = uuid::Uuid::new_v4().to_string();
        let user_msg = Message {
            id: user_msg_id.clone(),
            conversation_id: id.clone(),
            role: "user".to_string(),
            content: content.clone(),
            token_count: (content.chars().count() / 4) as i32,
            created_at: "".to_string(),
        };
        crate::database::create_message(&conn, &user_msg).map_err(|e| e.to_string())?;

        // Build Prompt
        let messages_prompt =
            crate::context_orchestrator::build_prompt_messages(&conn, &id, &content, semantic_rag_context)?;

        // Get Provider details
        let conv = crate::database::get_conversation(&conn, &id).map_err(|e| e.to_string())?;

        (messages_prompt, conv, user_msg)
    };

    let api_key = crate::credential_store::get_credential(&conv.provider).unwrap_or_default();
    let selected_model = model.unwrap_or(conv.model);

    let assistant_content = if !api_key.is_empty() || conv.provider == "OLLAMA" {
        match conv.provider.as_str() {
            "OLLAMA" => {
                crate::ai_provider::stream_ollama_response(
                    app_handle.clone(),
                    &api_key,
                    &selected_model,
                    messages_prompt,
                    "ai-stream-chunk",
                )
                .await?
            }
            "OPENAI" => {
                crate::ai_provider::stream_openai_response(
                    app_handle.clone(),
                    &api_key,
                    &selected_model,
                    messages_prompt,
                    "ai-stream-chunk",
                )
                .await?
            }
            "GEMINI" => {
                crate::ai_provider::stream_gemini_response(
                    app_handle.clone(),
                    &api_key,
                    &selected_model,
                    messages_prompt,
                    "ai-stream-chunk",
                )
                .await?
            }
            "ANTHROPIC" => {
                crate::ai_provider::stream_anthropic_response(
                    app_handle.clone(),
                    &api_key,
                    &selected_model,
                    messages_prompt,
                    "ai-stream-chunk",
                )
                .await?
            }
            "GROQ" => {
                crate::ai_provider::stream_groq_response(
                    app_handle.clone(),
                    &api_key,
                    &selected_model,
                    messages_prompt,
                    "ai-stream-chunk",
                )
                .await?
            }
            _ => {
                let reply = format!("Unsupported provider '{}'", conv.provider);
                let _ = app_handle.emit("ai-stream-chunk", &reply);
                reply
            }
        }
    } else {
        let reply = format!(
            "API key for provider '{}' is not configured yet. Please open Credentials in the top right to set your key.",
            conv.provider
        );
        let _ = app_handle.emit("ai-stream-chunk", &reply);
        reply
    };

    let (saved_user_msg, assistant_msg) = {
        let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
        let assistant_msg_id = uuid::Uuid::new_v4().to_string();
        let assistant_msg = Message {
            id: assistant_msg_id.clone(),
            conversation_id: id.clone(),
            role: "assistant".to_string(),
            content: assistant_content.clone(),
            token_count: (assistant_content.chars().count() / 4) as i32,
            created_at: "".to_string(),
        };
        crate::database::create_message(&conn, &assistant_msg).map_err(|e| e.to_string())?;
        let _ = crate::database::update_conversation(&conn, &id, &conv.title, &selected_model);

        let all_msgs =
            crate::database::get_messages_for_conversation(&conn, &id).unwrap_or_default();
        let final_user = all_msgs
            .iter()
            .find(|m| m.id == user_msg.id)
            .cloned()
            .unwrap_or(user_msg);
        let final_assistant = all_msgs
            .iter()
            .find(|m| m.id == assistant_msg_id)
            .cloned()
            .unwrap_or(assistant_msg);
        (final_user, final_assistant)
    };

    let chat_response = ChatResponseDto {
        user_message: saved_user_msg,
        assistant_message: assistant_msg,
    };

    let _ = app_handle.emit("ai-stream-done", &chat_response);

    Ok(chat_response)
}

fn extract_significant_keywords(text: &str) -> Vec<String> {
    let stopwords = [
        "a",
        "an",
        "the",
        "is",
        "are",
        "was",
        "were",
        "and",
        "or",
        "in",
        "on",
        "at",
        "to",
        "for",
        "with",
        "about",
        "by",
        "of",
        "from",
        "it",
        "this",
        "that",
        "what",
        "which",
        "how",
        "why",
        "when",
        "where",
        "who",
        "whom",
        "whose",
        "can",
        "could",
        "would",
        "should",
        "do",
        "does",
        "did",
        "have",
        "has",
        "had",
        "be",
        "been",
        "being",
        "you",
        "your",
        "i",
        "me",
        "my",
        "we",
        "our",
        "they",
        "their",
        "he",
        "she",
        "him",
        "her",
        "tell",
        "explain",
        "describe",
        "earlier",
        "mentioned",
        "before",
        "previously",
        "again",
        "please",
        "discuss",
        "answer",
        "question",
    ];

    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|w| w.len() >= 3 && !stopwords.contains(&w.to_lowercase().as_str()))
        .map(|w| w.to_string())
        .collect()
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OverlayHistoryMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayAssistInput {
    pub prompt: String,
    pub mode: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub include_screen_image: Option<bool>,
    pub history: Option<Vec<OverlayHistoryMessage>>,
}

pub fn build_overlay_messages(
    conn: &rusqlite::Connection,
    prompt: &str,
    input_mode: &str,
    last_loopback: &str,
    screen_text: &str,
    screen_image_b64: &str,
    history: Option<&[OverlayHistoryMessage]>,
    semantic_rag_context: Option<String>,
) -> Vec<serde_json::Value> {
    let mut system_instructions = match input_mode {
        "solve_code" => {
            "<system_instructions>\n\
            You are an experienced software developer in a live coding interview.\n\n\
            RULES:\n\
            1. Explain the standard approach and the optimal approach in 1-2 spoken sentences first.\n\
            2. Provide clean, concise, production-ready code for the optimal solution.\n\
            3. Do NOT include or discuss Time Complexity or Space Complexity unless the interviewer explicitly asks for it.\n\
            4. Mention 2 key edge cases to speak aloud.\n\
            5. Do NOT include lengthy introductions, conclusions, or multiple variations.\n\
            </system_instructions>".to_string()
        }
        "follow_ups" => {
            "<system_instructions>\n\
            You are an experienced software developer in a live technical interview.\n\n\
            RULES:\n\
            Suggest 2-3 sharp, natural, and insightful follow-up questions for the candidate to ask the interviewer. Keep them conversational, punchy, and impressive.\n\
            </system_instructions>".to_string()
        }
        "recap" => {
            "<system_instructions>\n\
            You are an experienced technical lead in an interview.\n\n\
            RULES:\n\
            Provide a quick, concise summary of key takeaways and architectural decisions in 3-5 punchy bullet points.\n\
            </system_instructions>".to_string()
        }
        "raw" => {
            "<system_instructions>\n\
            You are a helpful assistant. Output JSON as requested. Do NOT include markdown framing (such as ```json) or any conversational preambles/postambles. Output raw, clean JSON text only.\n\
            </system_instructions>".to_string()
        }
        _ => {
            "<system_instructions>\n\
            You are the candidate in a live technical interview.\n\n\
            Your job is to generate a concise, interview-ready response that you can immediately read and speak aloud to the interviewer naturally.\n\n\
            ### CANDIDATE PERSONA & FIRST-PERSON RULES:\n\
            1. FIRST-PERSON VOICE: You ARE the candidate answering in real-time. Always speak naturally in the first person (\"I\", \"in my experience\", \"in my project\", \"we implemented\") when discussing your background, projects, or experience.\n\
            2. NEVER BREAK CHARACTER: Never say \"According to your resume\", \"Your profile says\", \"The uploaded document states\", \"Based on your profile\", or \"As an AI assistant\".\n\n\
            ### QUESTION TYPE PRECEDENCE & RESPONSE STYLES (CRITICAL):\n\
            1. GENERIC TECHNICAL & CONCEPTUAL QUESTIONS:\n\
            (e.g., 'What is polymorphism in Java?', 'What is HashMap?', 'What is Kafka?', 'What is dependency injection?', 'Difference between X and Y', 'How does Garbage Collection work?'):\n\
            - Answer OBJECTIVELY, CONCISELY, and DIRECTLY using general computer science and software engineering knowledge.\n\
            - STRICT PROHIBITION: Do NOT inject personal experience, first-person anecdotes, or project mentions.\n\
            - Do NOT say 'In my project...', 'In my experience...', 'We use...', 'In our architecture...', or reference your resume/companies.\n\
            - Focus purely on: direct definition, practical intuition/purpose, key technical nuance or trade-off, and standard industry practice.\n\n\
            2. CANDIDATE EXPERIENCE & PROJECT QUESTIONS:\n\
            (e.g., 'Have you worked with Kafka?', 'Explain your AI School Management project', 'What did you implement in your project?', 'Describe your role at Asics Technologies'):\n\
            - Answer in FIRST PERSON ('I', 'in my project', 'we implemented') grounded strictly in your verified candidate data below.\n\
            - Mention only technologies, architectures, and modules that exist in your verified candidate profile and resume.\n\n\
            3. UNSUPPORTED TECHNOLOGIES & SKILL KEYWORDS PRECEDENCE:\n\
            - Evidence Precedence: Verified project/work history > Verified explicit experience/achievement > Conceptual knowledge > Generic skill keyword.\n\
            - A technology appearing ONLY in the generic skills list (e.g., Kubernetes, Grafana, Splunk) is NOT verified production experience.\n\
            - For questions asking if you have worked with a technology not present in your verified project implementations (e.g., 'Have you worked with Kubernetes?'):\n\
                * You MUST clearly distinguish conceptual understanding from hands-on production experience.\n\
                * State clearly that you have not worked with it directly in your production projects, then state your actual hands-on experience and conceptual understanding.\n\
                * Example: 'I have not worked directly with Kubernetes in my production projects. My hands-on containerization experience has mainly been with Docker and AWS, but I understand Kubernetes concepts such as Pods, Services, Deployments, and scaling.'\n\
                * Do NOT start with 'Yes, I have worked...' or 'Yes, I have...' when there is no verified project or work-history evidence.\n\n\
            4. STAR & BEHAVIORAL QUESTIONS — ANTI-HALLUCINATION PROTECTION:\n\
            - NEVER invent or hallucinate:\n\
                * incidents or simulated outages (e.g., 'outage during peak booking hours/Black Friday')\n\
                * exact percentages or metrics (e.g., '40% response-time reduction', '99.99% uptime')\n\
                * latency numbers or benchmark figures\n\
                * customer impact metrics\n\
                * specific root causes or fixes not documented in verified candidate data.\n\
            - Technical reference documents (e.g., Hibernate notes on N+1 or JOIN FETCH) represent general technical knowledge, NOT personal candidate production incidents. Do not claim you personally fixed those issues in production.\n\
            - If asked about a challenging situation or behavioral scenario and no specific STAR record exists in your matrix, give a safe, honest answer based strictly on verified project responsibilities and engineering practices, without fabricated metrics or fake crisis events.\n\n\
            ### CRITICAL GENERATION RULES:\n\
            1. Answer the question directly. Start immediately with a clear, direct definition or explanation. Do NOT repeat or rephrase the question.\n\
            2. Explain the concept in simple, spoken sentences. State what it is, why it is used, and its practical purpose.\n\
            3. Include one important technical point, key nuance, or common trade-off when relevant.\n\
            4. LENGTH: Keep the answer strictly between 4 to 6 short sentences (or 5 to 8 short sentences for complex topics). Aim for roughly 60–120 words that can be spoken naturally in 30–60 seconds.\n\
            5. NATURAL SPOKEN ENGLISH: Speak naturally and confidently like an experienced developer (e.g. 'Basically...', 'The main difference is...', 'By default...'). Avoid robotic AI jargon or overly academic textbook language.\n\
            6. NO CODE BY DEFAULT: Do NOT provide code examples unless the user explicitly asks for code (e.g. 'write code', 'implement'). Conceptual questions must be answered with concise spoken explanation only.\n\
            7. NO HEADINGS OR SECTIONS: Never generate section headings (such as `### Key Things to Know`, `### Code Example`, `### Conclusion`, or `### Summary`).\n\
            8. NO AI FILLER: Never use filler phrases like 'In today's world...', 'Let's dive into...', 'It is important to note that...', 'Here are the key takeaways...', 'A common interview follow-up is...', 'In conclusion...', or 'To summarize...'.\n\
            9. NO UNSOLICITED FOLLOW-UPS: Do not suggest or append follow-up questions unless directly asked.\n\
            10. SINGLE UNIFIED ANSWER: Generate exactly ONE clean, speakable answer. Never append a second explanation, alternate version, or repetition.\n\
            11. COMPARISONS: For comparison questions (e.g. 'difference between A and B'), explain the key differences directly in 4-8 short conversational sentences. Do NOT use markdown tables.\n\
            12. TECHNICAL ACCURACY: Use correct technical terminology without overcomplicating or simplifying to the point of inaccuracy.\n\n\
            ### EXAMPLES OF TARGET STYLE:\n\
            Question: What is finalize in Java?\n\
            finalize() is a method in Java that was called by the Garbage Collector before an object was destroyed. It was mainly used to perform cleanup activities like releasing resources. However, finalize() is deprecated because its execution is not guaranteed and it can cause performance and reliability issues.\n\n\
            Question: What is the use of the transient keyword?\n\
            The transient keyword is used to skip a variable during serialization. When an object is converted into a byte stream, normally its fields are serialized. But if a field is marked as transient, Java will not serialize that field. It is mainly used for sensitive data, calculated fields, or fields that should not be serialized. During deserialization, the transient field gets its default value, such as null or 0.\n\n\
            Question: What is Serializable?\n\
            Serializable is a marker interface in Java used to convert an object into a byte stream. This process is called serialization. It is mainly used for storing objects, sending objects over a network, or caching. To make a class serializable, we implement the Serializable interface.\n\
            </system_instructions>".to_string()
        }
    };

    // Ground with User Profile & STAR Stories
    if input_mode != "raw" {
        if let Ok(profile) = crate::database::get_user_profile(conn) {
            let mut p_block = String::new();
            if !profile.full_name.is_empty() {
                p_block.push_str(&format!("- Name: {}\n", profile.full_name));
            }
            if !profile.target_role.is_empty() {
                p_block.push_str(&format!("- Role: {}\n", profile.target_role));
            }
            if !profile.skills.is_empty() {
                p_block.push_str(&format!("- Skill Keywords: {}\n", profile.skills));
            }
            if !profile.projects.is_empty() {
                p_block.push_str(&format!("- Projects: {}\n", profile.projects));
            }
            if !profile.resume_text.is_empty() {
                p_block.push_str(&format!(
                    "- Verified Work History & Projects:\n{}\n",
                    profile.resume_text
                ));
            }
            if !p_block.is_empty() {
                system_instructions.push_str(&format!("\n\n<candidate_profile>\n{}\n</candidate_profile>\nREMINDER: Use this background ONLY when answering personal experience, role, or project questions. For generic technical questions, provide an objective technical explanation without referencing this profile.", p_block));
            }
        }

        if let Ok(stories) = crate::database::list_star_stories(conn) {
            let real_user_stories: Vec<_> = stories
                .into_iter()
                .filter(|s| {
                    !s.target_company.contains("Amazon / Meta / Cloud")
                        && !s.target_company.contains("Google / Stripe / FinTech")
                })
                .collect();

            if !real_user_stories.is_empty() {
                let mut star_block = String::new();
                for s in real_user_stories.iter().take(3) {
                    star_block.push_str(&format!(
                        "### STAR Story: {} (Principle: {})\n- Situation: {}\n- Task: {}\n- Action: {}\n- Result: {}\n",
                        s.title, s.leadership_principle, s.situation, s.task, s.action, s.result
                    ));
                }
                if !star_block.is_empty() {
                    system_instructions.push_str(&format!(
                        "\n\n<star_matrix>\n{}\n</star_matrix>\nWhen asked behavioral or past experience questions, ground your answers strictly in these real achievements.",
                        star_block
                    ));
                }
            }
        }

        if let Some(semantic_ctx) = semantic_rag_context {
            if !semantic_ctx.trim().is_empty() {
                system_instructions.push_str(&format!(
                    "\n\n<reference_documents>\n{}\n</reference_documents>\nNOTE: Ingested documents contain general technical domain knowledge and architectural patterns. Use them for technical accuracy, but DO NOT claim personal experience solving problems in these documents unless explicitly documented in your verified resume.",
                    semantic_ctx
                ));
            }
        } else {
            if let Ok(docs) = crate::database::list_knowledge_documents(conn) {
                if !docs.is_empty() {
                    let prompt_keywords = extract_significant_keywords(prompt);
                    let mut scored_docs: Vec<(usize, &crate::database::KnowledgeDocument)> = docs
                        .iter()
                        .map(|d| {
                            let title_lower = d.title.to_lowercase();
                            let content_lower = d.content.to_lowercase();
                            let score = prompt_keywords
                                .iter()
                                .map(|k| {
                                    let mut s = 0;
                                    if title_lower.contains(k) {
                                        s += 6;
                                    }
                                    if content_lower.contains(k) {
                                        s += 1;
                                    }
                                    s
                                })
                                .sum();
                            (score, d)
                        })
                        .collect();

                    // Sort highest relevance score first
                    scored_docs.sort_by(|a, b| b.0.cmp(&a.0));

                    let mut doc_block = String::new();
                    for (_, d) in scored_docs.iter().take(5) {
                        if d.content.trim().is_empty() {
                            continue;
                        }
                        let preview = if d.content.chars().count() > 1500 {
                            match d.content.char_indices().nth(1500) {
                                Some((idx, _)) => &d.content[..idx],
                                None => &d.content,
                            }
                        } else {
                            &d.content
                        };
                        doc_block.push_str(&format!(
                            "### Reference Document: {} [{}]\n{}\n",
                            d.title, d.doc_type, preview
                        ));
                    }
                    if !doc_block.is_empty() {
                        system_instructions.push_str(&format!(
                            "\n\n<reference_documents>\n{}\n</reference_documents>\nNOTE: Ingested documents contain general technical domain knowledge and architectural patterns. Use them for technical accuracy, but DO NOT claim personal experience solving problems in these documents unless explicitly documented in your verified resume.",
                            doc_block
                        ));
                    }
                }
            }
        }
    }

    let mut context_summary = String::new();
    if input_mode != "raw" {
        let mut active_context = String::new();
        if !last_loopback.trim().is_empty() {
            active_context.push_str(&format!(
                "- Active Interviewer Question: {}\n",
                last_loopback
            ));
        }
        if !screen_text.trim().is_empty() {
            active_context.push_str(&format!("- Screen OCR Snippet:\n{}\n", screen_text));
        }
        if !active_context.is_empty() {
            context_summary.push_str(&format!(
                "\n<active_context>\n{}</active_context>\n",
                active_context
            ));
        }
    }

    let user_content = if input_mode == "raw" {
        prompt.to_string()
    } else if prompt.trim().is_empty() {
        if !last_loopback.trim().is_empty() {
            format!("Interview Question: {}\n\nAnswer this directly in 4-6 concise spoken sentences for the interviewer.", last_loopback)
        } else {
            format!(
                "Context:\n{}\n\nProvide a concise 4-6 sentence answer for the interviewer.",
                context_summary
            )
        }
    } else {
        if !context_summary.trim().is_empty() {
            format!("Question: {}\n\nContext:\n{}\n\nAnswer this directly in 4-6 concise spoken sentences for the interviewer.", prompt, context_summary)
        } else {
            format!("Question: {}\n\nAnswer this directly in 4-6 concise spoken sentences for the interviewer.", prompt)
        }
    };

    let mut user_msg_json = serde_json::json!({
        "role": "user",
        "content": user_content
    });

    if !screen_image_b64.is_empty() {
        user_msg_json["image_base64"] = serde_json::json!(screen_image_b64);
    }

    let mut messages = vec![serde_json::json!({
        "role": "system",
        "content": system_instructions
    })];

    // Intelligent Multi-Turn Context Management for Long-Running Interviews
    if let Some(hist) = history {
        // Group raw messages into logical Q&A turns
        let mut turns: Vec<(String, String)> = Vec::new();
        let mut idx = 0;
        while idx < hist.len() {
            if hist[idx].role.eq_ignore_ascii_case("user") {
                let q = hist[idx].content.clone();
                let a = if idx + 1 < hist.len()
                    && hist[idx + 1].role.eq_ignore_ascii_case("assistant")
                {
                    idx += 1;
                    hist[idx].content.clone()
                } else {
                    String::new()
                };
                turns.push((q, a));
            } else if hist[idx].role.eq_ignore_ascii_case("assistant") {
                turns.push(("Previous Discussion".to_string(), hist[idx].content.clone()));
            }
            idx += 1;
        }

        let total_chars: usize = turns.iter().map(|(q, a)| q.len() + a.len()).sum();
        let query_keywords = extract_significant_keywords(&user_content);

        // Standard Interview Context Budget: ~45,000 characters (~11,000 tokens)
        // If within budget (typically 25-35+ full Q&A pairs), send full conversation turns
        if total_chars <= 45_000 {
            for (q, a) in turns {
                if !q.trim().is_empty() {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": q
                    }));
                }
                if !a.trim().is_empty() {
                    messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": a
                    }));
                }
            }
        } else {
            // Long-running session context strategy (>45k chars):
            // 1. Keep the most recent 6 completed turns in full sequence.
            // 2. For older turns:
            //    - If matching any query keyword (e.g. earlier topic/project/technology recalled), include full turn!
            //    - For non-matching older turns, synthesize a structured session memory overview.
            let recent_count = 6;
            let split_idx = turns.len().saturating_sub(recent_count);
            let older_turns = &turns[..split_idx];
            let recent_turns = &turns[split_idx..];

            let mut older_summaries = Vec::new();
            let mut recalled_turns = Vec::new();

            for (t_idx, (q, a)) in older_turns.iter().enumerate() {
                let q_lower = q.to_lowercase();
                let a_lower = a.to_lowercase();
                let is_relevant = query_keywords
                    .iter()
                    .any(|k| q_lower.contains(k) || a_lower.contains(k));

                if is_relevant {
                    recalled_turns.push((t_idx + 1, q.clone(), a.clone()));
                } else {
                    let q_short = if q.chars().count() > 80 {
                        let end = q.char_indices().nth(80).map(|(i, _)| i).unwrap_or(q.len());
                        format!("{}...", &q[..end])
                    } else {
                        q.clone()
                    };
                    let a_short = if a.chars().count() > 100 {
                        let end = a.char_indices().nth(100).map(|(i, _)| i).unwrap_or(a.len());
                        format!("{}...", &a[..end])
                    } else {
                        a.clone()
                    };
                    older_summaries.push(format!(
                        "Q{}: {} -> Key Point: {}",
                        t_idx + 1,
                        q_short,
                        a_short
                    ));
                }
            }

            if !older_summaries.is_empty() {
                let mut summary_block = String::from(
                    "\n\n[PERSISTENT INTERVIEW SESSION OVERVIEW & HISTORICAL TOPICS]:\n",
                );
                for s in older_summaries {
                    summary_block.push_str(&format!("- {}\n", s));
                }
                summary_block.push_str("Maintain full consistency with all decisions, facts, and technologies discussed above.");

                if let Some(sys_msg) = messages.get_mut(0) {
                    if let Some(content) = sys_msg.get_mut("content") {
                        if let Some(curr_str) = content.as_str() {
                            *content = serde_json::json!(format!("{}{}", curr_str, summary_block));
                        }
                    }
                }
            }

            // Append earlier recalled turns explicitly
            for (num, q, a) in recalled_turns {
                messages.push(serde_json::json!({
                    "role": "user",
                    "content": format!("[Earlier Discussion Q{}]: {}", num, q)
                }));
                messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": a
                }));
            }

            // Append recent turns in full chronological sequence
            for (q, a) in recent_turns {
                if !q.trim().is_empty() {
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": q
                    }));
                }
                if !a.trim().is_empty() {
                    messages.push(serde_json::json!({
                        "role": "assistant",
                        "content": a
                    }));
                }
            }
        }
    }

    messages.push(user_msg_json);
    messages
}

#[tauri::command]
async fn ask_overlay_assist(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input: OverlayAssistInput,
) -> Result<String, String> {
    let screen_text = state
        .screen_capture_manager
        .last_text
        .lock()
        .unwrap()
        .clone();
    let last_loopback = state.audio_capture_manager.consume_current_question();

    let provider_name = input.provider.unwrap_or_else(|| {
        if crate::credential_store::has_credential("OLLAMA") {
            "OLLAMA".to_string()
        } else if crate::credential_store::has_credential("GEMINI") {
            "GEMINI".to_string()
        } else if crate::credential_store::has_credential("GROQ") {
            "GROQ".to_string()
        } else if crate::credential_store::has_credential("OPENAI") {
            "OPENAI".to_string()
        } else if crate::credential_store::has_credential("ANTHROPIC") {
            "ANTHROPIC".to_string()
        } else {
            "OLLAMA".to_string()
        }
    });

    let api_key = crate::credential_store::get_credential(&provider_name).unwrap_or_default();
    if api_key.is_empty() && provider_name != "OLLAMA" {
        let msg = format!(
            "Please configure your API key for '{}' in Credentials first.",
            provider_name
        );
        let _ = app_handle.emit("overlay-stream-chunk", &msg);
        return Err(msg);
    }

    let default_model = match provider_name.as_str() {
        "GEMINI" | "GOOGLE" => "gemini-3.7-flash",
        "GROQ" => "llama-3.3-70b-versatile",
        "OPENAI" => "gpt-5.4",
        "ANTHROPIC" => "claude-sonnet-4.6",
        "OLLAMA" => "gemma4:31b-cloud",
        _ => "gemini-3.7-flash",
    };
    let model = input.model.unwrap_or_else(|| default_model.to_string());
    let input_mode = input.mode.as_deref().unwrap_or("assist");

    // Check if multimodal screen vision should be attached
    let attach_vision = input.include_screen_image.unwrap_or(false)
        || input_mode == "solve_code"
        || input_mode == "vision";

    let screen_image_b64 = if attach_vision {
        let b64 = state.screen_capture_manager.get_latest_image_base64();
        if b64.is_empty() {
            crate::screen_capture::capture_screen_with_image()
                .map(|(_, img)| img)
                .unwrap_or_default()
        } else {
            b64
        }
    } else {
        String::new()
    };

    let semantic_rag_context = if input_mode != "raw" {
        let port = {
            let pm = state.process_manager.lock().unwrap();
            let s = pm.state.lock().unwrap();
            s.qdrant_port
        };
        crate::qdrant_client::fetch_semantic_rag_context(&input.prompt, port).await
    } else {
        None
    };

    let messages = {
        let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
        build_overlay_messages(
            &conn,
            &input.prompt,
            input_mode,
            &last_loopback,
            &screen_text,
            &screen_image_b64,
            input.history.as_deref(),
            semantic_rag_context,
        )
    };

    let res = match provider_name.as_str() {
        "OLLAMA" => {
            crate::ai_provider::stream_ollama_response(
                app_handle.clone(),
                &api_key,
                &model,
                messages,
                "overlay-stream-chunk",
            )
            .await?
        }
        "GEMINI" => {
            crate::ai_provider::stream_gemini_response(
                app_handle.clone(),
                &api_key,
                &model,
                messages,
                "overlay-stream-chunk",
            )
            .await?
        }
        "GROQ" => {
            crate::ai_provider::stream_groq_response(
                app_handle.clone(),
                &api_key,
                &model,
                messages,
                "overlay-stream-chunk",
            )
            .await?
        }
        "OPENAI" => {
            crate::ai_provider::stream_openai_response(
                app_handle.clone(),
                &api_key,
                &model,
                messages,
                "overlay-stream-chunk",
            )
            .await?
        }
        "ANTHROPIC" => {
            crate::ai_provider::stream_anthropic_response(
                app_handle.clone(),
                &api_key,
                &model,
                messages,
                "overlay-stream-chunk",
            )
            .await?
        }
        _ => return Err(format!("Unsupported provider {}", provider_name)),
    };

    let _ = app_handle.emit("overlay-stream-done", &res);

    Ok(res)
}

#[tauri::command]
fn delete_conversation(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::delete_conversation(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_user_profile(
    state: tauri::State<'_, AppState>,
) -> Result<crate::database::UserProfileData, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::get_user_profile(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_user_profile(
    state: tauri::State<'_, AppState>,
    profile: crate::database::UserProfileData,
) -> Result<(), String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::save_user_profile(&conn, &profile).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_knowledge_documents(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::database::KnowledgeDocument>, String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::list_knowledge_documents(&conn).map_err(|e| e.to_string())
}

async fn index_document_internal(
    state: &AppState,
    doc: crate::database::KnowledgeDocument,
) -> Result<(), String> {
    // Save document metadata to SQLite documents table
    {
        let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
        let _ = crate::database::delete_knowledge_document(&conn, &doc.id);
        crate::database::create_knowledge_document(&conn, &doc).map_err(|e| e.to_string())?;
    }

    // Perform chunk-splitting
    let chars: Vec<char> = doc.content.chars().collect();
    let chunk_size = 800;
    let overlap = 150;
    let mut chunks = Vec::new();
    
    let mut start = 0;
    while start < chars.len() {
        let end = std::cmp::min(start + chunk_size, chars.len());
        let chunk_text: String = chars[start..end].iter().collect();
        chunks.push(chunk_text);
        if end == chars.len() {
            break;
        }
        start += chunk_size - overlap;
    }

    // Index chunks in SQLite and Qdrant
    let port = {
        let pm = state.process_manager.lock().unwrap();
        let s = pm.state.lock().unwrap();
        s.qdrant_port
    };

    let openai_key = crate::credential_store::get_credential("OPENAI").ok();
    let mut points = Vec::new();

    for (idx, chunk) in chunks.iter().enumerate() {
        let qdrant_point_id = uuid::Uuid::new_v4().to_string();
        
        // Generate embedding (using OpenAI key if present, otherwise local hash fallback)
        let vector = crate::qdrant_client::compute_text_embedding(chunk, openai_key.as_deref()).await;
        
        let mut payload = serde_json::Map::new();
        payload.insert("title".to_string(), serde_json::Value::String(doc.title.clone()));
        payload.insert("content".to_string(), serde_json::Value::String(chunk.clone()));
        payload.insert("doc_type".to_string(), serde_json::Value::String(doc.doc_type.clone()));
        payload.insert("document_id".to_string(), serde_json::Value::String(doc.id.clone()));
        payload.insert("chunk_index".to_string(), serde_json::Value::Number(serde_json::Number::from(idx)));

        points.push(crate::qdrant_client::VectorPoint {
            id: qdrant_point_id.clone(),
            vector,
            payload,
        });

        // Save chunk details to SQLite
        {
            let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
            let chunk_id = uuid::Uuid::new_v4().to_string();
            let token_length = chunk.chars().count() / 4;
            let _ = conn.execute(
                "INSERT INTO document_chunks (id, document_id, chunk_index, content, qdrant_point_id, token_length)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![
                    chunk_id,
                    doc.id,
                    idx as i32,
                    chunk,
                    qdrant_point_id,
                    token_length as i32
                ],
            );
        }
    }

    if !points.is_empty() {
        let collection = crate::qdrant_client::DEFAULT_COLLECTION;
        let _ = crate::qdrant_client::ensure_collection(port, collection).await;
        let _ = crate::qdrant_client::upsert_points(port, collection, points).await;
    }

    // Update main document chunk count
    {
        let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
        let _ = conn.execute(
            "UPDATE documents SET chunk_count = ?1 WHERE id = ?2",
            rusqlite::params![chunks.len() as i32, doc.id],
        );
    }

    Ok(())
}

#[tauri::command]
async fn create_knowledge_document(
    state: tauri::State<'_, AppState>,
    doc: crate::database::KnowledgeDocument,
) -> Result<(), String> {
    index_document_internal(&state, doc).await
}

#[tauri::command]
async fn sync_overlay_session_rag(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
    title: String,
    content: String,
) -> Result<(), String> {
    let doc = crate::database::KnowledgeDocument {
        id: conversation_id,
        title: format!("{} - Interview Transcript", title),
        doc_type: "interview_transcript".to_string(),
        content,
        created_at: "".to_string(),
    };
    index_document_internal(&state, doc).await
}

#[tauri::command]
fn save_overlay_message(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
    role: String,
    content: String,
) -> Result<(), String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    let id = uuid::Uuid::new_v4().to_string();
    let msg = crate::database::Message {
        id,
        conversation_id,
        role,
        content,
        token_count: 0,
        created_at: "".to_string(),
    };
    crate::database::create_message(&conn, &msg).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_knowledge_document(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db_conn.lock().unwrap_or_else(|p| p.into_inner());
    crate::database::delete_knowledge_document(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_audio_transcript(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.audio_capture_manager.clear_dialogue();
    state.audio_capture_manager.clear_transcripts();
    Ok(())
}

#[tauri::command]
fn clear_screen_text(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.screen_capture_manager.last_text.lock().unwrap();
    *guard = String::new();
    Ok(())
}

#[cfg(target_os = "windows")]
mod win_redirect {
    use std::os::raw::c_void;
    type HANDLE = *mut c_void;
    const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    const STD_ERROR_HANDLE: u32 = -12i32 as u32;

    extern "system" {
        fn SetStdHandle(nStdHandle: u32, hHandle: HANDLE) -> i32;
    }

    pub fn redirect_io() {
        use std::fs::OpenOptions;
        use std::os::windows::io::IntoRawHandle;

        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        let log_dir = std::path::PathBuf::from(&local_app_data)
            .join("com.backdoor.desktop")
            .join("logs");
        let _ = std::fs::create_dir_all(&log_dir);

        if let Ok(file) = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(log_dir.join("app.log"))
        {
            let raw_handle = file.into_raw_handle();
            unsafe {
                let _ = SetStdHandle(STD_OUTPUT_HANDLE, raw_handle);
                let _ = SetStdHandle(STD_ERROR_HANDLE, raw_handle);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    win_redirect::redirect_io();

    std::panic::set_hook(Box::new(|info| {
        let msg = format!(
            "[{:?}] [BackDoor AI Panic] {}\nLocation: {:?}\nBacktrace: {:?}",
            std::time::SystemTime::now(),
            info,
            info.location(),
            std::backtrace::Backtrace::capture()
        );
        eprintln!("{}", msg);
        
        let log_dir = crate::text_utils::resolve_app_dir().join("logs");
        let _ = std::fs::create_dir_all(&log_dir);

        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_dir.join("backdoor_panic.log"))
        {
            use std::io::Write;
            let _ = writeln!(file, "{}\n---\n", msg);
        }
    }));

    let qdrant_port = crate::port_picker::find_free_port().unwrap_or(63332);
    let mut qdrant_grpc_port = crate::port_picker::find_free_port().unwrap_or(63333);
    while qdrant_grpc_port == qdrant_port {
        if let Ok(p) = crate::port_picker::find_free_port() {
            qdrant_grpc_port = p;
        } else {
            qdrant_grpc_port = qdrant_port + 1;
            break;
        }
    }

    let mut process_manager = ProcessManager::new(qdrant_port, qdrant_grpc_port);
    if let Err(e) = process_manager.launch_sidecars() {
        eprintln!("[Tauri Main] Warning launching sidecars: {}", e);
    }

    let pm_arc = Arc::new(Mutex::new(process_manager));
    let screen_manager = Arc::new(ScreenCaptureManager::new());
    let audio_manager = Arc::new(AudioCaptureManager::new());
    let overlay_manager = Arc::new(OverlayManager::new());

    let db_conn = database::init_db().expect("Failed to initialize database");

    tauri::Builder::default()
        .manage(AppState {
            process_manager: pm_arc.clone(),
            screen_capture_manager: screen_manager.clone(),
            audio_capture_manager: audio_manager.clone(),
            overlay_manager: overlay_manager.clone(),
            db_conn: Arc::new(Mutex::new(db_conn)),
        })
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        println!("[GlobalShortcut] Triggered: {:?}", shortcut);
                        let shortcut_str = shortcut.to_string().to_lowercase();
                        if shortcut_str.contains("alt+shift+w") {
                            if let Some(win) = app.get_webview_window("main") {
                                if win.is_visible().unwrap_or(false) {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        } else {
                            if let Some(state) = app.try_state::<AppState>() {
                                let _ = state.overlay_manager.toggle_overlay(app);
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Register global shortcuts for Overlay and Main Window
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
            if let Ok(sc_alt_shift_i) = "alt+shift+i".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(sc_alt_shift_i);
            }

            if let Ok(sc_alt_i) = "alt+i".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(sc_alt_i);
            }

            if let Ok(sc_alt_shift_w) = "alt+shift+w".parse::<Shortcut>() {
                let _ = app.global_shortcut().register(sc_alt_shift_w);
            }

            // Create System Tray Menu & Tray Icon (Lives in Windows Notification Overflow / Hidden Icons area)
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

            let show_main = MenuItem::with_id(
                app,
                "show_main",
                "Show / Hide Workspace",
                true,
                None::<&str>,
            )?;
            let toggle_hud = MenuItem::with_id(
                app,
                "toggle_hud",
                "Toggle Stealth HUD (Alt+I)",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit BackDoor AI", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_main, &toggle_hud, &quit])?;

            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("BackDoor AI - Stealth Interview Co-pilot")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_main" => {
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "toggle_hud" => {
                        if let Some(state) = app.try_state::<AppState>() {
                            let _ = state.overlay_manager.toggle_overlay(app);
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _ = tray_builder.build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_sidecar_info,
            save_provider_credential,
            delete_provider_credential,
            get_provider_credential_status,
            toggle_screen_capture,
            get_screen_capture_status,
            dispatch_screen_snippet,
            toggle_audio_capture,
            toggle_loopback_capture,
            toggle_both_audio_capture,
            set_auto_assist,
            clear_dialogue_history,
            get_audio_capture_status,
            toggle_overlay,
            show_overlay,
            hide_overlay,
            get_overlay_status,
            set_overlay_capture_exclusion,
            capture_screen_test,
            test_microphone_capture,
            test_speaker_loopback_capture,
            get_providers,
            get_conversations,
            get_conversation,
            create_conversation,
            send_message,
            delete_conversation,
            ask_overlay_assist,
            clear_audio_transcript,
            clear_screen_text,
            get_user_profile,
            save_user_profile,
            list_knowledge_documents,
            create_knowledge_document,
            delete_knowledge_document,
            list_star_stories,
            create_star_story,
            delete_star_story,
            capture_screen_vision_snapshot,
            list_mock_interview_sessions,
            save_mock_interview_session,
            delete_mock_interview_session,
            fetch_provider_models,
            pull_ollama_model,
            install_ollama,
            sync_overlay_session_rag,
            save_overlay_message
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_mock_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        let schema = r#"
        CREATE TABLE IF NOT EXISTS user_profile (
            id VARCHAR(36) PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            attribute_key VARCHAR(100) NOT NULL,
            attribute_value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_category_key ON user_profile(category, attribute_key);
        CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            doc_type VARCHAR(50) NOT NULL,
            content_hash VARCHAR(64) NOT NULL,
            chunk_count INT NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS star_stories (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            target_company VARCHAR(100) DEFAULT '',
            leadership_principle VARCHAR(150) DEFAULT '',
            situation TEXT NOT NULL,
            task TEXT NOT NULL,
            action TEXT NOT NULL,
            result TEXT NOT NULL,
            key_learnings TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        "#;
        conn.execute_batch(schema).unwrap();

        let profile = crate::database::UserProfileData {
            full_name: "Dheeraj Verma".to_string(),
            target_role: "Java Backend Developer".to_string(),
            bio: "4+ years experience in Java, Spring Boot, Microservices, and Kafka".to_string(),
            skills: "Java, Spring Boot, Microservices, Apache Kafka, Spring AI, Qdrant, REST APIs".to_string(),
            projects: "AI-powered School Management Platform, Hospitality Management System".to_string(),
            resume_text: "Java Backend Developer with 4+ years experience building scalable microservices with Kafka and Spring Boot.".to_string(),
            custom_instructions: "".to_string(),
        };
        crate::database::save_user_profile(&conn, &profile).unwrap();

        let doc1 = crate::database::KnowledgeDocument {
            id: "d1".to_string(),
            title: "Explain your AI project..txt".to_string(),
            doc_type: "document".to_string(),
            content: "My project is an AI-powered School Management & Analytics Platform. It uses Spring AI, LangChain4j, Ollama, and Qdrant for RAG.".to_string(),
            created_at: "".to_string(),
        };
        crate::database::create_knowledge_document(&conn, &doc1).unwrap();

        let doc2 = crate::database::KnowledgeDocument {
            id: "d2".to_string(),
            title: "Apache Kafka.txt".to_string(),
            doc_type: "document".to_string(),
            content: "In our Hospitality Management System, microservices communicate asynchronously via Apache Kafka topics with partition keys.".to_string(),
            created_at: "".to_string(),
        };
        crate::database::create_knowledge_document(&conn, &doc2).unwrap();

        let doc3 = crate::database::KnowledgeDocument {
            id: "d3".to_string(),
            title: "Scenario Based Questions.txt".to_string(),
            doc_type: "document".to_string(),
            content: "How do you secure REST APIs? We improve API security using Spring Security with JWT-based authentication and role-based authorization.".to_string(),
            created_at: "".to_string(),
        };
        crate::database::create_knowledge_document(&conn, &doc3).unwrap();

        let story = crate::database::StarStory {
            id: "s1".to_string(),
            title: "Order Service Optimization".to_string(),
            target_company: "General".to_string(),
            leadership_principle: "Deliver Results".to_string(),
            situation: "High latency on booking service during peak load".to_string(),
            task: "Reduce response latency under 50ms".to_string(),
            action: "Introduced Redis caching and optimized Hibernate queries".to_string(),
            result: "Response latency dropped from 350ms to 28ms".to_string(),
            key_learnings: "Proactive query profiling prevents database bottlenecks".to_string(),
            created_at: "".to_string(),
        };
        crate::database::create_star_story(&conn, &story).unwrap();

        conn
    }

    #[test]
    fn test_scenario_1_generic_technical_question() {
        let conn = setup_mock_db();
        let prompt = "What is polymorphism in Java?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        assert_eq!(msgs.len(), 2);
        let sys_content = msgs[0]["content"].as_str().unwrap();
        let user_content = msgs[1]["content"].as_str().unwrap();

        assert!(sys_content.contains("GENERIC TECHNICAL & CONCEPTUAL QUESTIONS"));
        assert!(sys_content.contains("Answer OBJECTIVELY, CONCISELY, and DIRECTLY"));
        assert!(user_content.contains("Question: What is polymorphism in Java?"));
    }

    #[test]
    fn test_scenario_2_candidate_experience_question() {
        let conn = setup_mock_db();
        let prompt = "Have you worked with Kafka?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("CANDIDATE IDENTITY & VERIFIED RESUME GROUNDING"));
        assert!(sys_content.contains("Apache Kafka"));
        assert!(sys_content.contains("UNSUPPORTED TECHNOLOGIES & SKILL KEYWORDS PRECEDENCE"));
    }

    #[test]
    fn test_scenario_3_project_question() {
        let conn = setup_mock_db();
        let prompt = "Can you explain your AI School Management project?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("AI-powered School Management"));
        assert!(sys_content.contains("Explain your AI project..txt"));
    }

    #[test]
    fn test_scenario_4_rag_specific_question() {
        let conn = setup_mock_db();
        let prompt = "How do you secure REST APIs?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("Scenario Based Questions.txt"));
        assert!(sys_content.contains("Spring Security with JWT-based authentication"));
    }

    #[test]
    fn test_scenario_5_star_question() {
        let conn = setup_mock_db();
        let prompt = "Tell me about a challenging situation you handled in your project.";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("<star_matrix>"));
        assert!(sys_content.contains("Order Service Optimization"));
        assert!(sys_content.contains("Deliver Results"));
    }

    #[test]
    fn test_scenario_6_long_conversation_memory() {
        let conn = setup_mock_db();
        let history = vec![
            OverlayHistoryMessage { role: "user".to_string(), content: "Tell me about your project.".to_string() },
            OverlayHistoryMessage { role: "assistant".to_string(), content: "I built a Hospitality Management System using Spring Boot and Apache Kafka for asynchronous communication.".to_string() },
            OverlayHistoryMessage { role: "user".to_string(), content: "What is Spring Boot?".to_string() },
            OverlayHistoryMessage { role: "assistant".to_string(), content: "Spring Boot is a framework for building microservices quickly with convention over configuration.".to_string() },
            OverlayHistoryMessage { role: "user".to_string(), content: "Explain Docker containers.".to_string() },
            OverlayHistoryMessage { role: "assistant".to_string(), content: "Docker packages applications with dependencies into portable container units.".to_string() },
            OverlayHistoryMessage { role: "user".to_string(), content: "What is Redis cache?".to_string() },
            OverlayHistoryMessage { role: "assistant".to_string(), content: "Redis is an in-memory key-value data store used for sub-millisecond caching.".to_string() },
            OverlayHistoryMessage { role: "user".to_string(), content: "Explain microservices communication.".to_string() },
            OverlayHistoryMessage { role: "assistant".to_string(), content: "Microservices communicate synchronously via REST or asynchronously via Kafka event brokers.".to_string() },
        ];

        let prompt = "You mentioned Kafka in your project earlier. Why did you choose it?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", Some(&history), None);

        // Total messages: 1 system + 10 history (5 turns) + 1 current prompt = 12 messages
        assert_eq!(msgs.len(), 12);
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "Tell me about your project.");
        assert!(msgs[2]["content"]
            .as_str()
            .unwrap()
            .contains("Apache Kafka"));
        assert_eq!(msgs[11]["role"], "user");
        assert!(msgs[11]["content"]
            .as_str()
            .unwrap()
            .contains("You mentioned Kafka in your project earlier"));
    }

    #[test]
    fn test_scenario_7_hallucination_protection() {
        let conn = setup_mock_db();
        let prompt = "Have you worked with Embedded Rust on medical surgical robots?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("UNSUPPORTED TECHNOLOGIES & SKILL KEYWORDS PRECEDENCE"));
        assert!(sys_content.contains("STAR & BEHAVIORAL QUESTIONS — ANTI-HALLUCINATION PROTECTION"));
    }

    #[test]
    fn test_scenario_8_first_person_candidate_style() {
        let conn = setup_mock_db();
        let prompt = "Can you describe your background?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", None, None);

        let sys_content = msgs[0]["content"].as_str().unwrap();
        assert!(sys_content.contains("FIRST-PERSON VOICE: You ARE the candidate answering in real-time. Always speak naturally in the first person"));
        assert!(sys_content.contains("NEVER BREAK CHARACTER: Never say \"According to your resume\", \"Your profile says\", \"The uploaded document states\", \"Based on your profile\", or \"As an AI assistant\"."));
    }

    #[test]
    fn test_scenario_9_context_priority() {
        let conn = setup_mock_db();
        let history = vec![
            OverlayHistoryMessage {
                role: "user".to_string(),
                content: "What is your main language?".to_string(),
            },
            OverlayHistoryMessage {
                role: "assistant".to_string(),
                content: "My primary backend language is Java with Spring Boot.".to_string(),
            },
        ];
        let prompt = "Can you elaborate on your experience with Kafka in the Hospitality project?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", Some(&history), None);

        // 1. System Prompt (Persona + Rules + Profile + STAR + RAG)
        let sys_msg = msgs[0]["content"].as_str().unwrap();
        assert!(sys_msg.contains("CANDIDATE PERSONA"));
        assert!(sys_msg.contains("CANDIDATE IDENTITY & VERIFIED RESUME GROUNDING"));
        assert!(sys_msg.contains("CANDIDATE'S STAR EXPERIENCE MATRIX"));
        assert!(sys_msg.contains("INGESTED TECHNICAL REFERENCE DOCUMENTS"));

        // 2. History turns
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[2]["role"], "assistant");

        // 3. Current Question
        assert_eq!(msgs[3]["role"], "user");
        assert!(msgs[3]["content"]
            .as_str()
            .unwrap()
            .contains("Can you elaborate on your experience with Kafka"));
    }

    #[test]
    fn test_scenario_10_current_question_not_duplicated() {
        let conn = setup_mock_db();
        let history = vec![
            OverlayHistoryMessage {
                role: "user".to_string(),
                content: "What is HashMap?".to_string(),
            },
            OverlayHistoryMessage {
                role: "assistant".to_string(),
                content: "HashMap is a non-thread-safe hash table implementation in Java."
                    .to_string(),
            },
        ];
        let prompt = "What is ConcurrentHashMap?";
        let msgs = build_overlay_messages(&conn, prompt, "assist", "", "", "", Some(&history), None);

        let occurrences = msgs
            .iter()
            .filter(|m| {
                if let Some(c) = m["content"].as_str() {
                    c.contains("What is ConcurrentHashMap?")
                } else {
                    false
                }
            })
            .count();

        assert_eq!(occurrences, 1);
        assert_eq!(msgs.last().unwrap()["role"], "user");
    }
}
