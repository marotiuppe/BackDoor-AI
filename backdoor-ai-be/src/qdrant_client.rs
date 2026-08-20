use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub const DEFAULT_COLLECTION: &str = "backdoor_knowledge";
pub const VECTOR_DIMENSION: usize = 384;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeMatch {
    pub id: String,
    pub score: f32,
    pub title: String,
    pub content: String,
    pub doc_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VectorPoint {
    pub id: String,
    pub vector: Vec<f32>,
    pub payload: serde_json::Map<String, Value>,
}

/// Generates a normalized semantic vector embedding.
/// If an OpenAI API key is provided, queries `text-embedding-3-small` (dimension 384);
/// otherwise computes a deterministic lexical/semantic hash embedding locally (384 dimensions).
pub async fn compute_text_embedding(text: &str, api_key: Option<&str>) -> Vec<f32> {
    if text.trim().is_empty() {
        return vec![0.0; VECTOR_DIMENSION];
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(3))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| Client::new());

    if let Some(key) = api_key {
        if key.starts_with("sk-") && !key.is_empty() {
            let payload = json!({
                "input": text.chars().take(8000).collect::<String>(),
                "model": "text-embedding-3-small",
                "dimensions": VECTOR_DIMENSION
            });

            if let Ok(res) = client
                .post("https://api.openai.com/v1/embeddings")
                .bearer_auth(key.trim())
                .json(&payload)
                .send()
                .await
            {
                if res.status().is_success() {
                    if let Ok(json_res) = res.json::<Value>().await {
                        if let Some(vec_arr) = json_res["data"][0]["embedding"].as_array() {
                            let floats: Vec<f32> = vec_arr
                                .iter()
                                .filter_map(|v| v.as_f64().map(|f| f as f32))
                                .collect();
                            if floats.len() == VECTOR_DIMENSION {
                                return floats;
                            }
                        }
                    }
                }
            }
        }
    }

    // Try Local Ollama Embedding
    if let Ok(res) = client.get("http://localhost:11434/api/tags").send().await {
        if res.status().is_success() {
            if let Ok(tags) = res.json::<Value>().await {
                if let Some(models) = tags["models"].as_array() {
                    if let Some(first_model) = models.first() {
                        if let Some(model_name) = first_model["name"].as_str() {
                            let ollama_payload = json!({
                                "model": model_name,
                                "prompt": text.chars().take(8000).collect::<String>()
                            });
                            if let Ok(emb_res) = client
                                .post("http://127.0.0.1:11434/api/embeddings")
                                .json(&ollama_payload)
                                .send()
                                .await
                            {
                                if emb_res.status().is_success() {
                                    if let Ok(json_res) = emb_res.json::<Value>().await {
                                        if let Some(vec_arr) = json_res["embedding"].as_array() {
                                            let mut floats: Vec<f32> = vec_arr
                                                .iter()
                                                .filter_map(|v| v.as_f64().map(|f| f as f32))
                                                .collect();
                                            if !floats.is_empty() {
                                                if floats.len() > VECTOR_DIMENSION {
                                                    floats.truncate(VECTOR_DIMENSION);
                                                } else if floats.len() < VECTOR_DIMENSION {
                                                    floats.resize(VECTOR_DIMENSION, 0.0);
                                                }
                                                // L2 Normalize
                                                let sum_sq: f32 = floats.iter().map(|v| v * v).sum();
                                                let norm = sum_sq.sqrt();
                                                if norm > 0.00001 {
                                                    for v in &mut floats {
                                                        *v /= norm;
                                                    }
                                                }
                                                return floats;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // High-entropy local hash embedding fallback
    compute_local_hash_embedding(text)
}

/// Fast, deterministic local semantic hash embedding with L2 normalization.
pub fn compute_local_hash_embedding(text: &str) -> Vec<f32> {
    let mut vector = vec![0.0f32; VECTOR_DIMENSION];
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();

    for (i, word) in words.iter().enumerate() {
        let weight = 1.0 / (1.0 + (i as f32 * 0.05));
        let mut hash = 5381u64;
        for b in word.bytes() {
            hash = ((hash << 5).wrapping_add(hash)).wrapping_add(b as u64);
        }
        let idx = (hash as usize) % VECTOR_DIMENSION;
        let sign = if (hash >> 32) % 2 == 0 { 1.0 } else { -1.0 };
        vector[idx] += sign * weight;

        // Bigram hashing
        if i + 1 < words.len() {
            let mut bigram_hash = hash;
            for b in words[i + 1].bytes() {
                bigram_hash = ((bigram_hash << 5).wrapping_add(bigram_hash)).wrapping_add(b as u64);
            }
            let b_idx = (bigram_hash as usize) % VECTOR_DIMENSION;
            let b_sign = if (bigram_hash >> 32) % 2 == 0 { 1.0 } else { -1.0 };
            vector[b_idx] += b_sign * weight * 1.5;
        }
    }

    // L2 Normalize
    let sum_sq: f32 = vector.iter().map(|v| v * v).sum();
    let norm = sum_sq.sqrt();
    if norm > 0.00001 {
        for v in &mut vector {
            *v /= norm;
        }
    }

    vector
}

/// Ensures the target Qdrant collection exists with Cosine similarity.
pub async fn ensure_collection(port: u16, collection_name: &str) -> Result<bool, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| Client::new());
    let url = format!("http://127.0.0.1:{}/collections/{}", port, collection_name);

    let check_res = client.get(&url).send().await;
    if let Ok(res) = check_res {
        if res.status().is_success() {
            return Ok(true);
        }
    }

    let payload = json!({
        "vectors": {
            "size": VECTOR_DIMENSION,
            "distance": "Cosine"
        }
    });

    let create_res = client
        .put(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Qdrant create collection network error: {}", e))?;

    if create_res.status().is_success() {
        println!("[Qdrant] Collection '{}' ensured on port {}", collection_name, port);
        Ok(true)
    } else {
        let err = create_res.text().await.unwrap_or_default();
        Err(format!("Failed to create Qdrant collection: {}", err))
    }
}

/// Upserts document chunks with vectors and metadata into Qdrant.
pub async fn upsert_points(
    port: u16,
    collection_name: &str,
    points: Vec<VectorPoint>,
) -> Result<bool, String> {
    if points.is_empty() {
        return Ok(true);
    }

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| Client::new());
    let url = format!("http://127.0.0.1:{}/collections/{}/points", port, collection_name);

    let formatted_points: Vec<Value> = points
        .into_iter()
        .map(|p| {
            json!({
                "id": p.id,
                "vector": p.vector,
                "payload": Value::Object(p.payload)
            })
        })
        .collect();

    let payload = json!({
        "points": formatted_points
    });

    let res = client
        .put(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Qdrant upsert network error: {}", e))?;

    if res.status().is_success() {
        Ok(true)
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Qdrant upsert failed: {}", err))
    }
}

/// Performs semantic vector search on Qdrant collection.
pub async fn search_knowledge(
    port: u16,
    collection_name: &str,
    query_vector: &[f32],
    limit: usize,
) -> Result<Vec<KnowledgeMatch>, String> {
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(5))
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_else(|_| Client::new());
    let url = format!("http://127.0.0.1:{}/collections/{}/points/search", port, collection_name);

    let payload = json!({
        "vector": query_vector,
        "limit": limit,
        "with_payload": true,
        "score_threshold": 0.15
    });

    let res = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Qdrant search network error: {}", e))?;

    if !res.status().is_success() {
        let err = res.text().await.unwrap_or_default();
        return Err(format!("Qdrant search error: {}", err));
    }

    let parsed: Value = res.json().await.map_err(|e| e.to_string())?;
    let mut matches = Vec::new();

    if let Some(results) = parsed.get("result").and_then(|r| r.as_array()) {
        for item in results {
            let score = item.get("score").and_then(|s| s.as_f64()).unwrap_or(0.0) as f32;
            let id = item.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
            let payload = item.get("payload");

            let title = payload
                .and_then(|p| p.get("title"))
                .and_then(|t| t.as_str())
                .unwrap_or("Knowledge Note")
                .to_string();

            let content = payload
                .and_then(|p| p.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();

            let doc_type = payload
                .and_then(|p| p.get("doc_type"))
                .and_then(|d| d.as_str())
                .unwrap_or("doc")
                .to_string();

            if !content.is_empty() {
                matches.push(KnowledgeMatch {
                    id,
                    score,
                    title,
                    content,
                    doc_type,
                });
            }
        }
    }

    Ok(matches)
}

pub async fn fetch_semantic_rag_context(query: &str, port: u16) -> Option<String> {
    let openai_key = crate::credential_store::get_credential("OPENAI").ok();
    let query_vector = compute_text_embedding(query, openai_key.as_deref()).await;
    let collection = DEFAULT_COLLECTION;

    if let Ok(matches) = search_knowledge(port, collection, &query_vector, 5).await {
        if !matches.is_empty() {
            let mut docs_block = String::new();
            for m in matches {
                docs_block.push_str(&format!("### Reference Document: {}\n{}\n\n", m.title, m.content));
            }
            return Some(docs_block);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_hash_embedding_properties() {
        let vec1 = compute_local_hash_embedding("Distributed consensus Raft algorithm leader election");
        let vec2 = compute_local_hash_embedding("Distributed consensus Raft algorithm leader election");
        let vec3 = compute_local_hash_embedding("Frontend React UI styling with Tailwind CSS");

        assert_eq!(vec1.len(), VECTOR_DIMENSION);
        assert_eq!(vec1, vec2); // Deterministic

        // Cosine similarity between vec1 and vec2 should be ~1.0
        let dot_same: f32 = vec1.iter().zip(vec2.iter()).map(|(a, b)| a * b).sum();
        assert!((dot_same - 1.0).abs() < 0.001);

        // Cosine similarity with completely unrelated topic should be much lower
        let dot_diff: f32 = vec1.iter().zip(vec3.iter()).map(|(a, b)| a * b).sum();
        assert!(dot_diff < 0.6);
    }
}
