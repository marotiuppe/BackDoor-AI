use serde_json::{json, Value};
use crate::database::{get_messages_for_conversation, get_user_profile, list_knowledge_documents, list_star_stories};
use rusqlite::Connection;

pub fn build_prompt_messages(
    conn: &Connection,
    conversation_id: &str,
    new_user_message: &str,
    semantic_rag_context: Option<String>,
) -> Result<Vec<Value>, String> {
    let mut messages = Vec::new();
    
    // 1. Build Grounded System Prompt with User Profile, STAR Matrix, & Knowledge RAG
    let mut system_prompt = "<system_instructions>\n\
You are BackDoor AI, an expert software engineer, technical interview co-pilot, and coding mentor.\n\n\
Your mission is to provide comprehensive, high-quality interview preparation, in-depth architectural explanations, and clear coding guidance.\n\n\
### QUESTION TYPE PRECEDENCE & RESPONSE STYLES (CRITICAL):\n\
1. GENERIC TECHNICAL & CONCEPTUAL QUESTIONS:\n\
   (e.g., 'What is polymorphism in Java?', 'What is HashMap?', 'What is Kafka?', 'What is dependency injection?', 'Difference between X and Y', 'How does Garbage Collection work?'):\n\
   - Answer OBJECTIVELY, CONCISELY, and DIRECTLY using general computer science and software engineering knowledge.\n\
   - STRICT PROHIBITION: Do NOT inject personal experience, first-person anecdotes, or project mentions.\n\
   - Do NOT say 'In my project...', 'In my experience...', 'We use...', 'In our architecture...', or reference your resume/companies.\n\
   - Focus purely on: direct definition, practical intuition/purpose, key technical nuance or trade-off, and standard industry practice.\n\n\
2. CANDIDATE EXPERIENCE & PROJECT QUESTIONS:\n\
   (e.g., 'Have you worked with Kafka?', 'Explain your AI School Management project', 'What did you implement in your project?', 'Describe your role at Asics Technologies'):\n\
   - Answer in FIRST PERSON ('I', 'in my project', 'we implemented') grounded strictly in the verified candidate data below.\n\
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
   - If asked about a challenging situation or behavioral scenario and no specific STAR record exists in your matrix, give a safe, honest answer based strictly on verified project responsibilities and engineering practices, without fabricated metrics or fake crisis events.\n\
</system_instructions>".to_string();

    if let Ok(profile) = get_user_profile(conn) {
        let mut profile_block = String::new();
        if !profile.full_name.trim().is_empty() {
            profile_block.push_str(&format!("- Name: {}\n", profile.full_name.trim()));
        }
        if !profile.target_role.trim().is_empty() {
            profile_block.push_str(&format!("- Role/Target Role: {}\n", profile.target_role.trim()));
        }
        if !profile.bio.trim().is_empty() {
            let bio_val = profile.bio.trim();
            let bio_trunc = if bio_val.chars().count() > 3000 {
                match bio_val.char_indices().nth(3000) {
                    Some((idx, _)) => format!("{}...", &bio_val[..idx]),
                    None => bio_val.to_string(),
                }
            } else {
                bio_val.to_string()
            };
            profile_block.push_str(&format!("- Bio & Background: {}\n", bio_trunc));
        }
        if !profile.skills.trim().is_empty() {
            profile_block.push_str(&format!("- Skill Keywords: {}\n", profile.skills.trim()));
        }
        if !profile.projects.trim().is_empty() {
            let proj_val = profile.projects.trim();
            let proj_trunc = if proj_val.chars().count() > 4000 {
                match proj_val.char_indices().nth(4000) {
                    Some((idx, _)) => format!("{}...", &proj_val[..idx]),
                    None => proj_val.to_string(),
                }
            } else {
                proj_val.to_string()
            };
            profile_block.push_str(&format!("- Projects & Architectures: {}\n", proj_trunc));
        }
        if !profile.resume_text.trim().is_empty() {
            let res_val = profile.resume_text.trim();
            let res_trunc = if res_val.chars().count() > 8000 {
                match res_val.char_indices().nth(8000) {
                    Some((idx, _)) => format!("{}... [Truncated for length]", &res_val[..idx]),
                    None => res_val.to_string(),
                }
            } else {
                res_val.to_string()
            };
            profile_block.push_str(&format!("- Verified Work History & Projects:\n{}\n", res_trunc));
        }
        if !profile.custom_instructions.trim().is_empty() {
            let inst_val = profile.custom_instructions.trim();
            let inst_trunc = if inst_val.chars().count() > 2000 {
                match inst_val.char_indices().nth(2000) {
                    Some((idx, _)) => format!("{}...", &inst_val[..idx]),
                    None => inst_val.to_string(),
                }
            } else {
                inst_val.to_string()
            };
            profile_block.push_str(&format!("- Custom Instructions & Tone:\n{}\n", inst_trunc));
        }

        if !profile_block.is_empty() {
            system_prompt.push_str(&format!(
                "\n\n<candidate_profile>\n{}\n</candidate_profile>\n\
REMINDER: Use this background ONLY when answering personal experience, role, or project questions. For generic technical questions, provide an objective technical explanation without referencing this profile.",
                profile_block
            ));
        }
    }

    // 2. Inject STAR Behavioral Stories Grounding
    if let Ok(stories) = list_star_stories(conn) {
        let real_user_stories: Vec<_> = stories.into_iter().filter(|s| {
            !s.target_company.contains("Amazon / Meta / Cloud") && !s.target_company.contains("Google / Stripe / FinTech")
        }).collect();

        if !real_user_stories.is_empty() {
            let mut star_block = String::new();
            for s in real_user_stories.iter().take(4) {
                star_block.push_str(&format!(
                    "### STAR Story: {} (Principle: {})\n- Situation: {}\n- Task: {}\n- Action: {}\n- Result: {}\n- Learnings: {}\n\n",
                    s.title, s.leadership_principle, s.situation, s.task, s.action, s.result, s.key_learnings
                ));
            }
            if !star_block.is_empty() {
                system_prompt.push_str(&format!(
                    "\n\n<star_experience_matrix>\n{}\n</star_experience_matrix>\n\
When asked behavioral, past-experience, or leadership questions, ground your answer strictly in these real STAR stories.",
                    star_block
                ));
            }
        }
    }

    // 3. Inject Relevant Knowledge Base Documents
    if let Some(semantic_ctx) = semantic_rag_context {
        if !semantic_ctx.trim().is_empty() {
            system_prompt.push_str(&format!(
                "\n\n<technical_reference_documents>\n{}\n</technical_reference_documents>\n\
NOTE: Ingested documents contain general technical domain knowledge and architectural patterns. Use them for technical accuracy, but DO NOT claim personal experience solving problems in these documents unless explicitly documented in your verified resume.",
                semantic_ctx
            ));
        }
    } else {
        if let Ok(docs) = list_knowledge_documents(conn) {
            if !docs.is_empty() {
                let msg_keywords: Vec<String> = new_user_message
                    .to_lowercase()
                    .split(|c: char| !c.is_alphanumeric())
                    .filter(|w| w.len() >= 3)
                    .map(|w| w.to_string())
                    .collect();

                let mut scored_docs: Vec<(usize, &crate::database::KnowledgeDocument)> = docs.iter().map(|d| {
                    let title_lower = d.title.to_lowercase();
                    let content_lower = d.content.to_lowercase();
                    let score = msg_keywords.iter().map(|k| {
                        let mut s = 0;
                        if title_lower.contains(k) { s += 5; }
                        if content_lower.contains(k) { s += 1; }
                        s
                    }).sum();
                    (score, d)
                }).collect();

                scored_docs.sort_by(|a, b| b.0.cmp(&a.0));

                let mut docs_block = String::new();
                for (_, doc) in scored_docs.iter().take(5) {
                    if doc.content.trim().is_empty() { continue; }
                    let preview = if doc.content.chars().count() > 1500 {
                        match doc.content.char_indices().nth(1500) {
                            Some((idx, _)) => &doc.content[..idx],
                            None => &doc.content,
                        }
                    } else {
                        &doc.content
                    };
                    docs_block.push_str(&format!("### Reference Document: {}\n{}\n\n", doc.title, preview));
                }
                if !docs_block.is_empty() {
                    system_prompt.push_str(&format!(
                        "\n\n<technical_reference_documents>\n{}\n</technical_reference_documents>\n\
NOTE: Ingested documents contain general technical domain knowledge and architectural patterns. Use them for technical accuracy, but DO NOT claim personal experience solving problems in these documents unless explicitly documented in your verified resume.",
                        docs_block
                    ));
                }
            }
        }
    }

    messages.push(json!({
        "role": "system",
        "content": system_prompt
    }));

    // 4. Fetch previous conversation history with sliding window for context budget
    if let Ok(history) = get_messages_for_conversation(conn, conversation_id) {
        // Estimate system prompt tokens (chars / 4 approximation)
        let system_tokens = system_prompt.chars().count() / 4;
        let new_msg_tokens = new_user_message.chars().count() / 4;
        // Default context budget ~100k tokens, leaving headroom for response
        let max_context_tokens: usize = 90_000;
        let available_for_history = max_context_tokens.saturating_sub(system_tokens + new_msg_tokens + 2000);

        // Walk backwards through history, collecting messages until budget exhausted
        let mut selected: Vec<&crate::database::Message> = Vec::new();
        let mut used_tokens: usize = 0;
        for msg in history.iter().rev() {
            let msg_tokens = msg.content.chars().count() / 4;
            if used_tokens + msg_tokens > available_for_history && !selected.is_empty() {
                break;
            }
            used_tokens += msg_tokens;
            selected.push(msg);
        }
        selected.reverse();

        for msg in selected {
            messages.push(json!({
                "role": msg.role.to_lowercase(),
                "content": msg.content
            }));
        }
    }

    // 5. Add the new user message
    messages.push(json!({
        "role": "user",
        "content": new_user_message
    }));

    Ok(messages)
}
