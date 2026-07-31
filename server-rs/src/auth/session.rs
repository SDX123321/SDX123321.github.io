use super::*;
use deadpool_redis::redis::AsyncCommands;
use rand::{rngs::OsRng, RngCore};

pub(crate) const SESSION_COOKIE: &str = "exam_review_session";
pub(crate) const SESSION_DAYS: i64 = 30;
pub(crate) fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub(crate) fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub(crate) fn parse_cookie(headers: &HeaderMap, name: &str) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let mut pieces = part.trim().splitn(2, '=');
        let key = pieces.next()?.trim();
        let value = pieces.next()?.trim();
        (key == name).then(|| value.to_string())
    })
}

pub(crate) fn session_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age={}; HttpOnly; SameSite=Lax",
        SESSION_DAYS * 24 * 60 * 60
    )
}

pub(crate) fn clear_session_cookie() -> String {
    format!("{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax")
}

pub(crate) fn validate_auth(input: &AuthInput) -> bool {
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

pub(crate) async fn auth_user(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<UserSession, ApiError> {
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

pub(crate) fn auth_request_context(headers: &HeaderMap) -> (Option<String>, Option<String>) {
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

pub(crate) async fn create_session(state: &SharedState, user_id: Uuid) -> Result<String, ApiError> {
    let token = new_token();
    sqlx::query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)")
        .bind(user_id)
        .bind(hash_token(&token))
        .bind(SESSION_DAYS)
        .execute(&state.db)
        .await?;
    Ok(token)
}

pub(crate) async fn api_handshake(
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let api_key = hex::encode(key_bytes);

    sqlx::query(
        "INSERT INTO visitor_api_keys (api_key, expires_at) VALUES ($1, now() + interval '1 day')",
    )
    .bind(&api_key)
    .execute(&state.db)
    .await
    .map_err(|e| {
        eprintln!("Failed to generate API key: {e}");
        ApiError::server()
    })?;

    if let Some(pool) = &state.redis {
        if let Ok(mut conn) = pool.get().await {
            let redis_key = format!("visitor_api_key:{}", api_key);
            let _: Result<(), _> = conn.set_ex(redis_key, "1", 86400).await;
        }
    }

    Ok(Json(json!({ "apiKey": api_key })))
}

pub(crate) async fn api_key_auth(
    State(state): State<SharedState>,
    req: axum::extract::Request,
    next: axum::middleware::Next,
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

    let redis_key = format!("visitor_api_key:{}", api_key);
    if let Some(pool) = &state.redis {
        if let Ok(mut conn) = pool.get().await {
            let exists: Option<String> = conn.get(&redis_key).await.ok();
            if exists.is_some() {
                return Ok(next.run(req).await);
            }
        }
    }

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

    if let Some(pool) = &state.redis {
        if let Ok(mut conn) = pool.get().await {
            let _: Result<(), _> = conn.set_ex(redis_key, "1", 86400).await;
        }
    }

    Ok(next.run(req).await)
}
