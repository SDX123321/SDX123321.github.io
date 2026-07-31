use super::*;
use serde::Deserialize;

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
    #[serde(rename = "rerankUrl")]
    rerank_url: String,
    #[serde(rename = "rerankModel")]
    rerank_model: String,
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

mod accounts;
mod ollama;
mod providers;
mod schema;
mod upload;

pub(crate) use accounts::*;
pub(crate) use ollama::*;
pub(crate) use providers::*;
pub(crate) use schema::ensure_schema;
pub(crate) use upload::*;
