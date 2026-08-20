use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub messages: Option<Vec<Message>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub token_count: i32,
    pub created_at: String,
}

pub fn init_db() -> Result<Connection, rusqlite::Error> {
    let new_app_dir = crate::text_utils::resolve_app_dir();
    let parent_dir = new_app_dir.parent().unwrap_or(&new_app_dir);
    let old_app_dir = parent_dir.join("com.mypersonalai.desktop");
    
    let _ = fs::create_dir_all(&new_app_dir);

    let new_db_path = new_app_dir.join("backdoor.db");
    let old_db_path = old_app_dir.join("mypersonalai.db");

    if cfg!(debug_assertions) {
        println!("[Database] Dev mode active: removing existing local database files...");
        let _ = fs::remove_file(&new_db_path);
        let _ = fs::remove_file(&old_db_path);
    }

    // Auto-migrate legacy database if new database does not exist or is empty
    if old_db_path.exists() {
        if !new_db_path.exists() {
            let _ = fs::copy(&old_db_path, &new_db_path);
        } else if let Ok(meta) = fs::metadata(&new_db_path) {
            if meta.len() == 0 {
                let _ = fs::copy(&old_db_path, &new_db_path);
            }
        }
    }

    let db_path = if new_db_path.exists() {
        new_db_path
    } else if old_db_path.exists() {
        old_db_path
    } else {
        new_app_dir.join("backdoor.db")
    };
    let conn = Connection::open(db_path)?;

    // Enable foreign keys and WAL mode for high-concurrency read/write
    conn.execute("PRAGMA foreign_keys = ON;", [])?;
    let _ = conn.execute("PRAGMA journal_mode = WAL;", []);
    let _ = conn.execute("PRAGMA synchronous = NORMAL;", []);

    // Auto-migrate old documents schema to new names
    let _ = conn.execute("ALTER TABLE documents RENAME COLUMN file_name TO title", []);
    let _ = conn.execute("ALTER TABLE documents RENAME COLUMN file_path TO content", []);
    let _ = conn.execute("ALTER TABLE documents RENAME COLUMN file_type TO doc_type", []);
    let _ = conn.execute("ALTER TABLE documents RENAME COLUMN file_hash TO content_hash", []);

    let schema = r#"
-- 1. Core Profile Memory
CREATE TABLE IF NOT EXISTS user_profile (
    id VARCHAR(36) PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    attribute_key VARCHAR(100) NOT NULL,
    attribute_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_category_key ON user_profile(category, attribute_key);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'OPENAI',
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

-- 3. Messages
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    token_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at ASC);

-- 4. Ingested Documents (RAG Semantic Knowledge foundation)
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    chunk_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_hash ON documents(content_hash);

-- 5. Document Chunks (RAG Semantic Knowledge foundation)
CREATE TABLE IF NOT EXISTS document_chunks (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    qdrant_point_id VARCHAR(36) NOT NULL,
    token_length INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);

-- 6. Episodic Memory Nodes
CREATE TABLE IF NOT EXISTS memory_items (
    id VARCHAR(36) PRIMARY KEY,
    memory_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    confidence_score DOUBLE DEFAULT 1.0,
    qdrant_point_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Provider Configurations
CREATE TABLE IF NOT EXISTS api_key_configs (
    id VARCHAR(36) PRIMARY KEY,
    provider_name VARCHAR(50) UNIQUE NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    default_model VARCHAR(100) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
    key_name VARCHAR(100) PRIMARY KEY,
    key_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. STAR Behavioral & Leadership Stories Matrix
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

CREATE INDEX IF NOT EXISTS idx_star_principle ON star_stories(leadership_principle);

-- 10. Interactive Mock Interview Sessions & Scorecards
CREATE TABLE IF NOT EXISTS mock_interview_sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    target_role VARCHAR(150) NOT NULL,
    track VARCHAR(50) NOT NULL,
    difficulty VARCHAR(50) NOT NULL,
    overall_score INT DEFAULT 0,
    technical_depth_score INT DEFAULT 0,
    communication_score INT DEFAULT 0,
    structure_score INT DEFAULT 0,
    tradeoffs_score INT DEFAULT 0,
    strengths TEXT DEFAULT '',
    blindspots TEXT DEFAULT '',
    recommendations TEXT DEFAULT '',
    transcript_json TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mock_sessions_track ON mock_interview_sessions(track);
    "#;

    conn.execute_batch(schema)?;

    Ok(conn)
}

// Conversation CRUD
pub fn create_conversation(conn: &Connection, conversation: &Conversation) -> Result<()> {
    conn.execute(
        "INSERT INTO conversations (id, title, provider, model) VALUES (?1, ?2, ?3, ?4)",
        params![
            conversation.id,
            conversation.title,
            conversation.provider,
            conversation.model
        ],
    )?;
    Ok(())
}

pub fn get_conversation(conn: &Connection, id: &str) -> Result<Conversation> {
    let mut stmt = conn.prepare(
        "SELECT id, title, provider, model, created_at, updated_at FROM conversations WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        let messages = get_messages_for_conversation(conn, id).unwrap_or_default();
        Ok(Conversation {
            id: row.get(0)?,
            title: row.get(1)?,
            provider: row.get(2)?,
            model: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            messages: Some(messages),
        })
    } else {
        Err(rusqlite::Error::QueryReturnedNoRows)
    }
}

pub fn list_conversations(conn: &Connection) -> Result<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, provider, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            title: row.get(1)?,
            provider: row.get(2)?,
            model: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
            messages: None,
        })
    })?;
    let mut results = Vec::new();
    for res in iter {
        results.push(res?);
    }
    Ok(results)
}

pub fn update_conversation(
    conn: &Connection,
    id: &str,
    title: &str,
    model: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE conversations SET title = ?1, model = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![title, model, id],
    )?;
    Ok(())
}

pub fn delete_conversation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}

// Message CRUD
pub fn create_message(conn: &Connection, message: &Message) -> Result<()> {
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, token_count) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            message.id,
            message.conversation_id,
            message.role,
            message.content,
            message.token_count
        ],
    )?;
    Ok(())
}

pub fn get_messages_for_conversation(
    conn: &Connection,
    conversation_id: &str,
) -> Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, token_count, created_at FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
    )?;
    let iter = stmt.query_map(params![conversation_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            token_count: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let mut results = Vec::new();
    for res in iter {
        results.push(res?);
    }
    Ok(results)
}

pub fn update_message(
    conn: &Connection,
    id: &str,
    content: &str,
    token_count: i32,
) -> Result<()> {
    conn.execute(
        "UPDATE messages SET content = ?1, token_count = ?2 WHERE id = ?3",
        params![content, token_count, id],
    )?;
    Ok(())
}

pub fn delete_message(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserProfileData {
    pub full_name: String,
    pub target_role: String,
    pub bio: String,
    pub skills: String,
    pub projects: String,
    pub resume_text: String,
    pub custom_instructions: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDocument {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub content: String,
    pub created_at: String,
}

pub fn get_user_profile(conn: &Connection) -> Result<UserProfileData> {
    let mut stmt = conn.prepare(
        "SELECT attribute_key, attribute_value FROM user_profile WHERE category = 'PROFILE'",
    )?;
    let mut map = std::collections::HashMap::new();
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for item in rows {
        if let Ok((k, v)) = item {
            map.insert(k, v);
        }
    }

    Ok(UserProfileData {
        full_name: map.get("full_name").cloned().unwrap_or_default(),
        target_role: map.get("target_role").cloned().unwrap_or_default(),
        bio: map.get("bio").cloned().unwrap_or_default(),
        skills: map.get("skills").cloned().unwrap_or_default(),
        projects: map.get("projects").cloned().unwrap_or_default(),
        resume_text: map.get("resume_text").cloned().unwrap_or_default(),
        custom_instructions: map.get("custom_instructions").cloned().unwrap_or_default(),
    })
}

pub fn save_user_profile(conn: &Connection, profile: &UserProfileData) -> Result<()> {
    let items = [
        ("full_name", &profile.full_name),
        ("target_role", &profile.target_role),
        ("bio", &profile.bio),
        ("skills", &profile.skills),
        ("projects", &profile.projects),
        ("resume_text", &profile.resume_text),
        ("custom_instructions", &profile.custom_instructions),
    ];

    for (k, v) in items {
        let id = format!("profile_{}", k);
        conn.execute(
            "INSERT INTO user_profile (id, category, attribute_key, attribute_value, updated_at)
             VALUES (?1, 'PROFILE', ?2, ?3, CURRENT_TIMESTAMP)
             ON CONFLICT(category, attribute_key) DO UPDATE SET attribute_value = excluded.attribute_value, updated_at = CURRENT_TIMESTAMP",
            params![id, k, v],
        )?;
    }

    Ok(())
}

pub fn list_knowledge_documents(conn: &Connection) -> Result<Vec<KnowledgeDocument>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, doc_type, content, created_at FROM documents ORDER BY created_at DESC",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(KnowledgeDocument {
            id: row.get(0)?,
            title: row.get(1)?,
            doc_type: row.get(2)?,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;
    let mut results = Vec::new();
    for res in iter {
        results.push(res?);
    }
    Ok(results)
}

pub fn create_knowledge_document(conn: &Connection, doc: &KnowledgeDocument) -> Result<()> {
    conn.execute(
        "INSERT INTO documents (id, title, doc_type, content, content_hash, chunk_count)
         VALUES (?1, ?2, ?3, ?4, ?1, 1)",
        params![doc.id, doc.title, doc.doc_type, doc.content],
    )?;
    Ok(())
}

pub fn delete_knowledge_document(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StarStory {
    pub id: String,
    pub title: String,
    pub target_company: String,
    pub leadership_principle: String,
    pub situation: String,
    pub task: String,
    pub action: String,
    pub result: String,
    pub key_learnings: String,
    pub created_at: String,
}

pub fn list_star_stories(conn: &Connection) -> Result<Vec<StarStory>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, target_company, leadership_principle, situation, task, action, result, key_learnings, created_at FROM star_stories ORDER BY created_at DESC",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(StarStory {
            id: row.get(0)?,
            title: row.get(1)?,
            target_company: row.get(2)?,
            leadership_principle: row.get(3)?,
            situation: row.get(4)?,
            task: row.get(5)?,
            action: row.get(6)?,
            result: row.get(7)?,
            key_learnings: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    let mut results = Vec::new();
    for res in iter {
        results.push(res?);
    }
    Ok(results)
}

pub fn create_star_story(conn: &Connection, story: &StarStory) -> Result<()> {
    conn.execute(
        "INSERT INTO star_stories (id, title, target_company, leadership_principle, situation, task, action, result, key_learnings, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![
            story.id,
            story.title,
            story.target_company,
            story.leadership_principle,
            story.situation,
            story.task,
            story.action,
            story.result,
            story.key_learnings
        ],
    )?;
    Ok(())
}

pub fn delete_star_story(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM star_stories WHERE id = ?1", params![id])?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockInterviewSession {
    pub id: String,
    pub title: String,
    pub target_role: String,
    pub track: String,
    pub difficulty: String,
    pub overall_score: i32,
    pub technical_depth_score: i32,
    pub communication_score: i32,
    pub structure_score: i32,
    pub tradeoffs_score: i32,
    pub strengths: String,
    pub blindspots: String,
    pub recommendations: String,
    pub transcript_json: String,
    pub created_at: String,
}

pub fn list_mock_interview_sessions(conn: &Connection) -> Result<Vec<MockInterviewSession>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, target_role, track, difficulty, overall_score, technical_depth_score, communication_score, structure_score, tradeoffs_score, strengths, blindspots, recommendations, transcript_json, created_at FROM mock_interview_sessions ORDER BY created_at DESC",
    )?;
    let iter = stmt.query_map([], |row| {
        Ok(MockInterviewSession {
            id: row.get(0)?,
            title: row.get(1)?,
            target_role: row.get(2)?,
            track: row.get(3)?,
            difficulty: row.get(4)?,
            overall_score: row.get(5)?,
            technical_depth_score: row.get(6)?,
            communication_score: row.get(7)?,
            structure_score: row.get(8)?,
            tradeoffs_score: row.get(9)?,
            strengths: row.get(10)?,
            blindspots: row.get(11)?,
            recommendations: row.get(12)?,
            transcript_json: row.get(13)?,
            created_at: row.get(14)?,
        })
    })?;
    let mut results = Vec::new();
    for res in iter {
        results.push(res?);
    }
    Ok(results)
}

pub fn save_mock_interview_session(conn: &Connection, session: &MockInterviewSession) -> Result<()> {
    conn.execute(
        "INSERT INTO mock_interview_sessions (id, title, target_role, track, difficulty, overall_score, technical_depth_score, communication_score, structure_score, tradeoffs_score, strengths, blindspots, recommendations, transcript_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
            overall_score = excluded.overall_score,
            technical_depth_score = excluded.technical_depth_score,
            communication_score = excluded.communication_score,
            structure_score = excluded.structure_score,
            tradeoffs_score = excluded.tradeoffs_score,
            strengths = excluded.strengths,
            blindspots = excluded.blindspots,
            recommendations = excluded.recommendations,
            transcript_json = excluded.transcript_json",
        params![
            session.id,
            session.title,
            session.target_role,
            session.track,
            session.difficulty,
            session.overall_score,
            session.technical_depth_score,
            session.communication_score,
            session.structure_score,
            session.tradeoffs_score,
            session.strengths,
            session.blindspots,
            session.recommendations,
            session.transcript_json
        ],
    )?;
    Ok(())
}

pub fn delete_mock_interview_session(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM mock_interview_sessions WHERE id = ?1", params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON;", []).unwrap();

        let schema = r#"
        CREATE TABLE IF NOT EXISTS conversations (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            provider VARCHAR(50) NOT NULL DEFAULT 'OPENAI',
            model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(36) PRIMARY KEY,
            conversation_id VARCHAR(36) NOT NULL,
            role VARCHAR(20) NOT NULL,
            content TEXT NOT NULL,
            token_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS user_profile (
            id VARCHAR(36) PRIMARY KEY,
            category VARCHAR(50) NOT NULL,
            attribute_key VARCHAR(100) NOT NULL,
            attribute_value TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(category, attribute_key)
        );
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
        CREATE TABLE IF NOT EXISTS mock_interview_sessions (
            id VARCHAR(36) PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            target_role VARCHAR(100) NOT NULL,
            track VARCHAR(50) NOT NULL,
            difficulty VARCHAR(50) NOT NULL,
            overall_score INT DEFAULT 0,
            technical_depth_score INT DEFAULT 0,
            communication_score INT DEFAULT 0,
            structure_score INT DEFAULT 0,
            tradeoffs_score INT DEFAULT 0,
            strengths TEXT,
            blindspots TEXT,
            recommendations TEXT,
            transcript_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        "#;
        conn.execute_batch(schema).unwrap();
        conn
    }

    #[test]
    fn test_conversation_and_message_crud() {
        let conn = setup_test_db();
        let conv = Conversation {
            id: "c1".to_string(),
            title: "Test Conversation".to_string(),
            provider: "GEMINI".to_string(),
            model: "gemini-3.7-flash".to_string(),
            created_at: "".to_string(),
            updated_at: "".to_string(),
            messages: None,
        };
        create_conversation(&conn, &conv).unwrap();

        let list = list_conversations(&conn).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Test Conversation");

        let msg = Message {
            id: "m1".to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: "Hello AI".to_string(),
            token_count: 2,
            created_at: "".to_string(),
        };
        create_message(&conn, &msg).unwrap();

        let msgs = get_messages_for_conversation(&conn, "c1").unwrap();
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0].content, "Hello AI");

        // Test ON DELETE CASCADE
        delete_conversation(&conn, "c1").unwrap();
        let msgs_after = get_messages_for_conversation(&conn, "c1").unwrap();
        assert_eq!(msgs_after.len(), 0);
    }

    #[test]
    fn test_knowledge_document_crud() {
        let conn = setup_test_db();
        let doc = KnowledgeDocument {
            id: "d1".to_string(),
            title: "System Design Cheat Sheet".to_string(),
            doc_type: "text".to_string(),
            content: "CAP Theorem: Consistency, Availability, Partition Tolerance".to_string(),
            created_at: "".to_string(),
        };
        create_knowledge_document(&conn, &doc).unwrap();

        let docs = list_knowledge_documents(&conn).unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].title, "System Design Cheat Sheet");
        assert_eq!(docs[0].content, "CAP Theorem: Consistency, Availability, Partition Tolerance");

        delete_knowledge_document(&conn, "d1").unwrap();
        let docs_after = list_knowledge_documents(&conn).unwrap();
        assert_eq!(docs_after.len(), 0);
    }

    #[test]
    fn test_star_story_crud() {
        let conn = setup_test_db();
        let story = StarStory {
            id: "s1".to_string(),
            title: "Scaled Microservices".to_string(),
            target_company: "Google".to_string(),
            leadership_principle: "Customer Obsession".to_string(),
            situation: "High latency on order service".to_string(),
            task: "Reduce p99 latency under 50ms".to_string(),
            action: "Implemented Redis cache layer".to_string(),
            result: "p99 dropped from 250ms to 18ms".to_string(),
            key_learnings: "Cache invalidation strategies matter".to_string(),
            created_at: "".to_string(),
        };
        create_star_story(&conn, &story).unwrap();

        let stories = list_star_stories(&conn).unwrap();
        assert_eq!(stories.len(), 1);
        assert_eq!(stories[0].title, "Scaled Microservices");

        delete_star_story(&conn, "s1").unwrap();
        assert_eq!(list_star_stories(&conn).unwrap().len(), 0);
    }

    #[test]
    fn test_user_profile_crud() {
        let conn = setup_test_db();
        let profile = UserProfileData {
            full_name: "Dheeraj".to_string(),
            target_role: "Staff Software Engineer".to_string(),
            bio: "10+ years backend expertise".to_string(),
            skills: "Rust, Java, System Design, Distributed Systems".to_string(),
            projects: "BackDoor AI Desktop Assistant".to_string(),
            resume_text: "Experienced engineer...".to_string(),
            custom_instructions: "Be concise and technical".to_string(),
        };
        save_user_profile(&conn, &profile).unwrap();

        let loaded = get_user_profile(&conn).unwrap();
        assert_eq!(loaded.full_name, "Dheeraj");
        assert_eq!(loaded.target_role, "Staff Software Engineer");
        assert_eq!(loaded.skills, "Rust, Java, System Design, Distributed Systems");
    }

    #[test]
    fn test_dump_current_db() {
        if let Ok(conn) = init_db() {
            if let Ok(p) = get_user_profile(&conn) {
                println!("=== STORED CANDIDATE PROFILE ===");
                println!("Name: {}", p.full_name);
                println!("Target Role: {}", p.target_role);
                println!("Bio: {}", p.bio);
                println!("Skills: {}", p.skills);
                println!("Projects: {}", p.projects);
                println!("Resume Preview: {}", p.resume_text.chars().take(300).collect::<String>());
                println!("Custom Instructions: {}", p.custom_instructions);
            }
            if let Ok(stories) = list_star_stories(&conn) {
                println!("=== STORED STAR STORIES ({}) ===", stories.len());
                for s in stories {
                    println!("- Story: {} | Principle: {} | Sit: {} | Act: {} | Res: {}", s.title, s.leadership_principle, s.situation, s.action, s.result);
                }
            }
            if let Ok(docs) = list_knowledge_documents(&conn) {
                println!("=== STORED KNOWLEDGE DOCUMENTS ({}) ===", docs.len());
                for d in docs {
                    println!("- Doc: {} [{}] | Preview: {}", d.title, d.doc_type, d.content.chars().take(200).collect::<String>());
                }
            }
        }
    }
}

