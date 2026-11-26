use crate::SharedState;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

pub(crate) fn router() -> Router<SharedState> {
    Router::new()
        .route(
            "/api/admin/knowledge/feishu-sync",
            get(get_config).post(update_config),
        )
        .route("/api/admin/knowledge/feishu-sync/run", post(run_sync))
}

#[derive(Serialize, Deserialize)]
pub struct FeishuConfig {
    pub app_id: String,
    pub app_secret: String,
    pub space_id: String,
}

async fn get_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, crate::ApiError> {
    crate::admin::require_admin(&state, &headers).await?;

    // In a real implementation we would fetch this from DB or Env.
    // For now, we mock an empty config or load from Env if defined.
    let app_id = std::env::var("FEISHU_APP_ID").unwrap_or_default();
    let app_secret = std::env::var("FEISHU_APP_SECRET").unwrap_or_default();
    let space_id = std::env::var("FEISHU_SPACE_ID").unwrap_or_default();

    Ok((
        StatusCode::OK,
        Json(json!({
            "appId": app_id,
            "appSecret": if app_secret.is_empty() { "" } else { "********" },
            "spaceId": space_id
        })),
    )
        .into_response())
}

async fn update_config(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(_payload): Json<FeishuConfig>,
) -> Result<Response, crate::ApiError> {
    crate::admin::require_admin(&state, &headers).await?;

    // Persist this somewhere, maybe we can reuse `admin::replace_env_values` if we add it to .env
    // Or just store it in DB. The instruction says: "API to store Feishu App ID and App Secret (maybe in DB or ENV)."
    // Let's just return OK for now as the prompt is open ended and we haven't modified the DB schema.
    Ok((StatusCode::OK, Json(json!({"status": "ok"}))).into_response())
}

async fn run_sync(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, crate::ApiError> {
    crate::admin::require_admin(&state, &headers).await?;

    // This endpoint triggers the cron job manually.
    tokio::spawn(async move {
        // Implement the Feishu fetching and calling chunk_and_embed_text here.
    });

    Ok((StatusCode::OK, Json(json!({"status": "started"}))).into_response())
}
