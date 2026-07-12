use super::*;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use axum::{
    extract::{Multipart, Path as AxumPath},
    http::HeaderMap,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    net::IpAddr,
    path::{Component, Path},
};
use tokio::{fs, process::Command};

#[derive(Deserialize)]
pub(crate) struct AccountParams {
    q: Option<String>,
    cursor: Option<i64>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct RiskInput {
    action: String,
    reason: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct ProviderInput {
    name: String,
    provider: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    model: String,
    #[serde(rename = "apiKey")]
    api_key: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct OllamaConfigInput {
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "embeddingModel")]
    embedding_model: String,
    #[serde(rename = "chatModel")]
    chat_model: String,
}

#[derive(Serialize)]
struct OllamaCheck {
    ok: bool,
    models: Vec<String>,
    #[serde(rename = "embeddingDimensions")]
    embedding_dimensions: usize,
    #[serde(rename = "checkedAt")]
    checked_at: DateTime<Utc>,
}

#[derive(Clone)]
pub(crate) struct ProviderRuntime {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
}

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        r#"CREATE TABLE IF NOT EXISTS auth_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            username TEXT, event_type TEXT NOT NULL, ip_address TEXT, user_agent TEXT,
            risk_level TEXT NOT NULL DEFAULT 'info', metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS ai_provider_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL,
            api_key_ciphertext TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS ai_usage_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            provider TEXT NOT NULL, model TEXT NOT NULL, input_chars INTEGER NOT NULL DEFAULT 0,
            output_chars INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS material_uploads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
            file_name TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE, size_bytes BIGINT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued', error TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "CREATE INDEX IF NOT EXISTS idx_auth_events_user_time ON auth_events(user_id,created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage_events(user_id,created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_provider_configs_user ON ai_provider_configs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_material_uploads_time ON material_uploads(created_at DESC)",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}

pub(crate) async fn require_admin(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<UserSession, ApiError> {
    let user = auth_user(state, headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    let must_change: bool =
        sqlx::query_scalar("SELECT must_change_password FROM users WHERE id=$1")
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
    if must_change {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "password_change_required",
        ));
    }
    Ok(user)
}

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
    let target = state.project_root.join(".env");
    let content = fs::read_to_string(&target)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "env_not_writable"))?;
    let temp = state
        .project_root
        .join(format!(".env.{}.tmp", Uuid::new_v4()));
    let backup = state
        .project_root
        .join(format!(".env.{}.bak", Uuid::new_v4()));
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

pub(crate) async fn overview(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let accounts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;
    let active_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT user_id) FROM study_events WHERE occurred_at >= current_date",
    )
    .fetch_one(&state.db)
    .await?;
    let suspended: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE risk_status <> 'active'")
            .fetch_one(&state.db)
            .await?;
    let ai_today = sqlx::query(
        "SELECT COUNT(*)::int calls,COALESCE(SUM(input_chars),0)::bigint input_chars,COALESCE(SUM(output_chars),0)::bigint output_chars FROM ai_usage_events WHERE created_at >= current_date",
    )
    .fetch_one(&state.db)
    .await?;
    let uploads = sqlx::query(
        "SELECT id,file_name,size_bytes,status,error,metadata,created_at,updated_at FROM material_uploads ORDER BY created_at DESC LIMIT 12",
    )
    .fetch_all(&state.db)
    .await?;
    let recent_risks = sqlx::query(
        "SELECT event_type,username,risk_level,ip_address,created_at FROM auth_events WHERE risk_level <> 'info' ORDER BY created_at DESC LIMIT 12",
    )
    .fetch_all(&state.db)
    .await?;
    let last_index_run =
        sqlx::query("SELECT id,status FROM material_index_runs ORDER BY created_at DESC LIMIT 1")
            .fetch_optional(&state.db)
            .await?;
    Ok(Json(json!({
        "accounts": accounts,
        "activeToday": active_today,
        "suspended": suspended,
        "aiToday": {"calls":ai_today.try_get::<i32,_>("calls")?,"inputChars":ai_today.try_get::<i64,_>("input_chars")?,"outputChars":ai_today.try_get::<i64,_>("output_chars")?},
        "uploads": uploads.into_iter().map(|r| json!({"id":r.get::<Uuid,_>("id"),"fileName":r.get::<String,_>("file_name"),"sizeBytes":r.get::<i64,_>("size_bytes"),"status":r.get::<String,_>("status"),"error":r.get::<Option<String>,_>("error"),"metadata":r.get::<Value,_>("metadata"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")})).collect::<Vec<_>>(),
        "lastIndexRun": last_index_run.map(|r| json!({"id":r.get::<Uuid,_>("id"),"status":r.get::<String,_>("status")})),
        "risks": recent_risks.into_iter().map(|r| json!({"eventType":r.get::<String,_>("event_type"),"username":r.get::<Option<String>,_>("username"),"riskLevel":r.get::<String,_>("risk_level"),"ipAddress":r.get::<Option<String>,_>("ip_address"),"createdAt":r.get::<DateTime<Utc>,_>("created_at")})).collect::<Vec<_>>()
    })))
}

pub(crate) async fn accounts(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<AccountParams>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let limit = params.limit.unwrap_or(30).clamp(1, 100);
    let offset = params.cursor.unwrap_or(0).max(0);
    let pattern = params.q.map(|q| format!("%{}%", q.trim()));
    let rows = sqlx::query(
        r#"SELECT u.id,u.username,u.role,u.risk_status,u.failed_login_count,u.locked_until,u.created_at,u.last_login_at,
            COALESCE(s.total_study_seconds,0) total_study_seconds,COALESCE(s.practice_done_count,0) practice_done_count,
            (SELECT COUNT(*) FROM ai_usage_events a WHERE a.user_id=u.id) ai_calls,
            (SELECT COUNT(*) FROM sessions x WHERE x.user_id=u.id AND x.expires_at>now()) active_sessions
            FROM users u LEFT JOIN study_snapshots s ON s.user_id=u.id
            WHERE ($1::text IS NULL OR u.username ILIKE $1)
            ORDER BY u.created_at DESC LIMIT $2 OFFSET $3"#,
    )
    .bind(&pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({
        "accounts": rows.into_iter().map(|r| json!({
            "id":r.get::<Uuid,_>("id"),"username":r.get::<String,_>("username"),"role":r.get::<String,_>("role"),
            "riskStatus":r.get::<String,_>("risk_status"),"failedLoginCount":r.get::<i32,_>("failed_login_count"),
            "lockedUntil":r.get::<Option<DateTime<Utc>>,_>("locked_until"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),
            "lastLoginAt":r.get::<Option<DateTime<Utc>>,_>("last_login_at"),"studySeconds":r.get::<i32,_>("total_study_seconds"),
            "practiceCount":r.get::<i32,_>("practice_done_count"),"aiCalls":r.get::<i64,_>("ai_calls"),"activeSessions":r.get::<i64,_>("active_sessions")
        })).collect::<Vec<_>>(),
        "nextCursor": if rows_len(&state.db, pattern.as_deref(), offset + limit).await? {Some(offset+limit)} else {None::<i64>}
    })))
}

async fn rows_len(db: &PgPool, pattern: Option<&str>, offset: i64) -> Result<bool, ApiError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE ($1::text IS NULL OR username ILIKE $1)",
    )
    .bind(pattern)
    .fetch_one(db)
    .await?;
    Ok(offset < count)
}

pub(crate) async fn account_risk(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<RiskInput>,
) -> Result<Json<Value>, ApiError> {
    let admin = require_admin(&state, &headers).await?;
    if admin.id == id && input.action != "revoke_sessions" {
        return Err(ApiError::bad_request());
    }
    match input.action.as_str() {
        "suspend" => {
            sqlx::query("UPDATE users SET risk_status='suspended' WHERE id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        "activate" => {
            sqlx::query("UPDATE users SET risk_status='active',failed_login_count=0,locked_until=NULL WHERE id=$1").bind(id).execute(&state.db).await?;
        }
        "lock" => {
            sqlx::query("UPDATE users SET locked_until=now()+interval '24 hours' WHERE id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        "revoke_sessions" => {
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        _ => return Err(ApiError::bad_request()),
    }
    sqlx::query("INSERT INTO auth_events(user_id,username,event_type,risk_level,metadata) SELECT id,username,$2,'warning',$3 FROM users WHERE id=$1")
        .bind(id).bind(format!("admin_{}",input.action)).bind(json!({"adminId":admin.id,"reason":input.reason})).execute(&state.db).await?;
    Ok(Json(json!({"ok":true})))
}

fn encrypt_key(state: &SharedState, value: &str) -> Result<String, ApiError> {
    let cipher =
        Aes256Gcm::new_from_slice(&state.api_config_key).map_err(|_| ApiError::server())?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), value.as_bytes())
        .map_err(|_| ApiError::server())?;
    let mut packed = nonce_bytes.to_vec();
    packed.extend(encrypted);
    Ok(STANDARD.encode(packed))
}

fn decrypt_key(state: &SharedState, value: &str) -> Result<String, ApiError> {
    let packed = STANDARD.decode(value).map_err(|_| ApiError::server())?;
    if packed.len() < 13 {
        return Err(ApiError::server());
    }
    let cipher =
        Aes256Gcm::new_from_slice(&state.api_config_key).map_err(|_| ApiError::server())?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&packed[..12]), &packed[12..])
        .map_err(|_| ApiError::server())?;
    String::from_utf8(plain).map_err(|_| ApiError::server())
}

fn provider_url_allowed(provider: &str, value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return false;
    }
    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    if provider == "deepseek" {
        return url.scheme() == "https" && host == "api.deepseek.com";
    }
    if url.scheme() != "https"
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
    {
        return false;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(ip) => {
                !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified())
            }
            IpAddr::V6(ip) => {
                !(ip.is_loopback()
                    || ip.is_unspecified()
                    || ip.is_unique_local()
                    || ip.is_unicast_link_local())
            }
        };
    }
    true
}

pub(crate) async fn provider_configs(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let rows=sqlx::query("SELECT id,name,provider,base_url,model,is_default,created_at,updated_at FROM ai_provider_configs WHERE user_id=$1 ORDER BY is_default DESC,created_at")
        .bind(user.id).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"providers":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"name":r.get::<String,_>("name"),"provider":r.get::<String,_>("provider"),"baseUrl":r.get::<String,_>("base_url"),"model":r.get::<String,_>("model"),"isDefault":r.get::<bool,_>("is_default"),"hasApiKey":true,"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn save_provider_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<ProviderInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let user = auth_user(&state, &headers).await?;
    if !matches!(input.provider.as_str(), "deepseek" | "openai-compatible")
        || input.name.trim().is_empty()
        || input.model.trim().is_empty()
        || input.api_key.len() < 8
        || !provider_url_allowed(&input.provider, &input.base_url)
    {
        return Err(ApiError::bad_request());
    }
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ai_provider_configs WHERE user_id=$1")
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
    if count >= 5 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "provider_limit_reached",
        ));
    }
    let row=sqlx::query("INSERT INTO ai_provider_configs(user_id,name,provider,base_url,model,api_key_ciphertext) VALUES($1,$2,$3,$4,$5,$6) RETURNING id")
        .bind(user.id).bind(input.name.trim()).bind(&input.provider).bind(input.base_url.trim_end_matches('/')).bind(input.model.trim()).bind(encrypt_key(&state,&input.api_key)?).fetch_one(&state.db).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id":row.get::<Uuid,_>("id"),"ok":true})),
    ))
}

pub(crate) async fn delete_provider_config(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let affected = sqlx::query("DELETE FROM ai_provider_configs WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user.id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if affected == 0 {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "provider_not_found"));
    }
    Ok(Json(json!({"ok":true})))
}

pub(crate) async fn default_provider_config(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let mut tx = state.db.begin().await?;
    let owns: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM ai_provider_configs WHERE id=$1 AND user_id=$2")
            .bind(id)
            .bind(user.id)
            .fetch_one(&mut *tx)
            .await?;
    if owns == 0 {
        return Err(ApiError::new(StatusCode::NOT_FOUND, "provider_not_found"));
    }
    sqlx::query(
        "UPDATE ai_provider_configs SET is_default=(id=$1),updated_at=now() WHERE user_id=$2",
    )
    .bind(id)
    .bind(user.id)
    .execute(&mut *tx)
    .await?;
    sqlx::query("INSERT INTO user_preferences(user_id,default_provider_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET default_provider_id=$2,updated_at=now()").bind(user.id).bind(id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true})))
}

pub(crate) async fn provider_runtime(
    state: &SharedState,
    user_id: Uuid,
    id: Uuid,
) -> Result<ProviderRuntime, ApiError> {
    let row=sqlx::query("SELECT provider,base_url,model,api_key_ciphertext FROM ai_provider_configs WHERE id=$1 AND user_id=$2").bind(id).bind(user_id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"provider_not_found"))?;
    let provider: String = row.get("provider");
    let base_url: String = row.get("base_url");
    if !provider_url_allowed(&provider, &base_url) {
        return Err(ApiError::bad_request());
    }
    Ok(ProviderRuntime {
        provider,
        base_url,
        model: row.get("model"),
        api_key: decrypt_key(state, row.get("api_key_ciphertext"))?,
    })
}

pub(crate) async fn record_ai_usage(
    state: &SharedState,
    user_id: Uuid,
    provider: &str,
    model: &str,
    input_chars: usize,
    output_chars: usize,
    latency_ms: u128,
    status: &str,
) {
    let _=sqlx::query("INSERT INTO ai_usage_events(user_id,provider,model,input_chars,output_chars,latency_ms,status) VALUES($1,$2,$3,$4,$5,$6,$7)")
        .bind(user_id).bind(provider).bind(model).bind(input_chars as i32).bind(output_chars as i32).bind(latency_ms.min(i32::MAX as u128) as i32).bind(status).execute(&state.db).await;
}

fn safe_file_name(value: &str) -> Option<String> {
    let name = Path::new(value)
        .file_name()?
        .to_string_lossy()
        .trim()
        .to_string();
    if name.is_empty()
        || Path::new(&name)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        None
    } else {
        Some(name)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_ollama_input, provider_url_allowed, replace_env_values, safe_file_name,
        OllamaConfigInput,
    };

    #[test]
    fn accepts_public_providers_and_rejects_internal_targets() {
        assert!(provider_url_allowed(
            "deepseek",
            "https://api.deepseek.com/v1"
        ));
        assert!(provider_url_allowed(
            "openai-compatible",
            "https://models.example.com/v1"
        ));
        assert!(!provider_url_allowed("deepseek", "https://example.com/v1"));
        assert!(!provider_url_allowed(
            "openai-compatible",
            "http://127.0.0.1:9000/v1"
        ));
        assert!(!provider_url_allowed(
            "openai-compatible",
            "https://169.254.169.254/v1"
        ));
    }

    #[test]
    fn strips_upload_paths_to_a_file_name() {
        assert_eq!(safe_file_name("paper.pdf").as_deref(), Some("paper.pdf"));
        assert_eq!(safe_file_name("../paper.pdf").as_deref(), Some("paper.pdf"));
        assert!(safe_file_name("").is_none());
    }

    #[test]
    fn updates_only_whitelisted_env_values() {
        let original = "R2_TOKEN=secret\n# models\nOLLAMA_URL=http://old:11434\nCHAT_MODEL=old\n";
        let updated = replace_env_values(
            original,
            &OllamaConfigInput {
                base_url: "http://127.0.0.1:11434".into(),
                embedding_model: "bge-m3".into(),
                chat_model: "qwen3:4b".into(),
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
        };
        assert!(normalize_ollama_input(input("http://127.0.0.1:11434")).is_ok());
        assert!(normalize_ollama_input(input("http://user:pass@localhost:11434")).is_err());
        assert!(normalize_ollama_input(input("http://localhost:11434/api")).is_err());
    }
}

pub(crate) async fn upload_material(
    State(state): State<SharedState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let admin = require_admin(&state, &headers).await?;
    let mut file: Option<(String, Vec<u8>)> = None;
    let mut metadata = serde_json::Map::new();
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::bad_request())?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            let filename = safe_file_name(field.file_name().unwrap_or("upload.bin"))
                .ok_or_else(ApiError::bad_request)?;
            let bytes = field.bytes().await.map_err(|_| ApiError::bad_request())?;
            if bytes.len() > 50 * 1024 * 1024 {
                return Err(ApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "file_too_large",
                ));
            }
            file = Some((filename, bytes.to_vec()));
        } else if matches!(
            name.as_str(),
            "domain" | "course" | "subject" | "grade" | "year" | "region" | "kind"
        ) {
            metadata.insert(name, Value::String(field.text().await.unwrap_or_default()));
        }
    }
    let (filename, bytes) = file.ok_or_else(ApiError::bad_request)?;
    let ext = Path::new(&filename)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        ext.as_str(),
        "doc" | "docx" | "pdf" | "png" | "jpg" | "jpeg" | "mp3" | "wav" | "zip"
    ) {
        return Err(ApiError::bad_request());
    }
    let upload_id = Uuid::new_v4();
    let relative = Path::new("_uploads")
        .join(upload_id.to_string())
        .join(&filename);
    let target = state.material_root.join(&relative);
    fs::create_dir_all(target.parent().ok_or_else(ApiError::server)?)
        .await
        .map_err(|_| ApiError::server())?;
    fs::write(&target, &bytes)
        .await
        .map_err(|_| ApiError::server())?;
    let relative_text = relative.to_string_lossy().replace('\\', "/");
    sqlx::query("INSERT INTO material_uploads(id,requested_by,file_name,relative_path,size_bytes,status,metadata) VALUES($1,$2,$3,$4,$5,'indexing',$6)")
        .bind(upload_id).bind(admin.id).bind(&filename).bind(&relative_text).bind(bytes.len() as i64).bind(Value::Object(metadata.clone())).execute(&state.db).await?;
    let db = state.db.clone();
    let project = state.project_root.clone();
    let target_clone = target.clone();
    tokio::spawn(async move {
        let result = Command::new("node")
            .arg("scripts/index-materials.mjs")
            .arg("--domain")
            .arg(
                metadata
                    .get("domain")
                    .and_then(Value::as_str)
                    .unwrap_or("high-school"),
            )
            .arg("--file")
            .arg(&target_clone)
            .current_dir(project)
            .status()
            .await;
        let (status, error) = match result {
            Ok(value) if value.success() => ("indexed", None),
            Ok(value) => ("failed", Some(format!("indexer exited {value}"))),
            Err(error) => ("failed", Some(error.to_string())),
        };
        let _ = sqlx::query(
            "UPDATE material_uploads SET status=$2,error=$3,updated_at=now() WHERE id=$1",
        )
        .bind(upload_id)
        .bind(status)
        .bind(error)
        .execute(&db)
        .await;
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(
            json!({"upload":{"id":upload_id,"fileName":filename,"sizeBytes":bytes.len(),"status":"indexing"}}),
        ),
    ))
}
