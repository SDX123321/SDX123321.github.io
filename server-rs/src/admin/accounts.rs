use super::*;
use axum::extract::Path as AxumPath;

pub(crate) async fn overview(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let accounts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;
    let active_today: i64 = sqlx::query_scalar(
        "SELECT COUNT(DISTINCT user_id) FROM study_events WHERE occurred_at >= current_date",
    )
    .fetch_one(&state.db)
    .await?;
    let suspended: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE risk_status <> 'active'")
            .fetch_one(&state.db)
            .await?;
    let ai_today = sqlx::query(
        "SELECT COUNT(*)::int calls,COALESCE(SUM(input_chars),0)::bigint input_chars,COALESCE(SUM(output_chars),0)::bigint output_chars FROM ai_usage_events WHERE created_at >= current_date",
    )
    .fetch_one(&state.db)
    .await?;
    let uploads = sqlx::query(
        "SELECT id,file_name,size_bytes,status,error,metadata,created_at,updated_at FROM material_uploads ORDER BY created_at DESC LIMIT 12",
    )
    .fetch_all(&state.db)
    .await?;
    let recent_risks = sqlx::query(
        "SELECT event_type,username,risk_level,ip_address,created_at FROM auth_events WHERE risk_level <> 'info' ORDER BY created_at DESC LIMIT 12",
    )
    .fetch_all(&state.db)
    .await?;
    let last_index_run =
        sqlx::query("SELECT id,status FROM material_index_runs ORDER BY created_at DESC LIMIT 1")
            .fetch_optional(&state.db)
            .await?;
    Ok(Json(json!({
        "accounts": accounts,
        "activeToday": active_today,
        "suspended": suspended,
        "aiToday": {"calls":ai_today.try_get::<i32,_>("calls")?,"inputChars":ai_today.try_get::<i64,_>("input_chars")?,"outputChars":ai_today.try_get::<i64,_>("output_chars")?},
        "uploads": uploads.into_iter().map(|r| json!({"id":r.get::<Uuid,_>("id"),"fileName":r.get::<String,_>("file_name"),"sizeBytes":r.get::<i64,_>("size_bytes"),"status":r.get::<String,_>("status"),"error":r.get::<Option<String>,_>("error"),"metadata":r.get::<Value,_>("metadata"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")})).collect::<Vec<_>>(),
        "lastIndexRun": last_index_run.map(|r| json!({"id":r.get::<Uuid,_>("id"),"status":r.get::<String,_>("status")})),
        "risks": recent_risks.into_iter().map(|r| json!({"eventType":r.get::<String,_>("event_type"),"username":r.get::<Option<String>,_>("username"),"riskLevel":r.get::<String,_>("risk_level"),"ipAddress":r.get::<Option<String>,_>("ip_address"),"createdAt":r.get::<DateTime<Utc>,_>("created_at")})).collect::<Vec<_>>()
    })))
}

pub(crate) async fn accounts(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<AccountParams>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let limit = params.limit.unwrap_or(30).clamp(1, 100);
    let offset = params.cursor.unwrap_or(0).max(0);
    let pattern = params.q.map(|q| format!("%{}%", q.trim()));
    let rows = sqlx::query(
        r#"SELECT u.id,u.username,u.role,u.risk_status,u.failed_login_count,u.locked_until,u.created_at,u.last_login_at,
            COALESCE(s.total_study_seconds,0) total_study_seconds,COALESCE(s.practice_done_count,0) practice_done_count,
            (SELECT COUNT(*) FROM ai_usage_events a WHERE a.user_id=u.id) ai_calls,
            (SELECT COUNT(*) FROM sessions x WHERE x.user_id=u.id AND x.expires_at>now()) active_sessions
            FROM users u LEFT JOIN study_snapshots s ON s.user_id=u.id
            WHERE ($1::text IS NULL OR u.username ILIKE $1)
            ORDER BY u.created_at DESC LIMIT $2 OFFSET $3"#,
    )
    .bind(&pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(json!({
        "accounts": rows.into_iter().map(|r| json!({
            "id":r.get::<Uuid,_>("id"),"username":r.get::<String,_>("username"),"role":r.get::<String,_>("role"),
            "riskStatus":r.get::<String,_>("risk_status"),"failedLoginCount":r.get::<i32,_>("failed_login_count"),
            "lockedUntil":r.get::<Option<DateTime<Utc>>,_>("locked_until"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),
            "lastLoginAt":r.get::<Option<DateTime<Utc>>,_>("last_login_at"),"studySeconds":r.get::<i32,_>("total_study_seconds"),
            "practiceCount":r.get::<i32,_>("practice_done_count"),"aiCalls":r.get::<i64,_>("ai_calls"),"activeSessions":r.get::<i64,_>("active_sessions")
        })).collect::<Vec<_>>(),
        "nextCursor": if rows_len(&state.db, pattern.as_deref(), offset + limit).await? {Some(offset+limit)} else {None::<i64>}
    })))
}

async fn rows_len(db: &PgPool, pattern: Option<&str>, offset: i64) -> Result<bool, ApiError> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM users WHERE ($1::text IS NULL OR username ILIKE $1)",
    )
    .bind(pattern)
    .fetch_one(db)
    .await?;
    Ok(offset < count)
}

pub(crate) async fn account_risk(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<RiskInput>,
) -> Result<Json<Value>, ApiError> {
    let admin = require_admin(&state, &headers).await?;
    if admin.id == id && input.action != "revoke_sessions" {
        return Err(ApiError::bad_request());
    }
    match input.action.as_str() {
        "suspend" => {
            sqlx::query("UPDATE users SET risk_status='suspended' WHERE id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        "activate" => {
            sqlx::query("UPDATE users SET risk_status='active',failed_login_count=0,locked_until=NULL WHERE id=$1").bind(id).execute(&state.db).await?;
        }
        "lock" => {
            sqlx::query("UPDATE users SET locked_until=now()+interval '24 hours' WHERE id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        "revoke_sessions" => {
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&state.db)
                .await?;
        }
        _ => return Err(ApiError::bad_request()),
    }
    sqlx::query("INSERT INTO auth_events(user_id,username,event_type,risk_level,metadata) SELECT id,username,$2,'warning',$3 FROM users WHERE id=$1")
        .bind(id).bind(format!("admin_{}",input.action)).bind(json!({"adminId":admin.id,"reason":input.reason})).execute(&state.db).await?;
    Ok(Json(json!({"ok":true})))
}
