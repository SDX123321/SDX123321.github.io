use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::{DateTime, Utc};
use deadpool_redis::Pool as RedisPool;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc, time::Instant};
use uuid::Uuid;

pub(crate) const CACHE_SECONDS: u64 = 60;

/// Sliding-window answer rate limiter state (per user recent timestamps).
#[derive(Default)]
pub(crate) struct AnswerRateState {
    pub(crate) recent: HashMap<Uuid, Vec<Instant>>,
}

pub(crate) type SharedState = Arc<AppState>;
pub(crate) type AuthRateEntries = HashMap<(&'static str, std::net::IpAddr), (Instant, u32)>;

pub(crate) struct AppState {
    pub(crate) db: PgPool,
    pub(crate) redis: Option<RedisPool>,
    pub(crate) http: reqwest::Client,
    pub(crate) material_root: std::path::PathBuf,
    pub(crate) project_root: std::path::PathBuf,
    pub(crate) ollama_env_path: std::path::PathBuf,
    pub(crate) ollama_config: Arc<tokio::sync::RwLock<OllamaRuntimeConfig>>,
    pub(crate) ollama_config_write: tokio::sync::Mutex<()>,
    pub(crate) vector_enabled: bool,
    pub(crate) answer_rate: std::sync::Mutex<AnswerRateState>,
    pub(crate) answer_slots: Arc<tokio::sync::Semaphore>,
    pub(crate) api_config_key: [u8; 32],
    pub(crate) question_assets: Arc<std::collections::HashMap<String, Value>>,
    pub(crate) auth_rate: std::sync::Mutex<AuthRateEntries>,
    pub(crate) trust_forwarded_ip: bool,
}

#[derive(Clone, Serialize)]
pub(crate) struct OllamaRuntimeConfig {
    #[serde(rename = "baseUrl")]
    pub(crate) base_url: String,
    #[serde(rename = "embeddingModel")]
    pub(crate) embedding_model: String,
    #[serde(rename = "chatModel")]
    pub(crate) chat_model: String,
    #[serde(rename = "embeddingDimensions")]
    pub(crate) embedding_dimensions: usize,
    #[serde(rename = "rerankUrl")]
    pub(crate) rerank_url: String,
    #[serde(rename = "rerankModel")]
    pub(crate) rerank_model: String,
}

#[derive(Debug)]
pub(crate) struct ApiError {
    pub(crate) status: StatusCode,
    pub(crate) code: &'static str,
}

impl ApiError {
    pub(crate) fn new(status: StatusCode, code: &'static str) -> Self {
        Self { status, code }
    }
    pub(crate) fn bad_request() -> Self {
        Self::new(StatusCode::BAD_REQUEST, "invalid_input")
    }
    pub(crate) fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "not_authenticated")
    }
    pub(crate) fn forbidden() -> Self {
        Self::new(StatusCode::FORBIDDEN, "forbidden")
    }
    pub(crate) fn server() -> Self {
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
pub(crate) struct UserOut {
    pub(crate) id: Uuid,
    pub(crate) username: String,
    pub(crate) role: String,
    #[serde(rename = "created_at")]
    pub(crate) created_at: DateTime<Utc>,
    #[serde(rename = "last_login_at")]
    pub(crate) last_login_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub(crate) struct UserSession {
    pub(crate) id: Uuid,
    pub(crate) username: String,
    pub(crate) role: String,
    pub(crate) created_at: DateTime<Utc>,
    pub(crate) last_login_at: Option<DateTime<Utc>>,
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
pub(crate) struct AuthInput {
    pub(crate) username: String,
    pub(crate) password: String,
}

#[derive(Deserialize, Serialize, Default)]
pub(crate) struct ProgressSnapshot {
    #[serde(default, rename = "totalStudySeconds")]
    pub(crate) total_study_seconds: i32,
    #[serde(default, rename = "chapterDoneCount")]
    pub(crate) chapter_done_count: i32,
    #[serde(default, rename = "wrongCount")]
    pub(crate) wrong_count: i32,
    #[serde(default, rename = "practiceDoneCount")]
    pub(crate) practice_done_count: i32,
    #[serde(default, rename = "masteryItemCount")]
    pub(crate) mastery_item_count: i32,
    #[serde(default, rename = "scrollPositionCount")]
    pub(crate) scroll_position_count: i32,
    #[serde(default, rename = "recentPaths")]
    pub(crate) recent_paths: Vec<String>,
}

#[derive(Deserialize)]
pub(crate) struct ImportInput {
    #[serde(rename = "importId")]
    pub(crate) import_id: String,
    pub(crate) snapshot: ProgressSnapshot,
}

#[derive(Deserialize)]
pub(crate) struct StudyEventInput {
    #[serde(rename = "eventType")]
    pub(crate) event_type: String,
    pub(crate) course: Option<String>,
    pub(crate) subject: Option<String>,
    #[serde(rename = "pagePath")]
    pub(crate) page_path: Option<String>,
    #[serde(rename = "objectId")]
    pub(crate) object_id: Option<String>,
    #[serde(default)]
    pub(crate) payload: Value,
}

#[derive(Deserialize)]
pub(crate) struct GaokaoAttemptInput {
    #[serde(rename = "questionKey")]
    pub(crate) question_key: String,
    #[serde(rename = "subjectKey")]
    pub(crate) subject_key: Option<String>,
    pub(crate) result: String,
    #[serde(default, rename = "knowledgeNodes")]
    pub(crate) knowledge_nodes: Vec<String>,
    #[serde(rename = "promptSnapshot")]
    pub(crate) prompt_snapshot: Option<String>,
    #[serde(rename = "answerSnapshot")]
    pub(crate) answer_snapshot: Option<String>,
    #[serde(rename = "sourceType")]
    pub(crate) source_type: Option<String>,
    #[serde(default)]
    pub(crate) metadata: Value,
}

#[derive(Deserialize, Serialize)]
pub(crate) struct QuestionParams {
    pub(crate) subject: Option<String>,
    pub(crate) year: Option<i32>,
    pub(crate) difficulty: Option<String>,
    pub(crate) quality: Option<String>,
    #[serde(rename = "sourceType")]
    pub(crate) source_type: Option<String>,
    #[serde(rename = "hasSolution")]
    pub(crate) has_solution: Option<bool>,
    #[serde(rename = "solutionStatus")]
    pub(crate) solution_status: Option<String>,
    #[serde(rename = "includeHidden")]
    pub(crate) include_hidden: Option<bool>,
    pub(crate) cursor: Option<String>,
    pub(crate) limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct RagSearchParams {
    pub(crate) q: Option<String>,
    pub(crate) subject: Option<String>,
    #[serde(rename = "docKind")]
    pub(crate) doc_kind: Option<String>,
    pub(crate) limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct RagImportInput {
    #[serde(rename = "sourcePath")]
    pub(crate) source_path: String,
    #[serde(rename = "subjectKey")]
    pub(crate) subject_key: Option<String>,
    pub(crate) note: Option<String>,
    #[serde(default)]
    pub(crate) metadata: Value,
}
