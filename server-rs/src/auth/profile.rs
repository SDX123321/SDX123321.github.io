use super::*;

pub(crate) async fn me(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
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
