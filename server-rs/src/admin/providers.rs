use super::*;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use axum::extract::Path as AxumPath;
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};
use std::net::IpAddr;

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
    let row=sqlx::query("INSERT INTO ai_provider_configs(user_id,name,provider,base_url,model,api_key_ciphertext,is_default) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id")
        .bind(user.id).bind(input.name.trim()).bind(&input.provider).bind(input.base_url.trim_end_matches('/')).bind(input.model.trim()).bind(encrypt_key(&state,&input.api_key)?).bind(count == 0).fetch_one(&state.db).await?;
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

pub(crate) async fn preferred_provider_runtime(
    state: &SharedState,
    user_id: Uuid,
    requested_id: Option<Uuid>,
) -> Result<Option<ProviderRuntime>, ApiError> {
    let id = match requested_id {
        Some(id) => Some(id),
        None => sqlx::query_scalar(
            "SELECT id FROM ai_provider_configs WHERE user_id=$1 ORDER BY is_default DESC,created_at LIMIT 1",
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?,
    };
    match id {
        Some(id) => provider_runtime(state, user_id, id).await.map(Some),
        None => Ok(None),
    }
}

pub(crate) async fn record_ai_metrics(
    state: &SharedState,
    user_id: Uuid,
    provider: &str,
    model: &str,
    input_chars: usize,
    output_chars: usize,
    input_tokens: usize,
    output_tokens: usize,
    ttft_ms: Option<u128>,
    duration_ms: u128,
    status: &str,
) {
    let _ = sqlx::query("INSERT INTO ai_usage_events(user_id,provider,model,input_chars,output_chars,input_tokens,output_tokens,ttft_ms,latency_ms,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
        .bind(user_id)
        .bind(provider)
        .bind(model)
        .bind(input_chars.min(i32::MAX as usize) as i32)
        .bind(output_chars.min(i32::MAX as usize) as i32)
        .bind(input_tokens.min(i32::MAX as usize) as i32)
        .bind(output_tokens.min(i32::MAX as usize) as i32)
        .bind(ttft_ms.map(|value| value.min(i32::MAX as u128) as i32))
        .bind(duration_ms.min(i32::MAX as u128) as i32)
        .bind(status)
        .execute(&state.db)
        .await;
}

#[cfg(test)]
mod tests {
    use super::provider_url_allowed;

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
}
