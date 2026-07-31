use super::*;
use tokio::fs;

fn normalize_ollama_input(mut input: OllamaConfigInput) -> Result<OllamaConfigInput, ApiError> {
    input.base_url = input.base_url.trim().trim_end_matches('/').to_string();
    input.embedding_model = input.embedding_model.trim().to_string();
    input.chat_model = input.chat_model.trim().to_string();
    if input.embedding_model.is_empty()
        || input.chat_model.is_empty()
        || input.embedding_model.len() > 160
        || input.chat_model.len() > 160
    {
        return Err(ApiError::bad_request());
    }
    let url = reqwest::Url::parse(&input.base_url).map_err(|_| ApiError::bad_request())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_ollama_url"));
    }
    Ok(input)
}

fn model_available(models: &[String], requested: &str) -> bool {
    models.iter().any(|name| {
        name == requested
            || name.strip_suffix(":latest") == Some(requested)
            || requested.strip_suffix(":latest") == Some(name.as_str())
    })
}

async fn ollama_models(state: &SharedState, base_url: &str) -> Result<Vec<String>, ApiError> {
    let response = state
        .http
        .get(format!("{}/api/tags", base_url.trim_end_matches('/')))
        .timeout(std::time::Duration::from_secs(8))
        .send()
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "ollama_unreachable"))?;
    if !response.status().is_success() {
        return Err(ApiError::new(StatusCode::BAD_GATEWAY, "ollama_unreachable"));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "invalid_ollama_response"))?;
    Ok(value
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("name").and_then(Value::as_str).map(str::to_string))
        .collect())
}

async fn validate_ollama(
    state: &SharedState,
    input: &OllamaConfigInput,
) -> Result<OllamaCheck, ApiError> {
    let models = ollama_models(state, &input.base_url).await?;
    if !model_available(&models, &input.chat_model) {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "chat_model_missing"));
    }
    let response = state
        .http
        .post(format!(
            "{}/api/embed",
            input.base_url.trim_end_matches('/')
        ))
        .timeout(std::time::Duration::from_secs(20))
        .json(&json!({"model":input.embedding_model,"input":["配置连通性测试"]}))
        .send()
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "embedding_test_failed"))?;
    if !response.status().is_success() {
        let body = response.text().await.unwrap_or_default().to_lowercase();
        if body.contains("model") && body.contains("not found") {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "embedding_model_missing",
            ));
        }
        return Err(ApiError::new(
            StatusCode::BAD_GATEWAY,
            "embedding_test_failed",
        ));
    }
    let value: Value = response
        .json()
        .await
        .map_err(|_| ApiError::new(StatusCode::BAD_GATEWAY, "embedding_test_failed"))?;
    let dimensions = value
        .pointer("/embeddings/0")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    if !(1..=16_000).contains(&dimensions) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "embedding_dimension_mismatch",
        ));
    }
    Ok(OllamaCheck {
        ok: true,
        models,
        embedding_dimensions: dimensions,
        checked_at: Utc::now(),
    })
}

fn replace_env_values(content: &str, input: &OllamaConfigInput) -> String {
    let replacements = [
        ("OLLAMA_URL", input.base_url.as_str()),
        ("EMBEDDING_MODEL", input.embedding_model.as_str()),
        ("CHAT_MODEL", input.chat_model.as_str()),
        ("RERANK_URL", input.rerank_url.as_str()),
        ("RERANK_MODEL", input.rerank_model.as_str()),
    ];
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let mut seen = std::collections::HashSet::new();
    let mut lines = content
        .lines()
        .map(|line| {
            for (key, value) in replacements {
                if line.trim_start().starts_with(&format!("{key}=")) {
                    seen.insert(key);
                    return format!("{key}={value}");
                }
            }
            line.to_string()
        })
        .collect::<Vec<_>>();
    for (key, value) in replacements {
        if !seen.contains(key) {
            lines.push(format!("{key}={value}"));
        }
    }
    let mut output = lines.join(newline);
    if content.ends_with('\n') {
        output.push_str(newline);
    }
    output
}

async fn persist_ollama_env(
    state: &SharedState,
    input: &OllamaConfigInput,
) -> Result<(), ApiError> {
    let target = state.ollama_env_path.clone();
    let config_dir = target
        .parent()
        .ok_or_else(|| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "env_not_writable"))?;
    let content = fs::read_to_string(&target)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "env_not_writable"))?;
    let temp = config_dir.join(format!(".env.{}.tmp", Uuid::new_v4()));
    let backup = config_dir.join(format!(".env.{}.bak", Uuid::new_v4()));
    fs::write(&temp, replace_env_values(&content, input))
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "env_not_writable"))?;
    if fs::rename(&target, &backup).await.is_err() {
        let _ = fs::remove_file(&temp).await;
        return Err(ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "env_not_writable",
        ));
    }
    if fs::rename(&temp, &target).await.is_err() {
        let _ = fs::rename(&backup, &target).await;
        let _ = fs::remove_file(&temp).await;
        return Err(ApiError::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "env_not_writable",
        ));
    }
    let _ = fs::remove_file(backup).await;
    Ok(())
}

pub(crate) async fn ollama_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let config = state.ollama_config.read().await.clone();
    let status = match ollama_models(&state, &config.base_url).await {
        Ok(models) => json!({"connected":true,"models":models,"checkedAt":Utc::now()}),
        Err(_) => json!({"connected":false,"models":[],"checkedAt":Utc::now()}),
    };
    Ok(Json(json!({"config":config,"status":status})))
}

pub(crate) async fn test_ollama_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<OllamaConfigInput>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let input = normalize_ollama_input(input)?;
    Ok(Json(json!({"check":validate_ollama(&state,&input).await?})))
}

pub(crate) async fn save_ollama_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<OllamaConfigInput>,
) -> Result<Json<Value>, ApiError> {
    let admin = require_admin(&state, &headers).await?;
    let input = normalize_ollama_input(input)?;
    let _write_guard = state.ollama_config_write.lock().await;
    let check = validate_ollama(&state, &input).await?;
    let previous = state.ollama_config.read().await.clone();
    let mut dimension_tx = if previous.embedding_dimensions != check.embedding_dimensions {
        let mut tx = state.db.begin().await?;
        sqlx::query("DROP INDEX IF EXISTS idx_material_chunks_embedding_hnsw")
            .execute(&mut *tx)
            .await?;
        sqlx::query(&format!(
            "ALTER TABLE material_chunks ALTER COLUMN embedding TYPE vector({}) USING NULL",
            check.embedding_dimensions
        ))
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE materials SET rag_status='text_ready',metadata=metadata||jsonb_build_object('embeddingReindexRequired',true) WHERE rag_status='indexed' AND EXISTS(SELECT 1 FROM material_chunks c WHERE c.material_id=materials.id)")
            .execute(&mut *tx).await?;
        if check.embedding_dimensions <= 2_000 {
            sqlx::query("CREATE INDEX idx_material_chunks_embedding_hnsw ON material_chunks USING hnsw (embedding vector_cosine_ops)")
                .execute(&mut *tx).await?;
        }
        Some(tx)
    } else {
        None
    };
    persist_ollama_env(&state, &input).await?;
    if let Some(tx) = dimension_tx.take() {
        if let Err(error) = tx.commit().await {
            let rollback_input = OllamaConfigInput {
                base_url: previous.base_url.clone(),
                embedding_model: previous.embedding_model.clone(),
                chat_model: previous.chat_model.clone(),
                rerank_url: previous.rerank_url.clone(),
                rerank_model: previous.rerank_model.clone(),
            };
            let _ = persist_ollama_env(&state, &rollback_input).await;
            return Err(error.into());
        }
    }
    let next = OllamaRuntimeConfig {
        base_url: input.base_url,
        embedding_model: input.embedding_model,
        chat_model: input.chat_model,
        embedding_dimensions: check.embedding_dimensions,
        rerank_url: input.rerank_url,
        rerank_model: input.rerank_model,
    };
    *state.ollama_config.write().await = next.clone();
    if let Err(error) = sqlx::query("INSERT INTO auth_events(user_id,username,event_type,risk_level,metadata) VALUES($1,$2,'admin_ollama_config_changed','warning',$3)")
        .bind(admin.id).bind(&admin.username).bind(json!({"previous":{"baseUrl":previous.base_url,"embeddingModel":previous.embedding_model,"chatModel":previous.chat_model},"next":{"baseUrl":next.base_url,"embeddingModel":next.embedding_model,"chatModel":next.chat_model}})).execute(&state.db).await
    {
        eprintln!("Ollama configuration activated but audit write failed: {error}");
    }
    Ok(Json(
        json!({"config":next,"check":check,"effectiveAt":Utc::now()}),
    ))
}

#[cfg(test)]
mod tests {
    use super::{normalize_ollama_input, replace_env_values, OllamaConfigInput};

    #[test]
    fn updates_only_whitelisted_env_values() {
        let original = "R2_TOKEN=secret\n# models\nOLLAMA_URL=http://old:11434\nCHAT_MODEL=old\n";
        let updated = replace_env_values(
            original,
            &OllamaConfigInput {
                base_url: "http://127.0.0.1:11434".into(),
                embedding_model: "bge-m3".into(),
                chat_model: "qwen3:4b".into(),
                rerank_url: "http://127.0.0.1:8080/v1/rerank".into(),
                rerank_model: "Qwen3-Reranker-0.6B".into(),
            },
        );
        assert!(updated.contains("R2_TOKEN=secret"));
        assert!(updated.contains("# models"));
        assert!(updated.contains("OLLAMA_URL=http://127.0.0.1:11434"));
        assert!(updated.contains("EMBEDDING_MODEL=bge-m3"));
        assert!(!updated.contains("http://old:11434"));
    }
    #[test]
    fn rejects_ollama_urls_with_credentials_or_paths() {
        let input = |base_url: &str| OllamaConfigInput {
            base_url: base_url.into(),
            embedding_model: "bge-m3".into(),
            chat_model: "qwen3:4b".into(),
            rerank_url: "http://127.0.0.1:8080/v1/rerank".into(),
            rerank_model: "Qwen3-Reranker-0.6B".into(),
        };
        assert!(normalize_ollama_input(input("http://127.0.0.1:11434")).is_ok());
        assert!(normalize_ollama_input(input("http://user:pass@localhost:11434")).is_err());
        assert!(normalize_ollama_input(input("http://localhost:11434/api")).is_err());
    }
}
