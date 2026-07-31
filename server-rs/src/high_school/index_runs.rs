use axum::{extract::Path as AxumPath, http::StatusCode, Json};
use serde::Deserialize;
use sqlx::Row;

use crate::{
    auth_user, indexer, json, ApiError, DateTime, HeaderMap, SharedState, State, Utc, Uuid, Value,
};

#[derive(Deserialize)]
pub(crate) struct IndexRunInput {
    rebuild: Option<bool>,
    #[serde(rename = "missingOnly")]
    missing_only: Option<bool>,
    domain: Option<String>,
}

pub(crate) async fn start_index(
    State(state): State<SharedState>,
    headers: HeaderMap,
    payload: Option<Json<IndexRunInput>>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let user = auth_user(&state, &headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    let rebuild = payload
        .as_ref()
        .and_then(|body| body.rebuild)
        .unwrap_or(false);
    let missing_only = payload
        .as_ref()
        .and_then(|body| body.missing_only)
        .unwrap_or(false);
    let domain = payload
        .as_ref()
        .and_then(|body| body.domain.as_deref())
        .unwrap_or("high-school");
    if !matches!(domain, "high-school" | "university") {
        return Err(ApiError::bad_request());
    }
    let source_root = if domain == "university" {
        state.project_root.join("src/content")
    } else {
        state.material_root.clone()
    };
    let running: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM material_index_runs WHERE status IN ('queued','running','paused')",
    )
    .fetch_one(&state.db)
    .await?;
    if running > 0 {
        return Err(ApiError::new(StatusCode::CONFLICT, "index_already_running"));
    }
    let row = sqlx::query(
        "INSERT INTO material_index_runs(source_root,status) VALUES($1,'queued') RETURNING id",
    )
    .bind(source_root.to_string_lossy().to_string())
    .fetch_one(&state.db)
    .await?;
    let id: Uuid = row.try_get("id")?;
    let state_clone = state.clone();
    let domain_str = domain.to_string();
    let source_root_clone = source_root.clone();
    tokio::spawn(async move {
        let options = indexer::IndexOptions {
            domain: domain_str,
            root: source_root_clone,
            rebuild,
            missing_only,
            retry_failed: missing_only,
            catalog_only: false,
            file: None,
            course: None,
            subject: None,
            limit: None,
        };
        if let Err(e) = indexer::run(state_clone.clone(), id, options).await {
            eprintln!("Indexer error: {:?}", e);
            let error_str = format!("Indexer error: {:?}", e);
            let _ = sqlx::query(
                "UPDATE material_index_runs SET status='failed',finished_at=now(),updated_at=now(),summary=summary||jsonb_build_object('error',$2) WHERE id=$1 AND status IN ('queued','running')"
            )
            .bind(id)
            .bind(error_str)
            .execute(&state_clone.db)
            .await;
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(
            json!({"id":id,"status":"queued","rebuild":rebuild,"missingOnly":missing_only,"domain":domain}),
        ),
    ))
}

pub(crate) async fn index_run(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    let row=sqlx::query("SELECT id,status,discovered,deduplicated,extracted,embedded,failed,remaining,summary,generation_id,started_at,finished_at,created_at,updated_at FROM material_index_runs WHERE id=$1").bind(id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"index_run_not_found"))?;
    let discovered = row.try_get::<i32, _>("discovered")?;
    let remaining = row.try_get::<i32, _>("remaining")?;
    let processed = (discovered - remaining).max(0);
    let progress = if discovered == 0 {
        0
    } else {
        ((processed * 100) / discovered).clamp(0, 100)
    };
    let status = row.try_get::<String, _>("status")?;
    Ok(Json(
        json!({"id":row.try_get::<Uuid,_>("id")?,"status":status,"progress":if status == "completed" { 100 } else { progress },"processed":processed,"discovered":discovered,"deduplicated":row.try_get::<i32,_>("deduplicated")?,"extracted":row.try_get::<i32,_>("extracted")?,"embedded":row.try_get::<i32,_>("embedded")?,"failed":row.try_get::<i32,_>("failed")?,"remaining":remaining,"generationId":row.try_get::<Option<Uuid>,_>("generation_id")?,"summary":row.try_get::<Value,_>("summary")?,"startedAt":row.try_get::<Option<DateTime<Utc>>,_>("started_at")?,"finishedAt":row.try_get::<Option<DateTime<Utc>>,_>("finished_at")?,"createdAt":row.try_get::<DateTime<Utc>,_>("created_at")?,"updatedAt":row.try_get::<DateTime<Utc>,_>("updated_at")?}),
    ))
}

pub(crate) async fn index_action(
    AxumPath((id, action)): AxumPath<(Uuid, String)>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    match action.as_str() {
        "cancel" => {
            sqlx::query("UPDATE material_index_runs SET status='cancelled',finished_at=now(),updated_at=now() WHERE id=$1 AND status IN ('queued','running','paused')").bind(id).execute(&state.db).await?;
        }
        "pause" => {
            sqlx::query("UPDATE material_index_runs SET status='paused',updated_at=now() WHERE id=$1 AND status='running'").bind(id).execute(&state.db).await?;
        }
        "resume" => {
            sqlx::query("UPDATE material_index_runs SET status='running',updated_at=now() WHERE id=$1 AND status='paused'").bind(id).execute(&state.db).await?;
        }
        "activate" => {
            let generation: Uuid = sqlx::query_scalar(
                "SELECT generation_id FROM material_index_runs WHERE id=$1 AND status='completed'",
            )
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| ApiError::new(StatusCode::CONFLICT, "generation_not_ready"))?;
            let domain: Uuid =
                sqlx::query_scalar("SELECT domain_id FROM embedding_generations WHERE id=$1")
                    .bind(generation)
                    .fetch_one(&state.db)
                    .await?;
            let mut tx = state.db.begin().await?;
            sqlx::query("UPDATE embedding_generations SET status='superseded',is_active=false WHERE domain_id=$1 AND is_active").bind(domain).execute(&mut*tx).await?;
            sqlx::query("UPDATE embedding_generations SET status='active',is_active=true,activated_at=now() WHERE id=$1").bind(generation).execute(&mut*tx).await?;
            tx.commit().await?;
        }
        "rollback" => {
            let current=sqlx::query("SELECT domain_id,activated_at FROM embedding_generations WHERE id=(SELECT generation_id FROM material_index_runs WHERE id=$1)").bind(id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"generation_not_found"))?;
            let domain = current.get::<Uuid, _>("domain_id");
            let previous:Uuid=sqlx::query_scalar("SELECT id FROM embedding_generations WHERE domain_id=$1 AND status='superseded' ORDER BY activated_at DESC NULLS LAST LIMIT 1").bind(domain).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::CONFLICT,"rollback_unavailable"))?;
            let mut tx = state.db.begin().await?;
            sqlx::query("UPDATE embedding_generations SET status='superseded',is_active=false WHERE domain_id=$1 AND is_active").bind(domain).execute(&mut*tx).await?;
            sqlx::query("UPDATE embedding_generations SET status='active',is_active=true,activated_at=now() WHERE id=$1").bind(previous).execute(&mut*tx).await?;
            tx.commit().await?;
        }
        _ => return Err(ApiError::bad_request()),
    }
    Ok(Json(json!({"ok":true,"action":action})))
}
