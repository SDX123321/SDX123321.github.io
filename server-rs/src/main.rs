use axum::{
    extract::{DefaultBodyLimit, Query, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use bcrypt::{hash as bcrypt_hash, verify as bcrypt_verify, DEFAULT_COST};
use chrono::{DateTime, Utc};
use deadpool_redis::{redis::AsyncCommands, Config as RedisConfig, Pool as RedisPool, Runtime};
use rand::{rngs::OsRng, RngCore};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::cors::{AllowOrigin, CorsLayer};
use uuid::Uuid;

mod admin;
mod high_school;
mod indexer;
mod knowledge;
mod learning;

const SESSION_COOKIE: &str = "exam_review_session";
const SESSION_DAYS: i64 = 30;
const CACHE_SECONDS: u64 = 60;

type SharedState = Arc<AppState>;

struct AppState {
    db: PgPool,
    redis: Option<RedisPool>,
    http: reqwest::Client,
    material_root: std::path::PathBuf,
    project_root: std::path::PathBuf,
    ollama_env_path: std::path::PathBuf,
    ollama_config: Arc<tokio::sync::RwLock<OllamaRuntimeConfig>>,
    ollama_config_write: tokio::sync::Mutex<()>,
    vector_enabled: bool,
    answer_rate: std::sync::Mutex<high_school::AnswerRateState>,
    answer_slots: Arc<tokio::sync::Semaphore>,
    api_config_key: [u8; 32],
    question_assets: Arc<std::collections::HashMap<String, Value>>,
}

#[derive(Clone, Serialize)]
struct OllamaRuntimeConfig {
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "embeddingModel")]
    embedding_model: String,
    #[serde(rename = "chatModel")]
    chat_model: String,
    #[serde(rename = "embeddingDimensions")]
    embedding_dimensions: usize,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    code: &'static str,
}

impl ApiError {
    fn new(status: StatusCode, code: &'static str) -> Self {
        Self { status, code }
    }
    fn bad_request() -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_input")
    }
    fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "not_authenticated")
    }
    fn forbidden() -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden")
    }
    fn server() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "server_error")
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.code }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        eprintln!("database error: {error}");
        ApiError::server()
    }
}

#[derive(Serialize)]
struct UserOut {
    id: Uuid,
    username: String,
    role: String,
    #[serde(rename = "created_at")]
    created_at: DateTime<Utc>,
    #[serde(rename = "last_login_at")]
    last_login_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
struct UserSession {
    id: Uuid,
    username: String,
    role: String,
    created_at: DateTime<Utc>,
    last_login_at: Option<DateTime<Utc>>,
}

impl From<UserSession> for UserOut {
    fn from(user: UserSession) -> Self {
        Self {
            id: user.id,
            username: user.username,
            role: user.role,
            created_at: user.created_at,
            last_login_at: user.last_login_at,
        }
    }
}

#[derive(Deserialize)]
struct AuthInput {
    username: String,
    password: String,
}

#[derive(Deserialize, Serialize, Default)]
struct ProgressSnapshot {
    #[serde(default, rename = "totalStudySeconds")]
    total_study_seconds: i32,
    #[serde(default, rename = "chapterDoneCount")]
    chapter_done_count: i32,
    #[serde(default, rename = "wrongCount")]
    wrong_count: i32,
    #[serde(default, rename = "practiceDoneCount")]
    practice_done_count: i32,
    #[serde(default, rename = "masteryItemCount")]
    mastery_item_count: i32,
    #[serde(default, rename = "scrollPositionCount")]
    scroll_position_count: i32,
    #[serde(default, rename = "recentPaths")]
    recent_paths: Vec<String>,
}

#[derive(Deserialize)]
struct ImportInput {
    #[serde(rename = "importId")]
    import_id: String,
    snapshot: ProgressSnapshot,
}

#[derive(Deserialize)]
struct StudyEventInput {
    #[serde(rename = "eventType")]
    event_type: String,
    course: Option<String>,
    subject: Option<String>,
    #[serde(rename = "pagePath")]
    page_path: Option<String>,
    #[serde(rename = "objectId")]
    object_id: Option<String>,
    #[serde(default)]
    payload: Value,
}

#[derive(Deserialize)]
struct GaokaoAttemptInput {
    #[serde(rename = "questionKey")]
    question_key: String,
    #[serde(rename = "subjectKey")]
    subject_key: Option<String>,
    result: String,
    #[serde(default, rename = "knowledgeNodes")]
    knowledge_nodes: Vec<String>,
    #[serde(rename = "promptSnapshot")]
    prompt_snapshot: Option<String>,
    #[serde(rename = "answerSnapshot")]
    answer_snapshot: Option<String>,
    #[serde(rename = "sourceType")]
    source_type: Option<String>,
    #[serde(default)]
    metadata: Value,
}

#[derive(Deserialize, Serialize)]
struct QuestionParams {
    subject: Option<String>,
    year: Option<i32>,
    difficulty: Option<String>,
    quality: Option<String>,
    #[serde(rename = "sourceType")]
    source_type: Option<String>,
    #[serde(rename = "hasSolution")]
    has_solution: Option<bool>,
    #[serde(rename = "solutionStatus")]
    solution_status: Option<String>,
    #[serde(rename = "includeHidden")]
    include_hidden: Option<bool>,
    cursor: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct RagSearchParams {
    q: Option<String>,
    subject: Option<String>,
    #[serde(rename = "docKind")]
    doc_kind: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
struct RagImportInput {
    #[serde(rename = "sourcePath")]
    source_path: String,
    #[serde(rename = "subjectKey")]
    subject_key: Option<String>,
    note: Option<String>,
    #[serde(default)]
    metadata: Value,
}

async fn load_question_assets(
    project_root: &std::path::Path,
) -> std::collections::HashMap<String, Value> {
    let path = project_root.join("src/data/gaokao-question-assets.json");
    let Ok(raw) = tokio::fs::read_to_string(path).await else {
        return std::collections::HashMap::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return std::collections::HashMap::new();
    };
    value
        .get("questions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some((
                item.get("questionKey")?.as_str()?.to_string(),
                item.get("images").cloned().unwrap_or_else(|| json!([])),
            ))
        })
        .collect()
}

async fn audit_question_completeness(
    db: &PgPool,
    project_root: &std::path::Path,
    assets: &std::collections::HashMap<String, Value>,
) -> anyhow::Result<()> {
    let rows = sqlx::query("SELECT id,question_key,prompt FROM gaokao_questions")
        .fetch_all(db)
        .await?;
    let asset_root = project_root.join("public/gaokao-assets/images");
    let mut ids = Vec::with_capacity(rows.len());
    let mut complete = Vec::with_capacity(rows.len());
    let mut reason_values = Vec::with_capacity(rows.len());
    for row in rows {
        let id: Uuid = row.get("id");
        let key: String = row.get("question_key");
        let prompt: String = row.get("prompt");
        let image_required = ["如图", "图中", "下图", "示意图", "图表", "看图", "据图"]
            .iter()
            .any(|marker| prompt.contains(marker));
        let images = assets
            .get(&key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut reasons = Vec::new();
        if prompt.trim().chars().count() < 12 {
            reasons.push("prompt_incomplete");
        }
        if image_required && images.is_empty() {
            reasons.push("required_image_missing");
        }
        for image in &images {
            if image.get("needsReview").and_then(Value::as_bool) == Some(true) {
                reasons.push("image_needs_review");
            }
            let url = image.get("url").and_then(Value::as_str).unwrap_or_default();
            let name = url.rsplit('/').next().unwrap_or_default();
            let supported = ["png", "jpg", "jpeg", "webp", "gif"]
                .iter()
                .any(|ext| name.to_ascii_lowercase().ends_with(ext));
            if !supported {
                reasons.push("unsupported_image");
            }
            if name.is_empty() || tokio::fs::metadata(asset_root.join(name)).await.is_err() {
                reasons.push("image_file_missing");
            }
        }
        reasons.sort();
        reasons.dedup();
        ids.push(id);
        complete.push(reasons.is_empty());
        reason_values.push(reasons.join(","));
    }
    sqlx::query(r#"UPDATE gaokao_questions q SET display_complete=v.complete,incomplete_reason=NULLIF(v.reason,'')
      FROM (SELECT * FROM unnest($1::uuid[],$2::bool[],$3::text[]) AS t(id,complete,reason)) v WHERE q.id=v.id"#)
        .bind(ids).bind(complete).bind(reason_values).execute(db).await?;
    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    if let Ok(path) = env::var("OLLAMA_ENV_PATH") {
        dotenvy::from_path_override(path).ok();
    }
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@127.0.0.1:5432/exam_review".to_string());
    let db = PgPoolOptions::new()
        .max_connections(
            env::var("DATABASE_POOL_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
        )
        .connect(&database_url)
        .await?;
    ensure_schema(&db).await?;
    let vector_enabled = high_school::ensure_schema(&db).await?;
    admin::ensure_schema(&db).await?;
    learning::ensure_schema(&db).await?;
    knowledge::ensure_schema(&db).await?;
    sqlx::migrate!("./migrations").run(&db).await?;
    learning::bootstrap_admin(&db).await?;

    let redis = env::var("REDIS_URL").ok().and_then(|url| {
        let cfg = RedisConfig {
            url: Some(url),
            ..Default::default()
        };
        cfg.create_pool(Some(Runtime::Tokio1)).ok()
    });

    let project_root = env::var("PROJECT_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .unwrap_or_else(|| std::path::Path::new("."))
                .to_path_buf()
        });
    let ollama_env_path = env::var("OLLAMA_ENV_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| project_root.join(".env"));
    let mut api_config_key = [0u8; 32];
    api_config_key.copy_from_slice(&Sha256::digest(
        env::var("AI_CONFIG_SECRET")
            .unwrap_or_else(|_| format!("{database_url}:exam-review-ai-config"))
            .as_bytes(),
    ));
    let question_assets = load_question_assets(&project_root).await;
    audit_question_completeness(&db, &project_root, &question_assets).await?;
    let material_root = env::var("MATERIAL_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\Users\zzz\Desktop\参考资料"));
    // Query vectors must match the active generation. The legacy material_chunks
    // column can have a different typmod (1024 in older installations), while
    // generation-scoped vectors are allowed to use the model's native size.
    let embedding_dimensions = sqlx::query_scalar::<_, i32>(
        r#"SELECT COALESCE(
          (SELECT dimensions FROM embedding_generations WHERE is_active ORDER BY activated_at DESC NULLS LAST LIMIT 1),
          (SELECT GREATEST(atttypmod,0) FROM pg_attribute WHERE attrelid='material_chunks'::regclass AND attname='embedding'),
          1024)"#,
    )
    .fetch_one(&db)
    .await? as usize;
    let state = Arc::new(AppState {
        db,
        redis,
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(180))
            .build()?,
        material_root,
        project_root,
        ollama_env_path,
        ollama_config: Arc::new(tokio::sync::RwLock::new(OllamaRuntimeConfig {
            base_url: env::var("OLLAMA_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".into()),
            embedding_model: env::var("EMBEDDING_MODEL").unwrap_or_else(|_| "bge-m3".into()),
            chat_model: env::var("CHAT_MODEL").unwrap_or_else(|_| "qwen3:4b".into()),
            embedding_dimensions,
        })),
        ollama_config_write: tokio::sync::Mutex::new(()),
        vector_enabled,
        answer_rate: std::sync::Mutex::new(high_school::AnswerRateState::default()),
        answer_slots: Arc::new(tokio::sync::Semaphore::new(
            env::var("ANSWER_CONCURRENCY")
                .ok()
                .and_then(|value| value.parse::<usize>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(16),
        )),
        api_config_key,
        question_assets: Arc::new(question_assets),
    });
    learning::migrate_seeded_graphs(state.clone());
    let client_origin =
        env::var("CLIENT_ORIGIN").unwrap_or_else(|_| "http://127.0.0.1:4173".to_string());
    let allow_origin = HeaderValue::from_str(&client_origin)
        .map(AllowOrigin::exact)
        .unwrap_or_else(|_| AllowOrigin::any());
    let cors = CorsLayer::new()
        .allow_origin(allow_origin)
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/api/gaokao/summary", get(gaokao_summary))
        .route("/health/live", get(health_live))
        .route("/health/ready", get(health_ready))
        .route("/metrics", get(prometheus_metrics))
        .route("/api/docs", get(openapi_ui))
        .route("/api/docs/openapi.yaml", get(openapi_spec))
        .route("/api/gaokao/subjects", get(gaokao_subjects))
        .route("/api/gaokao/questions", get(gaokao_questions))
        .route("/api/gaokao/attempts", post(gaokao_attempts))
        .route("/api/gaokao/weaknesses", get(gaokao_weaknesses))
        .route("/api/gaokao/rag/summary", get(gaokao_rag_summary))
        .route("/api/gaokao/rag/search", get(gaokao_rag_search))
        .route("/api/gaokao/rag/imports", post(gaokao_rag_import))
        .route("/api/high-school/overview", get(high_school::overview))
        .route("/api/high-school/materials", get(high_school::materials))
        .route("/api/high-school/materials/:id", get(high_school::material))
        .route(
            "/api/high-school/materials/:id/preview",
            get(high_school::material_preview),
        )
        .route(
            "/api/high-school/materials/:id/download",
            get(high_school::download),
        )
        .route(
            "/api/high-school/materials/:id/file-preview",
            get(high_school::file_preview),
        )
        .route("/api/high-school/rag/search", get(high_school::rag_search))
        .route("/api/high-school/rag/answer", post(high_school::answer))
        .route("/api/domains", get(knowledge::domains))
        .route("/api/knowledge/materials", get(knowledge::materials))
        .route("/api/knowledge/search", post(knowledge::search))
        .route("/api/knowledge/rag/answer", post(knowledge::answer))
        .route(
            "/api/knowledge/suggested-questions",
            get(knowledge::suggested_questions),
        )
        .route(
            "/api/knowledge/graphs/current",
            get(knowledge::current_graph),
        )
        .route(
            "/api/admin/knowledge/graph-runs",
            post(knowledge::start_graph),
        )
        .route(
            "/api/admin/knowledge/suggested-question-runs",
            post(knowledge::start_suggestion_run),
        )
        .route(
            "/api/admin/knowledge/suggested-question-runs/:id",
            get(knowledge::suggestion_run),
        )
        .route(
            "/api/admin/knowledge/web-research-runs",
            post(knowledge::start_web_research),
        )
        .route(
            "/api/admin/knowledge/web-research-runs/:id",
            get(knowledge::web_research_run),
        )
        .route(
            "/api/admin/knowledge/web-evidence",
            get(knowledge::web_evidence),
        )
        .route(
            "/api/admin/knowledge/index-runs",
            post(high_school::start_index),
        )
        .route(
            "/api/admin/knowledge/index-runs/:id",
            get(high_school::index_run),
        )
        .route(
            "/api/admin/knowledge/index-runs/:id/:action",
            post(high_school::index_action),
        )
        .route(
            "/api/admin/knowledge/graph-runs/:id",
            get(knowledge::graph_run),
        )
        .route(
            "/api/admin/knowledge/graphs/:id",
            axum::routing::patch(knowledge::patch_graph),
        )
        .route(
            "/api/admin/knowledge/graphs/:id/publish",
            post(knowledge::publish_graph),
        )
        .route(
            "/api/me/knowledge-nodes/:id",
            axum::routing::put(knowledge::save_node_state),
        )
        .route(
            "/api/high-school/rag/sources/:id",
            get(high_school::source_preview),
        )
        .route(
            "/api/admin/high-school/index-runs",
            post(high_school::start_index),
        )
        .route(
            "/api/admin/high-school/index-runs/:id",
            get(high_school::index_run),
        )
        .route("/api/admin/overview", get(admin::overview))
        .route(
            "/api/admin/runtime-config/ollama",
            get(admin::ollama_config).put(admin::save_ollama_config),
        )
        .route(
            "/api/admin/runtime-config/ollama/test",
            post(admin::test_ollama_config),
        )
        .route("/api/admin/accounts", get(admin::accounts))
        .route("/api/admin/accounts/:id/risk", post(admin::account_risk))
        .route(
            "/api/admin/materials/upload",
            post(admin::upload_material).layer(DefaultBodyLimit::max(64 * 1024 * 1024)),
        )
        .route(
            "/api/me/ai-providers",
            get(admin::provider_configs).post(admin::save_provider_config),
        )
        .route(
            "/api/me/ai-providers/:id",
            delete(admin::delete_provider_config),
        )
        .route(
            "/api/me/ai-providers/:id/default",
            post(admin::default_provider_config),
        )
        .route(
            "/api/me/preferences",
            get(learning::preferences).put(learning::save_preferences),
        )
        .route(
            "/api/me/conversations",
            get(learning::conversations).post(learning::create_conversation),
        )
        .route(
            "/api/me/conversations/:id",
            get(learning::conversation_messages)
                .patch(learning::patch_conversation)
                .delete(learning::delete_conversation),
        )
        .route(
            "/api/me/knowledge-graphs",
            get(learning::graphs).post(learning::start_graph),
        )
        .route(
            "/api/me/knowledge-graphs/:id",
            get(learning::graph).delete(learning::delete_graph),
        )
        .route("/api/me/knowledge-graph-runs/:id", get(learning::graph_run))
        .route("/api/me/password", post(learning::change_password))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/me", get(me))
        .route("/api/me/stats", get(me_stats))
        .route("/api/me/import-local", post(import_local))
        .route("/api/study/event", post(study_event))
        .route("/api/handshake", post(api_handshake))
        .layer(middleware::from_fn_with_state(state.clone(), api_key_auth))
        .layer(cors)
        .with_state(state);

    let port = env::var("API_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(8787);
    let host = env::var("API_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let addr: SocketAddr = format!("{host}:{port}").parse()?;
    println!("Rust API listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health_live() -> Json<Value> {
    Json(json!({"status":"ok","service":"exam-review-api","version":env!("CARGO_PKG_VERSION")}))
}

async fn health_ready(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await?;
    Ok(Json(
        json!({"status":"ready","database":"ok","vectorEnabled":state.vector_enabled}),
    ))
}

async fn prometheus_metrics(State(state): State<SharedState>) -> Response {
    let active: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM embedding_generations WHERE is_active")
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_index_runs WHERE status IN ('queued','running','paused')",
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);
    let body=format!("# HELP exam_review_up API process health\n# TYPE exam_review_up gauge\nexam_review_up 1\n# HELP exam_review_db_pool_size PostgreSQL pool connections\n# TYPE exam_review_db_pool_size gauge\nexam_review_db_pool_size {}\n# HELP exam_review_db_pool_idle Idle PostgreSQL pool connections\n# TYPE exam_review_db_pool_idle gauge\nexam_review_db_pool_idle {}\n# HELP exam_review_active_embedding_generations Active embedding generations\n# TYPE exam_review_active_embedding_generations gauge\nexam_review_active_embedding_generations {active}\n# HELP exam_review_running_index_jobs Running or paused index jobs\n# TYPE exam_review_running_index_jobs gauge\nexam_review_running_index_jobs {running}\n",state.db.size(),state.db.num_idle());
    let mut response = Response::new(axum::body::Body::from(body));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );
    response
}

async fn openapi_spec() -> Response {
    let mut response = Response::new(axum::body::Body::from(include_str!("../openapi.yaml")));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/yaml; charset=utf-8"),
    );
    response
}

async fn openapi_ui() -> Response {
    let html = r#"<!doctype html><html><head><meta charset="utf-8"><title>Exam Review API</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({url:'/api/docs/openapi.yaml',dom_id:'#swagger-ui',deepLinking:true})</script></body></html>"#;
    let mut response = Response::new(axum::body::Body::from(html));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    response
}

async fn cache_get<T: DeserializeOwned>(redis: &Option<RedisPool>, key: &str) -> Option<T> {
    let pool = redis.as_ref()?;
    let mut conn = pool.get().await.ok()?;
    let raw: String = conn.get(key).await.ok()?;
    serde_json::from_str(&raw).ok()
}

async fn cache_set<T: Serialize>(redis: &Option<RedisPool>, key: &str, value: &T) {
    let Some(pool) = redis else { return };
    let Ok(mut conn) = pool.get().await else {
        return;
    };
    let Ok(raw) = serde_json::to_string(value) else {
        return;
    };
    let _: Result<(), _> = conn.set_ex(key, raw, CACHE_SECONDS).await;
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn parse_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let mut pieces = part.trim().splitn(2, '=');
        let key = pieces.next()?.trim();
        let value = pieces.next()?.trim();
        (key == name).then(|| value.to_string())
    })
}

fn session_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age={}; HttpOnly; SameSite=Lax",
        SESSION_DAYS * 24 * 60 * 60
    )
}

fn clear_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
}

fn validate_auth(input: &AuthInput) -> bool {
    let username = input.username.trim();
    let user_ok = (3..=32).contains(&username.chars().count())
        && username.chars().all(|ch| {
            ch.is_ascii_alphanumeric()
                || ch == '_'
                || ch == '-'
                || ('\u{4e00}'..='\u{9fa5}').contains(&ch)
        });
    let pass_ok = (6..=100).contains(&input.password.chars().count());
    user_ok && pass_ok
}

async fn auth_user(state: &SharedState, headers: &HeaderMap) -> Result<UserSession, ApiError> {
    let token = parse_cookie(headers, SESSION_COOKIE).ok_or_else(ApiError::unauthorized)?;
    let token_hash = hash_token(&token);
    let row = sqlx::query(
        r#"SELECT users.id, users.username, users.role, users.created_at, users.last_login_at
           FROM sessions JOIN users ON users.id = sessions.user_id
           WHERE sessions.token_hash = $1 AND sessions.expires_at > now()
             AND users.risk_status = 'active'
             AND (users.locked_until IS NULL OR users.locked_until <= now())"#,
    )
    .bind(token_hash)
    .fetch_optional(&state.db)
    .await?;
    let row = row.ok_or_else(ApiError::unauthorized)?;
    Ok(UserSession {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        last_login_at: row.try_get("last_login_at")?,
    })
}

fn auth_request_context(headers: &HeaderMap) -> (Option<String>, Option<String>) {
    let ip = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(|value| value.trim().chars().take(64).collect());
    let agent = headers
        .get(header::USER_AGENT)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.chars().take(300).collect());
    (ip, agent)
}

async fn record_auth_event(
    state: &SharedState,
    headers: &HeaderMap,
    user_id: Option<Uuid>,
    username: &str,
    event_type: &str,
    risk_level: &str,
) {
    let (ip, agent) = auth_request_context(headers);
    let _ = sqlx::query("INSERT INTO auth_events(user_id,username,event_type,ip_address,user_agent,risk_level) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(user_id).bind(username).bind(event_type).bind(ip).bind(agent).bind(risk_level).execute(&state.db).await;
}

async fn create_session(state: &SharedState, user_id: Uuid) -> Result<String, ApiError> {
    let token = new_token();
    sqlx::query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)")
        .bind(user_id)
        .bind(hash_token(&token))
        .bind(SESSION_DAYS)
        .execute(&state.db)
        .await?;
    Ok(token)
}

async fn get_stats(db: &PgPool, user_id: Uuid) -> Result<Value, ApiError> {
    let row = sqlx::query(
        r#"SELECT total_study_seconds, chapter_done_count, wrong_count, practice_done_count,
                  mastery_item_count, scroll_position_count, recent_paths, current_streak_days,
                  last_activity_at, updated_at
           FROM study_snapshots WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;
    if let Some(row) = row {
        Ok(json!({
            "totalStudySeconds": row.try_get::<i32, _>("total_study_seconds")?,
            "chapterDoneCount": row.try_get::<i32, _>("chapter_done_count")?,
            "wrongCount": row.try_get::<i32, _>("wrong_count")?,
            "practiceDoneCount": row.try_get::<i32, _>("practice_done_count")?,
            "masteryItemCount": row.try_get::<i32, _>("mastery_item_count")?,
            "scrollPositionCount": row.try_get::<i32, _>("scroll_position_count")?,
            "recentPaths": row.try_get::<Value, _>("recent_paths")?,
            "currentStreakDays": row.try_get::<i32, _>("current_streak_days")?,
            "lastActivityAt": row.try_get::<Option<DateTime<Utc>>, _>("last_activity_at")?,
            "updatedAt": row.try_get::<DateTime<Utc>, _>("updated_at")?,
        }))
    } else {
        Ok(json!({
            "totalStudySeconds": 0, "chapterDoneCount": 0, "wrongCount": 0,
            "practiceDoneCount": 0, "masteryItemCount": 0, "scrollPositionCount": 0,
            "recentPaths": [], "currentStreakDays": 0, "lastActivityAt": null, "updatedAt": null,
        }))
    }
}

fn recent_paths(existing: &Value, incoming: &[String]) -> Value {
    let mut paths = Vec::<String>::new();
    for path in incoming.iter().filter(|item| !item.is_empty()) {
        if !paths.contains(path) {
            paths.push(path.clone());
        }
    }
    if let Some(items) = existing.as_array() {
        for item in items.iter().filter_map(|item| item.as_str()) {
            let path = item.to_string();
            if !paths.contains(&path) {
                paths.push(path);
            }
        }
    }
    paths.truncate(10);
    json!(paths)
}

async fn upsert_snapshot(
    db: &PgPool,
    user_id: Uuid,
    snapshot: &ProgressSnapshot,
    mode: &str,
) -> Result<(), ApiError> {
    let current = get_stats(db, user_id).await?;
    let current_num = |key: &str| current.get(key).and_then(Value::as_i64).unwrap_or(0) as i32;
    let next_total = if mode == "add" {
        current_num("totalStudySeconds") + snapshot.total_study_seconds
    } else {
        current_num("totalStudySeconds").max(snapshot.total_study_seconds)
    };
    let next_recent = recent_paths(
        current.get("recentPaths").unwrap_or(&json!([])),
        &snapshot.recent_paths,
    );
    sqlx::query(
        r#"INSERT INTO study_snapshots (
             user_id, total_study_seconds, chapter_done_count, wrong_count, practice_done_count,
             mastery_item_count, scroll_position_count, recent_paths, last_activity_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
           ON CONFLICT (user_id) DO UPDATE SET
             total_study_seconds = EXCLUDED.total_study_seconds,
             chapter_done_count = EXCLUDED.chapter_done_count,
             wrong_count = EXCLUDED.wrong_count,
             practice_done_count = EXCLUDED.practice_done_count,
             mastery_item_count = EXCLUDED.mastery_item_count,
             scroll_position_count = EXCLUDED.scroll_position_count,
             recent_paths = EXCLUDED.recent_paths,
             last_activity_at = now(), updated_at = now()"#,
    )
    .bind(user_id)
    .bind(next_total)
    .bind(current_num("chapterDoneCount").max(snapshot.chapter_done_count))
    .bind(current_num("wrongCount").max(snapshot.wrong_count))
    .bind(current_num("practiceDoneCount").max(snapshot.practice_done_count))
    .bind(current_num("masteryItemCount").max(snapshot.mastery_item_count))
    .bind(current_num("scrollPositionCount").max(snapshot.scroll_position_count))
    .bind(next_recent)
    .execute(db)
    .await?;
    Ok(())
}

async fn increment_snapshot(
    db: &PgPool,
    user_id: Uuid,
    field: &str,
    page_path: Option<String>,
) -> Result<(), ApiError> {
    let current = get_stats(db, user_id).await?;
    let mut snapshot = ProgressSnapshot {
        total_study_seconds: current
            .get("totalStudySeconds")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        chapter_done_count: current
            .get("chapterDoneCount")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        wrong_count: current
            .get("wrongCount")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        practice_done_count: current
            .get("practiceDoneCount")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        mastery_item_count: current
            .get("masteryItemCount")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        scroll_position_count: current
            .get("scrollPositionCount")
            .and_then(Value::as_i64)
            .unwrap_or(0) as i32,
        recent_paths: page_path.into_iter().collect(),
    };
    match field {
        "chapter_done_count" => snapshot.chapter_done_count += 1,
        "wrong_count" => snapshot.wrong_count += 1,
        "practice_done_count" => snapshot.practice_done_count += 1,
        _ => {}
    }
    upsert_snapshot(db, user_id, &snapshot, "max").await
}

async fn gaokao_summary(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:summary:v1";
    if let Some(value) = cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }
    let profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_subject_profiles")
        .fetch_one(&state.db)
        .await?;
    let papers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_papers")
        .fetch_one(&state.db)
        .await?;
    let questions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_questions")
        .fetch_one(&state.db)
        .await?;
    let by_source = rows_to_values(sqlx::query(r#"SELECT source_type AS "sourceType", COUNT(*)::int AS count FROM gaokao_questions GROUP BY source_type ORDER BY source_type"#).fetch_all(&state.db).await?, &["sourceType", "count"])?;
    let by_quality = rows_to_values(sqlx::query(r#"SELECT quality, COUNT(*)::int AS count FROM gaokao_questions GROUP BY quality ORDER BY quality"#).fetch_all(&state.db).await?, &["quality", "count"])?;
    let last_import = sqlx::query(r#"SELECT import_key AS "importKey", summary, created_at AS "createdAt" FROM gaokao_import_runs ORDER BY created_at DESC LIMIT 1"#)
        .fetch_optional(&state.db).await?.map(|row| json!({
            "importKey": row.try_get::<String, _>("importKey").ok(),
            "summary": row.try_get::<Value, _>("summary").ok(),
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt").ok(),
        }));
    let value = json!({ "subjects": profiles, "papers": papers, "questions": questions, "bySource": by_source, "byQuality": by_quality, "lastImport": last_import });
    cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

async fn gaokao_subjects(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:subjects:v1";
    if let Some(value) = cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }
    let rows = sqlx::query(
        r#"SELECT profile.subject_key AS "subjectKey", profile.subject_name AS "subjectName",
                  profile.accent, profile.icon, profile.route, profile.trend, profile.advice,
                  profile.high_frequency AS "highFrequency", profile.easy_mistakes AS "easyMistakes",
                  COALESCE(paper_counts.count, 0)::int AS "paperCount",
                  COALESCE(question_counts.count, 0)::int AS "questionCount"
           FROM gaokao_subject_profiles profile
           LEFT JOIN (SELECT subject_key, COUNT(*) AS count FROM gaokao_papers GROUP BY subject_key) paper_counts ON paper_counts.subject_key = profile.subject_key
           LEFT JOIN (SELECT subject_key, COUNT(*) AS count FROM gaokao_questions GROUP BY subject_key) question_counts ON question_counts.subject_key = profile.subject_key
           ORDER BY profile.subject_key"#,
    ).fetch_all(&state.db).await?;
    let subjects: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "subjectKey": row.try_get::<String, _>("subjectKey")?,
                "subjectName": row.try_get::<String, _>("subjectName")?,
                "accent": row.try_get::<Option<String>, _>("accent")?,
                "icon": row.try_get::<Option<String>, _>("icon")?,
                "route": row.try_get::<Option<String>, _>("route")?,
                "trend": row.try_get::<Option<String>, _>("trend")?,
                "advice": row.try_get::<Option<String>, _>("advice")?,
                "highFrequency": row.try_get::<Value, _>("highFrequency")?,
                "easyMistakes": row.try_get::<Value, _>("easyMistakes")?,
                "paperCount": row.try_get::<i32, _>("paperCount")?,
                "questionCount": row.try_get::<i32, _>("questionCount")?,
            }))
        })
        .collect();
    let value = json!({ "subjects": subjects? });
    cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

async fn gaokao_questions(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<QuestionParams>,
) -> Result<Json<Value>, ApiError> {
    let include_hidden = if params.include_hidden.unwrap_or(false) {
        auth_user(&state, &headers)
            .await
            .map(|user| user.role == "admin")
            .unwrap_or(false)
    } else {
        false
    };
    let limit = params.limit.unwrap_or(100).clamp(1, 500);
    let offset = params
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0);
    let cache_key = format!(
        "gaokao:questions:v4:{}:{}:{}",
        offset,
        include_hidden,
        serde_json::to_string(&params).unwrap_or_default()
    );
    if let Some(value) = cache_get(&state.redis, &cache_key).await {
        return Ok(Json(value));
    }
    let total_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM gaokao_questions
           WHERE ($1::text IS NULL OR subject_key = $1)
             AND ($2::int IS NULL OR year = $2)
             AND ($3::text IS NULL OR difficulty = $3)
             AND ($4::text IS NULL OR quality = $4)
             AND ($5::text IS NULL OR source_type = $5)
             AND ($6::bool IS NULL OR (($6 = true AND jsonb_array_length(solution) > 0) OR ($6 = false AND jsonb_array_length(solution) = 0)))
             AND ($7::text IS NULL OR metadata #>> '{solutionEnrichment,status}' = $7)
             AND ($8::bool = true OR (COALESCE(metadata #>> '{cleanup,status}', '') <> 'soft_deleted' AND display_complete))"#,
    )
    .bind(params.subject.as_deref()).bind(params.year).bind(params.difficulty.as_deref())
    .bind(params.quality.as_deref()).bind(params.source_type.as_deref()).bind(params.has_solution)
    .bind(params.solution_status.as_deref())
    .bind(include_hidden)
    .fetch_one(&state.db).await?;
    let rows = sqlx::query(
        r#"SELECT id, question_key AS "questionKey", year, subject_key AS "subjectKey",
                  subject_name AS "subjectName", question_number AS "questionNumber",
                  question_type AS "questionType", difficulty, quality, prompt, answer, solution,
                  flags, source_type AS "sourceType", metadata, display_complete AS "displayComplete", incomplete_reason AS "incompleteReason", updated_at AS "updatedAt"
           FROM gaokao_questions
           WHERE ($1::text IS NULL OR subject_key = $1)
             AND ($2::int IS NULL OR year = $2)
             AND ($3::text IS NULL OR difficulty = $3)
             AND ($4::text IS NULL OR quality = $4)
             AND ($5::text IS NULL OR source_type = $5)
             AND ($6::bool IS NULL OR (($6 = true AND jsonb_array_length(solution) > 0) OR ($6 = false AND jsonb_array_length(solution) = 0)))
             AND ($7::text IS NULL OR metadata #>> '{solutionEnrichment,status}' = $7)
             AND ($8::bool = true OR (COALESCE(metadata #>> '{cleanup,status}', '') <> 'soft_deleted' AND display_complete))
           ORDER BY year NULLS LAST, subject_key, question_number NULLS LAST, updated_at DESC, id
           LIMIT $9 OFFSET $10"#,
    )
    .bind(params.subject.as_deref()).bind(params.year).bind(params.difficulty.as_deref())
    .bind(params.quality.as_deref()).bind(params.source_type.as_deref()).bind(params.has_solution)
    .bind(params.solution_status.as_deref())
    .bind(include_hidden)
    .bind(limit).bind(offset).fetch_all(&state.db).await?;
    let questions: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| question_row(row, &state.question_assets))
        .collect();
    let questions = questions?;
    let loaded = offset + questions.len() as i64;
    let has_more = loaded < total_count;
    let value = json!({
        "questions": questions,
        "pageInfo": { "nextCursor": if has_more { Some(loaded.to_string()) } else { None }, "hasMore": has_more, "totalLoaded": loaded, "totalCount": total_count }
    });
    cache_set(&state.redis, &cache_key, &value).await;
    Ok(Json(value))
}

fn question_row(
    row: sqlx::postgres::PgRow,
    question_assets: &std::collections::HashMap<String, Value>,
) -> Result<Value, sqlx::Error> {
    let solution: Value = row.try_get("solution")?;
    let metadata: Value = row.try_get("metadata")?;
    let subject_key: String = row.try_get("subjectKey")?;
    let question_type: Option<String> = row.try_get("questionType")?;
    let difficulty: Option<String> = row.try_get("difficulty")?;
    let source_type: String = row.try_get("sourceType")?;
    let prompt: String = row.try_get("prompt")?;
    let flags: Value = row.try_get("flags")?;
    let question_type_label = infer_question_type(&subject_key, question_type.as_deref(), &prompt);
    let source_type_label = source_type_label(&source_type);
    let (materials, stem) = split_reading_material(&subject_key, &prompt, &metadata);
    let solution_status = metadata
        .pointer("/solutionEnrichment/status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut display_tags = vec![question_type_label.clone(), source_type_label.clone()];
    if let Some(label) = difficulty.as_deref().map(difficulty_label) {
        display_tags.push(label);
    }
    if let Some(status) = solution_status.as_deref().and_then(solution_status_label) {
        display_tags.push(status);
    }
    display_tags.sort();
    display_tags.dedup();

    let mut admin_tags = value_string_vec(&flags);
    admin_tags.push(format!("quality:{}", row.try_get::<String, _>("quality")?));
    admin_tags.push(format!("sourceType:{}", source_type));
    if let Some(status) = metadata.pointer("/cleanup/status").and_then(Value::as_str) {
        admin_tags.push(format!("cleanup:{}", status));
    }
    if let Some(status) = solution_status.as_deref() {
        admin_tags.push(format!("solution:{}", status));
    }
    admin_tags.sort();
    admin_tags.dedup();

    let question_key: String = row.try_get("questionKey")?;
    let images = question_assets
        .get(&question_key)
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "questionKey": question_key,
        "year": row.try_get::<Option<i32>, _>("year")?,
        "subjectKey": subject_key,
        "subjectName": row.try_get::<String, _>("subjectName")?,
        "questionNumber": row.try_get::<Option<i32>, _>("questionNumber")?,
        "questionType": question_type,
        "questionTypeLabel": question_type_label,
        "difficulty": difficulty,
        "quality": row.try_get::<String, _>("quality")?,
        "prompt": prompt,
        "stem": stem,
        "materials": materials,
        "images": images,
        "answer": row.try_get::<Option<String>, _>("answer")?,
        "solution": solution,
        "flags": flags,
        "sourceType": source_type,
        "sourceTypeLabel": source_type_label,
        "displayTags": display_tags,
        "adminTags": admin_tags,
        "isHidden": metadata.pointer("/cleanup/status").and_then(Value::as_str) == Some("soft_deleted"),
        "displayComplete": row.try_get::<bool,_>("displayComplete")?,
        "incompleteReason": row.try_get::<Option<String>,_>("incompleteReason")?,
        "metadata": metadata,
        "hasSolution": solution.as_array().map(|items| !items.is_empty()).unwrap_or(false),
        "solutionStatus": solution_status,
        "updatedAt": row.try_get::<DateTime<Utc>, _>("updatedAt")?,
    }))
}

fn value_string_vec(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("tag").and_then(Value::as_str))
            })
            .map(str::to_string)
            .filter(|item| !item.trim().is_empty())
            .collect(),
        Value::String(item) if !item.trim().is_empty() => vec![item.to_string()],
        _ => Vec::new(),
    }
}

fn infer_question_type(subject_key: &str, raw: Option<&str>, prompt: &str) -> String {
    if let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) {
        if value
            .chars()
            .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch))
        {
            return value.to_string();
        }
        let lowered = value.to_ascii_lowercase();
        if lowered.contains("choice") || lowered == "single" || lowered == "multiple" {
            return "选择题".to_string();
        }
        if lowered.contains("fill") || lowered.contains("blank") {
            return "填空题".to_string();
        }
        if lowered.contains("essay")
            || lowered.contains("composition")
            || lowered.contains("writing")
        {
            return "写作题".to_string();
        }
        if lowered.contains("proof") || lowered.contains("solve") || lowered.contains("answer") {
            return "解答题".to_string();
        }
        if lowered.contains("reading") {
            return "阅读理解".to_string();
        }
    }

    if subject_key == "chinese" {
        if prompt.contains("作文") || prompt.contains("写作") {
            return "写作题".to_string();
        }
        if prompt.contains("文言文") || prompt.contains("翻译") {
            return "文言文阅读".to_string();
        }
        if prompt.contains("古诗") || prompt.contains("诗歌") {
            return "古诗文鉴赏".to_string();
        }
        if prompt.contains("阅读") || prompt.contains("材料") {
            return "阅读理解".to_string();
        }
    }
    if prompt.contains("A.") || prompt.contains("A．") || prompt.contains("A、") {
        return "选择题".to_string();
    }
    if prompt.contains("证明") || prompt.contains("求") || prompt.contains("解答") {
        return "解答题".to_string();
    }
    "综合题".to_string()
}

fn difficulty_label(value: &str) -> String {
    match value {
        "easy" => "基础巩固".to_string(),
        "medium" => "迁移应用".to_string(),
        "hard" => "综合创新".to_string(),
        _ => "难度待标注".to_string(),
    }
}

fn source_type_label(value: &str) -> String {
    match value {
        "real" => "真题入库".to_string(),
        "real-docx" => "文档抽取".to_string(),
        "real-pdf-text" => "文本抽取".to_string(),
        "real-ocr" => "扫描识别".to_string(),
        "generated" => "变式训练".to_string(),
        _ => "结构化题库".to_string(),
    }
}

fn solution_status_label(value: &str) -> Option<String> {
    match value {
        "generated" => Some("已生成分步思路".to_string()),
        "needs_review" => Some("需教师复核".to_string()),
        "failed" => Some("题解待补全".to_string()),
        "skipped" => Some("保留原解析".to_string()),
        _ => None,
    }
}

fn split_reading_material(
    subject_key: &str,
    prompt: &str,
    metadata: &Value,
) -> (Vec<Value>, String) {
    if let Some(items) = metadata.get("materials").and_then(Value::as_array) {
        let materials: Vec<Value> = items.to_vec();
        if !materials.is_empty() {
            return (materials, prompt.to_string());
        }
    }
    if subject_key != "chinese" || !(prompt.contains("阅读") || prompt.contains("材料")) {
        return (Vec::new(), prompt.to_string());
    }
    let markers = ["\n（1）", "\n(1)", "\n1．", "\n1.", "\n①"];
    let split_at = markers
        .iter()
        .filter_map(|marker| prompt.find(marker))
        .filter(|index| *index > 120)
        .min();
    if let Some(index) = split_at {
        let material = prompt[..index].trim();
        let stem = prompt[index..].trim();
        if material.len() > 80 && stem.len() > 8 {
            return (
                vec![json!({ "title": "阅读材料", "content": material })],
                stem.to_string(),
            );
        }
    }
    (Vec::new(), prompt.to_string())
}

fn rows_to_values(
    rows: Vec<sqlx::postgres::PgRow>,
    keys: &[&str],
) -> Result<Vec<Value>, sqlx::Error> {
    rows.into_iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for key in keys {
                if let Ok(value) = row.try_get::<String, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i32, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i64, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<Value, _>(*key) {
                    map.insert((*key).to_string(), value);
                }
            }
            Ok(Value::Object(map))
        })
        .collect()
}

async fn gaokao_attempts(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<GaokaoAttemptInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if input.question_key.is_empty() || !matches!(input.result.as_str(), "correct" | "wrong") {
        return Err(ApiError::bad_request());
    }
    sqlx::query(
        r#"INSERT INTO gaokao_answer_attempts (user_id, question_key, subject_key, result, knowledge_nodes, prompt_snapshot, answer_snapshot, source_type, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
    )
    .bind(user.id).bind(input.question_key).bind(input.subject_key).bind(input.result).bind(json!(input.knowledge_nodes))
    .bind(input.prompt_snapshot).bind(input.answer_snapshot).bind(input.source_type).bind(input.metadata)
    .execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}

async fn gaokao_weaknesses(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let rows = sqlx::query(
        r#"SELECT node.value AS "knowledgeNode", COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE result = 'correct')::int AS correct,
                  COUNT(*) FILTER (WHERE result = 'wrong')::int AS wrong,
                  MAX(answered_at) AS "lastAnsweredAt"
           FROM gaokao_answer_attempts
           CROSS JOIN LATERAL jsonb_array_elements_text(knowledge_nodes) AS node(value)
           WHERE user_id = $1
           GROUP BY node.value
           ORDER BY wrong DESC, total DESC, "lastAnsweredAt" DESC
           LIMIT 30"#,
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let weaknesses: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "knowledgeNode": row.try_get::<String, _>("knowledgeNode")?,
                "total": row.try_get::<i32, _>("total")?,
                "correct": row.try_get::<i32, _>("correct")?,
                "wrong": row.try_get::<i32, _>("wrong")?,
                "lastAnsweredAt": row.try_get::<Option<DateTime<Utc>>, _>("lastAnsweredAt")?,
            }))
        })
        .collect();
    Ok(Json(json!({ "weaknesses": weaknesses? })))
}

async fn gaokao_rag_summary(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:rag:summary:v1";
    if let Some(value) = cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }

    let document_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_rag_documents")
        .fetch_one(&state.db)
        .await?;
    let chunk_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_rag_chunks")
        .fetch_one(&state.db)
        .await?;
    let by_subject = rows_to_values(
        sqlx::query(
            r#"SELECT subject_key AS "subjectKey", COUNT(*)::int AS documents,
                      COALESCE(SUM(text_length), 0)::bigint AS "textLength"
               FROM gaokao_rag_documents
               GROUP BY subject_key
               ORDER BY subject_key"#,
        )
        .fetch_all(&state.db)
        .await?,
        &["subjectKey", "documents", "textLength"],
    )?;
    let by_kind = rows_to_values(
        sqlx::query(
            r#"SELECT doc_kind AS "docKind", COUNT(*)::int AS documents
               FROM gaokao_rag_documents
               GROUP BY doc_kind
               ORDER BY doc_kind"#,
        )
        .fetch_all(&state.db)
        .await?,
        &["docKind", "documents"],
    )?;
    let last_import = sqlx::query(
        r#"SELECT import_key AS "importKey", summary, created_at AS "createdAt"
           FROM gaokao_import_runs
           WHERE summary ->> 'kind' = 'rag-index'
           ORDER BY created_at DESC
           LIMIT 1"#,
    )
    .fetch_optional(&state.db)
    .await?
    .map(|row| {
        json!({
            "importKey": row.try_get::<String, _>("importKey").ok(),
            "summary": row.try_get::<Value, _>("summary").ok(),
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt").ok(),
        })
    });
    let pending_rows = sqlx::query(
        r#"SELECT source_path AS "sourcePath", subject_key AS "subjectKey", note, status,
                  created_at AS "createdAt"
           FROM gaokao_rag_imports
           ORDER BY created_at DESC
           LIMIT 10"#,
    )
    .fetch_all(&state.db)
    .await?;
    let pending_imports: Result<Vec<_>, sqlx::Error> = pending_rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "sourcePath": row.try_get::<String, _>("sourcePath")?,
                "subjectKey": row.try_get::<Option<String>, _>("subjectKey")?,
                "note": row.try_get::<Option<String>, _>("note")?,
                "status": row.try_get::<String, _>("status")?,
                "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt")?,
            }))
        })
        .collect();
    let value = json!({
        "documents": document_count,
        "chunks": chunk_count,
        "bySubject": by_subject,
        "byKind": by_kind,
        "lastImport": last_import,
        "pendingImports": pending_imports?,
    });
    cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

async fn gaokao_rag_search(
    State(state): State<SharedState>,
    Query(params): Query<RagSearchParams>,
) -> Result<Json<Value>, ApiError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    let limit = params.limit.unwrap_or(12).clamp(1, 50);
    let pattern = if query.is_empty() {
        None
    } else {
        Some(format!(
            "%{}%",
            query.replace('%', "\\%").replace('_', "\\_")
        ))
    };
    let cache_key = format!(
        "gaokao:rag:search:v1:{}:{}:{}:{}",
        query,
        params.subject.as_deref().unwrap_or(""),
        params.doc_kind.as_deref().unwrap_or(""),
        limit
    );
    if let Some(value) = cache_get(&state.redis, &cache_key).await {
        return Ok(Json(value));
    }
    let rows = sqlx::query(
        r#"SELECT chunks.id, docs.source_path AS "sourcePath", docs.file_name AS "fileName",
                  docs.subject_key AS "subjectKey", docs.year, docs.doc_kind AS "docKind",
                  chunks.chunk_index AS "chunkIndex", chunks.chunk_text AS "chunkText",
                  chunks.token_estimate AS "tokenEstimate", chunks.metadata,
                  docs.metadata AS "documentMetadata", docs.updated_at AS "updatedAt",
                  CASE
                    WHEN $2::text IS NULL THEN 0
                    WHEN chunks.chunk_text ILIKE $2 ESCAPE '\' THEN 10
                    WHEN docs.file_name ILIKE $2 ESCAPE '\' OR docs.source_path ILIKE $2 ESCAPE '\' THEN 5
                    ELSE 1
                  END::int AS score
           FROM gaokao_rag_chunks chunks
           JOIN gaokao_rag_documents docs ON docs.id = chunks.document_id
           WHERE ($1::text IS NULL OR docs.subject_key = $1)
             AND ($2::text IS NULL OR chunks.chunk_text ILIKE $2 ESCAPE '\' OR docs.file_name ILIKE $2 ESCAPE '\' OR docs.source_path ILIKE $2 ESCAPE '\')
             AND ($3::text IS NULL OR docs.doc_kind = $3)
           ORDER BY score DESC, docs.year DESC NULLS LAST, docs.updated_at DESC, chunks.chunk_index
           LIMIT $4"#,
    )
    .bind(params.subject.as_deref().filter(|value| !value.is_empty()))
    .bind(pattern.as_deref())
    .bind(params.doc_kind.as_deref().filter(|value| !value.is_empty()))
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    let matches: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<Uuid, _>("id")?,
                "sourcePath": row.try_get::<String, _>("sourcePath")?,
                "fileName": row.try_get::<String, _>("fileName")?,
                "subjectKey": row.try_get::<String, _>("subjectKey")?,
                "year": row.try_get::<Option<i32>, _>("year")?,
                "docKind": row.try_get::<String, _>("docKind")?,
                "chunkIndex": row.try_get::<i32, _>("chunkIndex")?,
                "chunkText": row.try_get::<String, _>("chunkText")?,
                "tokenEstimate": row.try_get::<i32, _>("tokenEstimate")?,
                "metadata": row.try_get::<Value, _>("metadata")?,
                "documentMetadata": row.try_get::<Value, _>("documentMetadata")?,
                "score": row.try_get::<i32, _>("score")?,
                "updatedAt": row.try_get::<DateTime<Utc>, _>("updatedAt")?,
            }))
        })
        .collect();
    let value = json!({ "matches": matches?, "query": query });
    cache_set(&state.redis, &cache_key, &value).await;
    Ok(Json(value))
}

async fn gaokao_rag_import(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<RagImportInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    let source_path = input.source_path.trim();
    if source_path.len() < 2 || source_path.len() > 500 {
        return Err(ApiError::bad_request());
    }
    let row = sqlx::query(
        r#"INSERT INTO gaokao_rag_imports
             (requested_by, source_path, subject_key, note, status, metadata)
           VALUES ($1,$2,$3,$4,'requested',$5)
           RETURNING id, created_at AS "createdAt""#,
    )
    .bind(user.id)
    .bind(source_path)
    .bind(input.subject_key.as_deref())
    .bind(input.note.as_deref())
    .bind(input.metadata)
    .fetch_one(&state.db)
    .await?;
    let mut command = format!("npm run gaokao:rag -- --only-root \"{}\"", source_path);
    if let Some(subject) = input
        .subject_key
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        command.push_str(&format!(" --subject {}", subject));
    }
    Ok(Json(json!({
        "ok": true,
        "import": {
            "id": row.try_get::<Uuid, _>("id")?,
            "sourcePath": source_path,
            "subjectKey": input.subject_key,
            "status": "requested",
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt")?,
        },
        "suggestedCommand": command,
    })))
}

async fn register(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
    if !validate_auth(&input) {
        return Err(ApiError::bad_request());
    }
    let password_hash =
        bcrypt_hash(input.password, DEFAULT_COST).map_err(|_| ApiError::server())?;
    let username = input.username.trim();
    let role = "student";
    let result = sqlx::query("INSERT INTO users (username, password_hash, role, last_login_at) VALUES ($1, $2, $3, now()) RETURNING id, username, role, created_at, last_login_at")
        .bind(username).bind(password_hash).bind(role).fetch_one(&state.db).await;
    let row = match result {
        Ok(row) => row,
        Err(sqlx::Error::Database(err)) if err.code().as_deref() == Some("23505") => {
            return Ok((
                StatusCode::CONFLICT,
                Json(json!({ "error": "username_exists" })),
            )
                .into_response())
        }
        Err(err) => return Err(err.into()),
    };
    let user = UserSession {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        last_login_at: row.try_get("last_login_at")?,
    };
    sqlx::query("INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING")
        .bind(user.id)
        .execute(&state.db)
        .await?;
    let token = create_session(&state, user.id).await?;
    record_auth_event(
        &state,
        &headers,
        Some(user.id),
        username,
        "register_success",
        "info",
    )
    .await;
    let mut response = (
        StatusCode::CREATED,
        Json(json!({ "user": UserOut::from(user) })),
    )
        .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&session_cookie(&token)).map_err(|_| ApiError::server())?,
    );
    Ok(response)
}

async fn login(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
    if !validate_auth(&input) {
        return Err(ApiError::bad_request());
    }
    let row = sqlx::query("SELECT id, username, role, password_hash, created_at, last_login_at,risk_status,failed_login_count,locked_until FROM users WHERE username = $1")
        .bind(input.username.trim()).fetch_optional(&state.db).await?;
    let Some(row) = row else {
        record_auth_event(
            &state,
            &headers,
            None,
            input.username.trim(),
            "login_unknown_user",
            "warning",
        )
        .await;
        return Ok((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid_credentials" })),
        )
            .into_response());
    };
    let risk_status: String = row.try_get("risk_status")?;
    let locked_until: Option<DateTime<Utc>> = row.try_get("locked_until")?;
    if risk_status != "active" || locked_until.is_some_and(|until| until > Utc::now()) {
        record_auth_event(
            &state,
            &headers,
            Some(row.try_get("id")?),
            input.username.trim(),
            "login_restricted",
            "high",
        )
        .await;
        return Ok((
            StatusCode::FORBIDDEN,
            Json(json!({"error":"account_restricted"})),
        )
            .into_response());
    }
    let password_hash: String = row.try_get("password_hash")?;
    if !bcrypt_verify(input.password, &password_hash).unwrap_or(false) {
        let user_id: Uuid = row.try_get("id")?;
        sqlx::query("UPDATE users SET failed_login_count=failed_login_count+1,locked_until=CASE WHEN failed_login_count+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1")
            .bind(user_id).execute(&state.db).await?;
        record_auth_event(
            &state,
            &headers,
            Some(user_id),
            input.username.trim(),
            "login_failed",
            "warning",
        )
        .await;
        return Ok((
            StatusCode::UNAUTHORIZED,
            Json(json!({ "error": "invalid_credentials" })),
        )
            .into_response());
    }
    let user_id: Uuid = row.try_get("id")?;
    sqlx::query(
        "UPDATE users SET last_login_at=now(),failed_login_count=0,locked_until=NULL WHERE id=$1",
    )
    .bind(user_id)
    .execute(&state.db)
    .await?;
    let user = UserSession {
        id: user_id,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        last_login_at: Some(Utc::now()),
    };
    let token = create_session(&state, user.id).await?;
    record_auth_event(
        &state,
        &headers,
        Some(user.id),
        &user.username,
        "login_success",
        "info",
    )
    .await;
    let mut response = Json(json!({ "user": UserOut::from(user) })).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&session_cookie(&token)).map_err(|_| ApiError::server())?,
    );
    Ok(response)
}

async fn logout(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if let Some(token) = parse_cookie(&headers, SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(hash_token(&token))
            .execute(&state.db)
            .await?;
    }
    let mut response = Json(json!({ "ok": true })).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&clear_session_cookie()).map_err(|_| ApiError::server())?,
    );
    Ok(response)
}

async fn me(State(state): State<SharedState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let must_change: bool =
        sqlx::query_scalar("SELECT must_change_password FROM users WHERE id=$1")
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
    Ok(Json(
        json!({ "user": UserOut::from(user), "mustChangePassword": must_change }),
    ))
}

async fn me_stats(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    Ok(Json(
        json!({ "stats": get_stats(&state.db, user.id).await? }),
    ))
}

async fn import_local(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<ImportInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if input.import_id.len() < 8 || input.import_id.len() > 128 {
        return Err(ApiError::bad_request());
    }
    let inserted = sqlx::query("INSERT INTO local_imports (user_id, import_hash, summary) VALUES ($1, $2, $3) ON CONFLICT (user_id, import_hash) DO NOTHING")
        .bind(user.id).bind(input.import_id).bind(json!(&input.snapshot)).execute(&state.db).await?.rows_affected() > 0;
    if inserted {
        sqlx::query("INSERT INTO study_events (user_id, event_type, payload) VALUES ($1, $2, $3)")
            .bind(user.id)
            .bind("local_import")
            .bind(json!(&input.snapshot))
            .execute(&state.db)
            .await?;
        upsert_snapshot(&state.db, user.id, &input.snapshot, "max").await?;
    }
    Ok(Json(
        json!({ "imported": inserted, "stats": get_stats(&state.db, user.id).await? }),
    ))
}

async fn study_event(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<StudyEventInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if input.event_type.len() < 2 || input.event_type.len() > 64 {
        return Err(ApiError::bad_request());
    }
    sqlx::query(r#"INSERT INTO study_events (user_id, event_type, course, subject, page_path, object_id, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)"#)
        .bind(user.id).bind(&input.event_type).bind(&input.course).bind(&input.subject).bind(&input.page_path).bind(&input.object_id).bind(&input.payload).execute(&state.db).await?;
    if input.event_type == "page_dwell" {
        let seconds = input
            .payload
            .get("seconds")
            .and_then(Value::as_i64)
            .unwrap_or(0)
            .max(0) as i32;
        upsert_snapshot(
            &state.db,
            user.id,
            &ProgressSnapshot {
                total_study_seconds: seconds,
                recent_paths: input.page_path.into_iter().collect(),
                ..ProgressSnapshot::default()
            },
            "add",
        )
        .await?;
    } else if input.event_type == "practice_done" {
        increment_snapshot(&state.db, user.id, "practice_done_count", input.page_path).await?;
    } else if input.event_type == "chapter_done" {
        increment_snapshot(&state.db, user.id, "chapter_done_count", input.page_path).await?;
    } else if input.event_type == "wrong_added" {
        increment_snapshot(&state.db, user.id, "wrong_count", input.page_path).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

async fn api_handshake(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let api_key = hex::encode(key_bytes);

    sqlx::query("INSERT INTO visitor_api_keys (api_key, expires_at) VALUES ($1, now() + interval '1 day')")
        .bind(&api_key)
        .execute(&state.db)
        .await
        .map_err(|e| {
            eprintln!("Failed to generate API key: {e}");
            ApiError::server()
        })?;

    Ok(Json(json!({ "apiKey": api_key })))
}

async fn api_key_auth(
    State(state): State<SharedState>,
    req: axum::extract::Request,
    next: Next,
) -> Result<Response, ApiError> {
    let path = req.uri().path();
    if path == "/api/handshake"
        || path == "/health/live"
        || path == "/health/ready"
        || path == "/metrics"
        || path == "/api/docs"
        || path.starts_with("/api/docs/")
    {
        return Ok(next.run(req).await);
    }

    let api_key = req
        .headers()
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "missing_api_key"))?;

    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM visitor_api_keys WHERE api_key = $1 AND expires_at > now())",
    )
    .bind(api_key)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("API key validation error: {e}");
        ApiError::server()
    })?;

    if !exists {
        return Err(ApiError::new(StatusCode::UNAUTHORIZED, "invalid_api_key"));
    }

    Ok(next.run(req).await)
}

async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        "CREATE EXTENSION IF NOT EXISTS pgcrypto",
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE TABLE IF NOT EXISTS visitor_api_keys (api_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL)",
        "CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'",
        "UPDATE users SET role = 'admin' WHERE username = 'admin' AND role <> 'admin'",
        "CREATE TABLE IF NOT EXISTS sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS study_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_type TEXT NOT NULL, course TEXT, subject TEXT, page_path TEXT, object_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, occurred_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS study_snapshots (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, total_study_seconds INTEGER NOT NULL DEFAULT 0, chapter_done_count INTEGER NOT NULL DEFAULT 0, wrong_count INTEGER NOT NULL DEFAULT 0, practice_done_count INTEGER NOT NULL DEFAULT 0, mastery_item_count INTEGER NOT NULL DEFAULT 0, scroll_position_count INTEGER NOT NULL DEFAULT 0, recent_paths JSONB NOT NULL DEFAULT '[]'::jsonb, current_streak_days INTEGER NOT NULL DEFAULT 0, last_activity_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS local_imports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, import_hash TEXT NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), summary JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE (user_id, import_hash))",
        "CREATE TABLE IF NOT EXISTS gaokao_sources (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, detail TEXT, status TEXT NOT NULL DEFAULT 'active', source_type TEXT NOT NULL DEFAULT 'local', relative_path TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_papers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), paper_key TEXT NOT NULL UNIQUE, year INTEGER, subject_key TEXT NOT NULL, subject_name TEXT NOT NULL, paper_name TEXT NOT NULL, paper_kind TEXT NOT NULL DEFAULT 'exam', status TEXT NOT NULL DEFAULT 'indexed', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_questions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_key TEXT NOT NULL UNIQUE, paper_id UUID REFERENCES gaokao_papers(id) ON DELETE SET NULL, year INTEGER, subject_key TEXT NOT NULL, subject_name TEXT NOT NULL, question_number INTEGER, question_type TEXT, difficulty TEXT, quality TEXT NOT NULL DEFAULT 'indexed', prompt TEXT NOT NULL, answer TEXT, solution JSONB NOT NULL DEFAULT '[]'::jsonb, flags JSONB NOT NULL DEFAULT '[]'::jsonb, source_type TEXT NOT NULL DEFAULT 'real', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "ALTER TABLE gaokao_questions ADD COLUMN IF NOT EXISTS display_complete BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE gaokao_questions ADD COLUMN IF NOT EXISTS incomplete_reason TEXT",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_complete ON gaokao_questions(display_complete,subject_key,year)",
        "CREATE TABLE IF NOT EXISTS gaokao_question_tags (question_id UUID NOT NULL REFERENCES gaokao_questions(id) ON DELETE CASCADE, tag_type TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY (question_id, tag_type, tag))",
        "CREATE TABLE IF NOT EXISTS gaokao_question_cleanup_audit (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_id UUID NOT NULL REFERENCES gaokao_questions(id) ON DELETE CASCADE, question_key TEXT NOT NULL, subject_key TEXT, year INTEGER, reason TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::jsonb, action TEXT NOT NULL DEFAULT 'soft_deleted', created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_subject_profiles (subject_key TEXT PRIMARY KEY, subject_name TEXT NOT NULL, accent TEXT, icon TEXT, route TEXT, trend TEXT, advice TEXT, high_frequency JSONB NOT NULL DEFAULT '[]'::jsonb, easy_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_trend_notes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subject_key TEXT, year INTEGER, title TEXT NOT NULL, body TEXT NOT NULL, source_name TEXT, source_url TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_import_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_key TEXT NOT NULL UNIQUE, summary JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), doc_key TEXT NOT NULL UNIQUE, source_path TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, file_ext TEXT NOT NULL, subject_key TEXT NOT NULL DEFAULT 'general', year INTEGER, doc_kind TEXT NOT NULL DEFAULT 'reference', content_hash TEXT NOT NULL, text_length INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES gaokao_rag_documents(id) ON DELETE CASCADE, chunk_index INTEGER NOT NULL, chunk_text TEXT NOT NULL, content_hash TEXT NOT NULL, token_estimate INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (document_id, chunk_index))",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_imports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID REFERENCES users(id) ON DELETE SET NULL, source_path TEXT NOT NULL, subject_key TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'requested', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_answer_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_key TEXT NOT NULL, subject_key TEXT, result TEXT NOT NULL CHECK (result IN ('correct', 'wrong')), knowledge_nodes JSONB NOT NULL DEFAULT '[]'::jsonb, prompt_snapshot TEXT, answer_snapshot TEXT, source_type TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, answered_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE INDEX IF NOT EXISTS idx_study_events_user_time ON study_events(user_id, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_papers_subject_year ON gaokao_papers(subject_key, year)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_subject_year ON gaokao_questions(subject_key, year)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_quality ON gaokao_questions(quality)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_source_type ON gaokao_questions(source_type)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_solution_status ON gaokao_questions ((metadata #>> '{solutionEnrichment,status}'))",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_cleanup_status ON gaokao_questions ((metadata #>> '{cleanup,status}'))",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_documents_subject ON gaokao_rag_documents(subject_key, year)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_documents_kind ON gaokao_rag_documents(doc_kind)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_document ON gaokao_rag_chunks(document_id, chunk_index)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_text_trgm ON gaokao_rag_chunks USING gin (chunk_text gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_attempts_user_time ON gaokao_answer_attempts(user_id, answered_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_attempts_user_subject ON gaokao_answer_attempts(user_id, subject_key)",
    ];

    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}
