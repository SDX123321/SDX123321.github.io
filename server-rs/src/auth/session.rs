use super::*;
use axum::extract::ConnectInfo;
use deadpool_redis::redis::AsyncCommands;
use rand::{rngs::OsRng, RngCore};
use std::{
    net::SocketAddr,
    time::{Duration, Instant},
};

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
    let secure = cookie_security();
    format!(
        "{SESSION_COOKIE}={token}; Path=/; Max-Age={}; HttpOnly; SameSite=Lax{secure}",
        SESSION_DAYS * 24 * 60 * 60
    )
}

pub(crate) fn clear_session_cookie() -> String {
    let secure = cookie_security();
    format!("{SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure}")
}

fn cookie_security() -> &'static str {
    if std::env::var("CLIENT_ORIGIN").is_ok_and(|origin| origin.starts_with("https://"))
        || std::env::var("NODE_ENV").as_deref() == Ok("production")
    {
        "; Secure"
    } else {
        ""
    }
}

pub(crate) fn enforce_auth_rate(
    state: &SharedState,
    headers: &HeaderMap,
    peer: SocketAddr,
    endpoint: &'static str,
    limit: u32,
) -> Result<(), ApiError> {
    let mut ip = peer.ip();
    if state.trust_forwarded_ip {
        if let Some(forwarded) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.rsplit(',').next())
            .and_then(|value| value.trim().parse().ok())
        {
            ip = forwarded;
        }
    }
    let mut clients = state.auth_rate.lock().map_err(|_| ApiError::server())?;
    let now = Instant::now();
    let window = Duration::from_secs(60);
    let key = (endpoint, ip);
    if clients.len() >= 4096 && !clients.contains_key(&key) {
        clients.retain(|_, (started, _)| now.duration_since(*started) < window);
    }
    if clients.len() < 4096 || clients.contains_key(&key) {
        let (started, count) = clients.entry(key).or_insert((now, 0));
        if now.duration_since(*started) >= window {
            (*started, *count) = (now, 0);
        }
        if *count < limit {
            *count += 1;
            return Ok(());
        }
    }
    Err(ApiError::new(
        StatusCode::TOO_MANY_REQUESTS,
        "too_many_requests",
    ))
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
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    enforce_auth_rate(&state, &headers, peer, "handshake", 30)?;
    let mut key_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut key_bytes);
    let api_key = hex::encode(key_bytes);

    let expires_at = sqlx::query_scalar::<_, DateTime<Utc>>(
        "INSERT INTO visitor_api_keys (api_key, expires_at) VALUES ($1, now() + interval '1 day') RETURNING expires_at",
    )
    .bind(&api_key)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        eprintln!("Failed to generate API key: {e}");
        ApiError::server()
    })?;

    cache_visitor_expiry(&state, &visitor_cache_key(&api_key), expires_at).await;

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

    let redis_key = visitor_cache_key(api_key);
    if let Some(pool) = &state.redis {
        if let Ok(mut conn) = pool.get().await {
            let expiry: Option<i64> = conn.get(&redis_key).await.ok();
            if expiry.is_some_and(|value| value > Utc::now().timestamp()) {
                return Ok(next.run(req).await);
            }
        }
    }

    let expires_at = sqlx::query_scalar::<_, DateTime<Utc>>(
        "SELECT expires_at FROM visitor_api_keys WHERE api_key = $1 AND expires_at > now()",
    )
    .bind(api_key)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        eprintln!("API key validation error: {e}");
        ApiError::server()
    })?;

    let expires_at =
        expires_at.ok_or_else(|| ApiError::new(StatusCode::UNAUTHORIZED, "invalid_api_key"))?;
    cache_visitor_expiry(&state, &redis_key, expires_at).await;
    Ok(next.run(req).await)
}

fn visitor_cache_key(api_key: &str) -> String {
    format!("visitor_api_expiry:{}", hash_token(api_key))
}

async fn cache_visitor_expiry(state: &SharedState, key: &str, expires_at: DateTime<Utc>) {
    if let Some(pool) = &state.redis {
        if let Ok(mut conn) = pool.get().await {
            let expiry = expires_at.timestamp();
            let ttl = expiry - Utc::now().timestamp();
            if ttl > 0 {
                let _: Result<(), _> = conn.set_ex(key, expiry, ttl as u64).await;
            }
        }
    }
}
