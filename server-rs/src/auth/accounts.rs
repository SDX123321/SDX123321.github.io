use super::*;
use axum::{extract::ConnectInfo, response::IntoResponse};
use bcrypt::{hash as bcrypt_hash, verify as bcrypt_verify, DEFAULT_COST};
use std::net::SocketAddr;

pub(crate) async fn record_auth_event(
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

pub(crate) async fn register(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
    enforce_auth_rate(&state, &headers, peer, "register", 10)?;
    if !validate_auth(&input) {
        record_auth_event(
            &state,
            &headers,
            None,
            input.username.trim(),
            "register_rejected_input",
            "warning",
        )
        .await;
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "invalid_input" })),
        )
            .into_response());
    }
    let password_hash =
        bcrypt_hash(&input.password, DEFAULT_COST).map_err(|_| ApiError::server())?;
    let row = sqlx::query(
        "INSERT INTO users (username, password_hash, role, last_login_at) VALUES ($1, $2, 'student', now()) RETURNING id, username, role, created_at, last_login_at",
    )
    .bind(input.username.trim())
    .bind(password_hash)
    .fetch_optional(&state.db)
    .await;

    let row = match row {
        Ok(Some(r)) => r,
        Ok(None) => return Err(ApiError::server()),
        Err(sqlx::Error::Database(dbe)) if dbe.is_unique_violation() => {
            record_auth_event(
                &state,
                &headers,
                None,
                input.username.trim(),
                "register_duplicate_user",
                "warning",
            )
            .await;
            return Ok((
                StatusCode::CONFLICT,
                Json(json!({ "error": "username_exists" })),
            )
                .into_response());
        }
        Err(e) => return Err(e.into()),
    };

    let user = UserSession {
        id: row.try_get("id")?,
        username: row.try_get("username")?,
        role: row.try_get("role")?,
        created_at: row.try_get("created_at")?,
        last_login_at: row.try_get("last_login_at")?,
    };
    let token = create_session(&state, user.id).await?;
    record_auth_event(
        &state,
        &headers,
        Some(user.id),
        &user.username,
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

pub(crate) async fn login(
    State(state): State<SharedState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
    enforce_auth_rate(&state, &headers, peer, "login", 10)?;
    if !validate_auth(&input) {
        record_auth_event(
            &state,
            &headers,
            None,
            input.username.trim(),
            "login_rejected_input",
            "warning",
        )
        .await;
        return Ok((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "invalid_input" })),
        )
            .into_response());
    }
    let row = sqlx::query(
        "SELECT id, username, password_hash, role, risk_status, locked_until, created_at FROM users WHERE username = $1",
    )
    .bind(input.username.trim())
    .fetch_optional(&state.db)
    .await?;

    let Some(row) = row else {
        record_auth_event(
            &state,
            &headers,
            None,
            input.username.trim(),
            "login_user_not_found",
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

pub(crate) async fn logout(
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
