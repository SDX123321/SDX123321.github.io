use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderValue, Method},
    middleware,
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use deadpool_redis::{Config as RedisConfig, Runtime};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::postgres::PgPoolOptions;
use std::{env, net::SocketAddr, sync::Arc};
use tower_http::cors::{AllowOrigin, CorsLayer};

mod admin;
mod auth;
mod cache;
mod feishu;
mod gaokao;
mod high_school;
mod indexer;
mod knowledge;
mod learning;
mod types;

pub(crate) use auth::*;
pub(crate) use cache::*;
pub(crate) use types::*;
// Crate-wide re-exports so child modules (which use `use super::*`) can resolve
// common external types without repeating imports in every file.
pub(crate) use axum::extract::Query;
pub(crate) use axum::http::{HeaderMap, StatusCode};
pub(crate) use chrono::{DateTime, Utc};
pub(crate) use serde_json::{json, Value};
pub(crate) use sqlx::{PgPool, Row};
pub(crate) use uuid::Uuid;

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
    let question_assets = gaokao::load_question_assets(&project_root).await;
    gaokao::audit_question_completeness(&db, &project_root, &question_assets).await?;
    let material_root = env::var("MATERIAL_ROOT")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\Users\zzz\Desktop\参考资料"));

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
            rerank_url: env::var("RERANK_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8080/v1/rerank".into()),
            rerank_model: env::var("RERANK_MODEL").unwrap_or_else(|_| "Qwen3-Reranker-0.6B".into()),
        })),
        ollama_config_write: tokio::sync::Mutex::new(()),
        vector_enabled,
        answer_rate: std::sync::Mutex::new(AnswerRateState::default()),
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
        .route("/api/gaokao/summary", get(gaokao::gaokao_summary))
        .route("/health/live", get(health_live))
        .route("/health/ready", get(health_ready))
        .route("/metrics", get(prometheus_metrics))
        .route("/api/docs", get(openapi_ui))
        .route("/api/docs/openapi.yaml", get(openapi_spec))
        .route("/api/gaokao/subjects", get(gaokao::gaokao_subjects))
        .route("/api/gaokao/questions", get(gaokao::gaokao_questions))
        .route("/api/gaokao/attempts", post(gaokao::gaokao_attempts))
        .route("/api/gaokao/weaknesses", get(gaokao::gaokao_weaknesses))
        .route("/api/gaokao/rag/summary", get(gaokao::gaokao_rag_summary))
        .route("/api/gaokao/rag/search", get(gaokao::gaokao_rag_search))
        .route("/api/gaokao/rag/imports", post(gaokao::gaokao_rag_import))
        .route("/api/high-school/overview", get(high_school::overview))
        .route("/api/high-school/materials", get(high_school::materials))
        .route("/api/high-school/materials/:id", get(high_school::material))
        .route(
            "/api/high-school/materials/:id/preview",
            get(high_school::material_preview),
        )
        .merge(feishu::router())
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
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/me", get(auth::me))
        .route("/api/me/stats", get(auth::me_stats))
        .route("/api/me/import-local", post(auth::import_local))
        .route("/api/study/event", post(auth::study_event))
        .route("/api/handshake", post(auth::api_handshake))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::api_key_auth,
        ))
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
    let body = format!("# HELP exam_review_up API process health\n# TYPE exam_review_up gauge\nexam_review_up 1\n# HELP exam_review_db_pool_size PostgreSQL pool connections\n# TYPE exam_review_db_pool_size gauge\nexam_review_db_pool_size {}\n# HELP exam_review_db_pool_idle Idle PostgreSQL pool connections\n# TYPE exam_review_db_pool_idle gauge\nexam_review_db_pool_idle {}\n# HELP exam_review_active_embedding_generations Active embedding generations\n# TYPE exam_review_active_embedding_generations gauge\nexam_review_active_embedding_generations {active}\n# HELP exam_review_running_index_jobs Running or paused index jobs\n# TYPE exam_review_running_index_jobs gauge\nexam_review_running_index_jobs {running}\n", state.db.size(), state.db.num_idle());
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
    let html = r#"<!DOCTYPE html>
<html>
<head>
  <title>API Documentation - Exam Review</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis]
    });
  </script>
</body>
</html>"#;
    let mut response = Response::new(axum::body::Body::from(html));
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
    response
}

async fn ensure_schema(db: &sqlx::PgPool) -> anyhow::Result<()> {
    let statements = [
        "CREATE EXTENSION IF NOT EXISTS pgcrypto",
        "CREATE EXTENSION IF NOT EXISTS pg_trgm",
        "CREATE TABLE IF NOT EXISTS visitor_api_keys (api_key TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL)",
        "CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false",
        "CREATE TABLE IF NOT EXISTS auth_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL, username TEXT NOT NULL, event_type TEXT NOT NULL, ip_address TEXT, user_agent TEXT, risk_level TEXT NOT NULL DEFAULT 'info', created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL)",
        "CREATE TABLE IF NOT EXISTS study_snapshots (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, total_study_seconds INT NOT NULL DEFAULT 0, chapter_done_count INT NOT NULL DEFAULT 0, wrong_count INT NOT NULL DEFAULT 0, practice_done_count INT NOT NULL DEFAULT 0, mastery_item_count INT NOT NULL DEFAULT 0, scroll_position_count INT NOT NULL DEFAULT 0, recent_paths JSONB NOT NULL DEFAULT '[]'::jsonb, current_streak_days INT NOT NULL DEFAULT 1, last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS local_imports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, import_hash TEXT NOT NULL, summary JSONB NOT NULL DEFAULT '{}'::jsonb, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id, import_hash))",
        "CREATE TABLE IF NOT EXISTS study_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, event_type TEXT NOT NULL, course TEXT, subject TEXT, page_path TEXT, object_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_subject_profiles (subject_key TEXT PRIMARY KEY, subject_name TEXT NOT NULL, accent TEXT, icon TEXT, route TEXT, trend TEXT, advice TEXT, high_frequency JSONB NOT NULL DEFAULT '[]'::jsonb, easy_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_papers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), paper_key TEXT NOT NULL UNIQUE, title TEXT NOT NULL, year INT NOT NULL, subject_key TEXT NOT NULL, province TEXT, total_questions INT NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_questions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_key TEXT NOT NULL UNIQUE, paper_id UUID REFERENCES gaokao_papers(id) ON DELETE SET NULL, year INT, subject_key TEXT NOT NULL, subject_name TEXT NOT NULL, question_number INT, question_type TEXT, difficulty TEXT, quality TEXT NOT NULL DEFAULT 'benchmark', prompt TEXT NOT NULL, answer TEXT, solution JSONB NOT NULL DEFAULT '[]'::jsonb, flags JSONB NOT NULL DEFAULT '[]'::jsonb, source_type TEXT NOT NULL DEFAULT 'real', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, display_complete BOOLEAN NOT NULL DEFAULT true, incomplete_reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "ALTER TABLE gaokao_questions ADD COLUMN IF NOT EXISTS display_complete BOOLEAN NOT NULL DEFAULT true",
        "ALTER TABLE gaokao_questions ADD COLUMN IF NOT EXISTS incomplete_reason TEXT",
        "CREATE TABLE IF NOT EXISTS gaokao_answer_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, question_key TEXT NOT NULL, subject_key TEXT, result TEXT NOT NULL, knowledge_nodes JSONB NOT NULL DEFAULT '[]'::jsonb, prompt_snapshot TEXT, answer_snapshot TEXT, source_type TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, answered_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_import_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), import_key TEXT NOT NULL UNIQUE, summary JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), source_path TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL, subject_key TEXT NOT NULL, year INT, doc_kind TEXT NOT NULL DEFAULT 'other', text_length INT NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_chunks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_id UUID NOT NULL REFERENCES gaokao_rag_documents(id) ON DELETE CASCADE, chunk_index INT NOT NULL, chunk_text TEXT NOT NULL, token_estimate INT NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(document_id, chunk_index))",
        "CREATE TABLE IF NOT EXISTS gaokao_rag_imports (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, source_path TEXT NOT NULL, subject_key TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'requested', metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash)",
        "CREATE INDEX IF NOT EXISTS idx_study_events_user_id ON study_events(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_subject_year ON gaokao_questions(subject_key, year)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_quality ON gaokao_questions(quality)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_attempts_user ON gaokao_answer_attempts(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_docs_subject ON gaokao_rag_documents(subject_key)",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_doc ON gaokao_rag_chunks(document_id)",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}
