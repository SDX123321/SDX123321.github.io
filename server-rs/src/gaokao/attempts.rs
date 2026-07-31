use super::*;

pub(crate) async fn gaokao_attempts(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<GaokaoAttemptInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if input.question_key.is_empty() || !matches!(input.result.as_str(), "correct" | "wrong") {
        return Err(ApiError::bad_request());
    }
    sqlx::query(
        r#"INSERT INTO gaokao_answer_attempts (user_id, question_key, subject_key, result, knowledge_nodes, prompt_snapshot, answer_snapshot, source_type, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)"#,
    )
    .bind(user.id).bind(input.question_key).bind(input.subject_key).bind(input.result).bind(json!(input.knowledge_nodes))
    .bind(input.prompt_snapshot).bind(input.answer_snapshot).bind(input.source_type).bind(input.metadata)
    .execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}

pub(crate) async fn gaokao_weaknesses(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let rows = sqlx::query(
        r#"SELECT node.value AS "knowledgeNode", COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE result = 'correct')::int AS correct,
                  COUNT(*) FILTER (WHERE result = 'wrong')::int AS wrong,
                  MAX(answered_at) AS "lastAnsweredAt"
           FROM gaokao_answer_attempts
           CROSS JOIN LATERAL jsonb_array_elements_text(knowledge_nodes) AS node(value)
           WHERE user_id = $1
           GROUP BY node.value
           ORDER BY wrong DESC, total DESC, "lastAnsweredAt" DESC
           LIMIT 30"#,
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let weaknesses: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "knowledgeNode": row.try_get::<String, _>("knowledgeNode")?,
                "total": row.try_get::<i32, _>("total")?,
                "correct": row.try_get::<i32, _>("correct")?,
                "wrong": row.try_get::<i32, _>("wrong")?,
                "lastAnsweredAt": row.try_get::<Option<DateTime<Utc>>, _>("lastAnsweredAt")?,
            }))
        })
        .collect();
    Ok(Json(json!({ "weaknesses": weaknesses? })))
}
