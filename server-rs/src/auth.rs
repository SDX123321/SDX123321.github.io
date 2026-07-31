use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use bcrypt::{hash as bcrypt_hash, verify as bcrypt_verify, DEFAULT_COST};
use chrono::{DateTime, Utc};
use deadpool_redis::redis::AsyncCommands;
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::types::{
    ApiError, AuthInput, ImportInput, ProgressSnapshot, SharedState, StudyEventInput, UserOut,
    UserSession,
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

pub(crate) async fn auth_user(state: &SharedState, headers: &HeaderMap) -> Result<UserSession, ApiError> {
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

pub(crate) async fn get_stats(db: &PgPool, user_id: Uuid) -> Result<Value, ApiError> {
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

pub(crate) async fn upsert_snapshot(
    db: &PgPool,
    user_id: Uuid,
    snapshot: &ProgressSnapshot,
    mode: &str,
) -> Result<(), ApiError> {
    // Single-statement UPSERT so concurrent study_events can't lose counters to a read-modify-write race.
    sqlx::query(
        r#"INSERT INTO study_snapshots (
             user_id, total_study_seconds, chapter_done_count, wrong_count, practice_done_count,
             mastery_item_count, scroll_position_count, recent_paths, last_activity_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,to_jsonb($8::text[]),now(),now())
           ON CONFLICT (user_id) DO UPDATE SET
             total_study_seconds = CASE WHEN $9 = 'add'
               THEN study_snapshots.total_study_seconds + EXCLUDED.total_study_seconds
               ELSE GREATEST(study_snapshots.total_study_seconds, EXCLUDED.total_study_seconds) END,
             chapter_done_count = GREATEST(study_snapshots.chapter_done_count, EXCLUDED.chapter_done_count),
             wrong_count = GREATEST(study_snapshots.wrong_count, EXCLUDED.wrong_count),
             practice_done_count = GREATEST(study_snapshots.practice_done_count, EXCLUDED.practice_done_count),
             mastery_item_count = GREATEST(study_snapshots.mastery_item_count, EXCLUDED.mastery_item_count),
             scroll_position_count = GREATEST(study_snapshots.scroll_position_count, EXCLUDED.scroll_position_count),
             recent_paths = (
               SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
                 SELECT x FROM (
                   SELECT x, rn, ROW_NUMBER() OVER (PARTITION BY x ORDER BY rn) AS seen FROM (
                     SELECT incoming.x AS x, incoming.rn AS rn
                       FROM unnest($8::text[]) WITH ORDINALITY AS incoming(x, rn)
                     UNION ALL
                     SELECT e.x AS x, 100000 + e.rn AS rn
                       FROM jsonb_array_elements_text(study_snapshots.recent_paths)
                            WITH ORDINALITY AS e(x, rn)
                   ) combined
                   WHERE x IS NOT NULL AND x <> ''
                 ) deduped
                 WHERE seen = 1
                 ORDER BY rn
                 LIMIT 10
               ) top
             ),
             last_activity_at = now(), updated_at = now()"#,
    )
    .bind(user_id)
    .bind(snapshot.total_study_seconds)
    .bind(snapshot.chapter_done_count)
    .bind(snapshot.wrong_count)
    .bind(snapshot.practice_done_count)
    .bind(snapshot.mastery_item_count)
    .bind(snapshot.scroll_position_count)
    .bind(&snapshot.recent_paths)
    .bind(mode)
    .execute(db)
    .await?;
    Ok(())
}

pub(crate) async fn increment_snapshot(
    db: &PgPool,
    user_id: Uuid,
    field: &str,
    page_path: Option<String>,
) -> Result<(), ApiError> {
    let mut snapshot = ProgressSnapshot {
        total_study_seconds: 0,
        chapter_done_count: 0,
        wrong_count: 0,
        practice_done_count: 0,
        mastery_item_count: 0,
        scroll_position_count: 0,
        recent_paths: page_path.into_iter().collect(),
    };
    match field {
        "chapter_done_count" => snapshot.chapter_done_count += 1,
        "wrong_count" => snapshot.wrong_count += 1,
        "practice_done_count" => snapshot.practice_done_count += 1,
        _ => {}
    }
    // Fields are merged atomically with GREATEST semantics in upsert_snapshot,
    // so the read-modify-write here only sets which counters to bump.
    upsert_snapshot(db, user_id, &snapshot, "max").await
}

pub(crate) async fn register(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
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
    let password_hash = bcrypt_hash(&input.password, DEFAULT_COST).map_err(|_| ApiError::server())?;
    let role = if input.username.trim() == "admin" { "admin" } else { "student" };
    let row = sqlx::query(
        "INSERT INTO users (username, password_hash, role, last_login_at) VALUES ($1, $2, $3, now()) RETURNING id, username, role, created_at, last_login_at",
    )
    .bind(input.username.trim())
    .bind(password_hash)
    .bind(role)
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
    headers: HeaderMap,
    Json(input): Json<AuthInput>,
) -> Result<Response, ApiError> {
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

pub(crate) async fn me(State(state): State<SharedState>, headers: HeaderMap) -> Result<Json<Value>, ApiError> {
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

pub(crate) async fn me_stats(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    Ok(Json(
        json!({ "stats": get_stats(&state.db, user.id).await? }),
    ))
}

pub(crate) async fn import_local(
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

pub(crate) async fn study_event(
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

pub(crate) async fn api_handshake(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
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
