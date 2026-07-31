use super::*;

pub(crate) async fn gaokao_summary(
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:summary:v1";
    if let Some(value) = crate::cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }
    let profiles: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_subject_profiles")
        .fetch_one(&state.db)
        .await?;
    let papers: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_papers")
        .fetch_one(&state.db)
        .await?;
    let questions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_questions")
        .fetch_one(&state.db)
        .await?;
    let by_source = rows_to_values(sqlx::query(r#"SELECT source_type AS "sourceType", COUNT(*)::int AS count FROM gaokao_questions GROUP BY source_type ORDER BY source_type"#).fetch_all(&state.db).await?, &["sourceType", "count"])?;
    let by_quality = rows_to_values(sqlx::query(r#"SELECT quality, COUNT(*)::int AS count FROM gaokao_questions GROUP BY quality ORDER BY quality"#).fetch_all(&state.db).await?, &["quality", "count"])?;
    let last_import = sqlx::query(r#"SELECT import_key AS "importKey", summary, created_at AS "createdAt" FROM gaokao_import_runs ORDER BY created_at DESC LIMIT 1"#)
        .fetch_optional(&state.db).await?.map(|row| json!({
            "importKey": row.try_get::<String, _>("importKey").ok(),
            "summary": row.try_get::<Value, _>("summary").ok(),
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt").ok(),
        }));
    let value = json!({ "subjects": profiles, "papers": papers, "questions": questions, "bySource": by_source, "byQuality": by_quality, "lastImport": last_import });
    crate::cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

pub(crate) async fn gaokao_subjects(
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:subjects:v1";
    if let Some(value) = crate::cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }
    let rows = sqlx::query(
        r#"SELECT profile.subject_key AS "subjectKey", profile.subject_name AS "subjectName",
                  profile.accent, profile.icon, profile.route, profile.trend, profile.advice,
                  profile.high_frequency AS "highFrequency", profile.easy_mistakes AS "easyMistakes",
                  COALESCE(paper_counts.count, 0)::int AS "paperCount",
                  COALESCE(question_counts.count, 0)::int AS "questionCount"
           FROM gaokao_subject_profiles profile
           LEFT JOIN (SELECT subject_key, COUNT(*) AS count FROM gaokao_papers GROUP BY subject_key) paper_counts ON paper_counts.subject_key = profile.subject_key
           LEFT JOIN (SELECT subject_key, COUNT(*) AS count FROM gaokao_questions GROUP BY subject_key) question_counts ON question_counts.subject_key = profile.subject_key
           ORDER BY profile.subject_key"#,
    ).fetch_all(&state.db).await?;
    let subjects: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "subjectKey": row.try_get::<String, _>("subjectKey")?,
                "subjectName": row.try_get::<String, _>("subjectName")?,
                "accent": row.try_get::<Option<String>, _>("accent")?,
                "icon": row.try_get::<Option<String>, _>("icon")?,
                "route": row.try_get::<Option<String>, _>("route")?,
                "trend": row.try_get::<Option<String>, _>("trend")?,
                "advice": row.try_get::<Option<String>, _>("advice")?,
                "highFrequency": row.try_get::<Value, _>("highFrequency")?,
                "easyMistakes": row.try_get::<Value, _>("easyMistakes")?,
                "paperCount": row.try_get::<i32, _>("paperCount")?,
                "questionCount": row.try_get::<i32, _>("questionCount")?,
            }))
        })
        .collect();
    let value = json!({ "subjects": subjects? });
    crate::cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

pub(crate) async fn gaokao_questions(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<QuestionParams>,
) -> Result<Json<Value>, ApiError> {
    let include_hidden = if params.include_hidden.unwrap_or(false) {
        auth_user(&state, &headers)
            .await
            .map(|user| user.role == "admin")
            .unwrap_or(false)
    } else {
        false
    };
    let limit = params.limit.unwrap_or(100).clamp(1, 500);
    let offset = params
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0);
    let cache_key = format!(
        "gaokao:questions:v4:{}:{}:{}",
        offset,
        include_hidden,
        serde_json::to_string(&params).unwrap_or_default()
    );
    if let Some(value) = crate::cache_get(&state.redis, &cache_key).await {
        return Ok(Json(value));
    }
    let total_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM gaokao_questions
           WHERE ($1::text IS NULL OR subject_key = $1)
             AND ($2::int IS NULL OR year = $2)
             AND ($3::text IS NULL OR difficulty = $3)
             AND ($4::text IS NULL OR quality = $4)
             AND ($5::text IS NULL OR source_type = $5)
             AND ($6::bool IS NULL OR (($6 = true AND jsonb_array_length(solution) > 0) OR ($6 = false AND jsonb_array_length(solution) = 0)))
             AND ($7::text IS NULL OR metadata #>> '{solutionEnrichment,status}' = $7)
             AND ($8::bool = true OR (COALESCE(metadata #>> '{cleanup,status}', '') <> 'soft_deleted' AND display_complete))"#,
    )
    .bind(params.subject.as_deref()).bind(params.year).bind(params.difficulty.as_deref())
    .bind(params.quality.as_deref()).bind(params.source_type.as_deref()).bind(params.has_solution)
    .bind(params.solution_status.as_deref())
    .bind(include_hidden)
    .fetch_one(&state.db).await?;
    let rows = sqlx::query(
        r#"SELECT id, question_key AS "questionKey", year, subject_key AS "subjectKey",
                  subject_name AS "subjectName", question_number AS "questionNumber",
                  question_type AS "questionType", difficulty, quality, prompt, answer, solution,
                  flags, source_type AS "sourceType", metadata, display_complete AS "displayComplete", incomplete_reason AS "incompleteReason", updated_at AS "updatedAt"
           FROM gaokao_questions
           WHERE ($1::text IS NULL OR subject_key = $1)
             AND ($2::int IS NULL OR year = $2)
             AND ($3::text IS NULL OR difficulty = $3)
             AND ($4::text IS NULL OR quality = $4)
             AND ($5::text IS NULL OR source_type = $5)
             AND ($6::bool IS NULL OR (($6 = true AND jsonb_array_length(solution) > 0) OR ($6 = false AND jsonb_array_length(solution) = 0)))
             AND ($7::text IS NULL OR metadata #>> '{solutionEnrichment,status}' = $7)
             AND ($8::bool = true OR (COALESCE(metadata #>> '{cleanup,status}', '') <> 'soft_deleted' AND display_complete))
           ORDER BY year NULLS LAST, subject_key, question_number NULLS LAST, updated_at DESC, id
           LIMIT $9 OFFSET $10"#,
    )
    .bind(params.subject.as_deref()).bind(params.year).bind(params.difficulty.as_deref())
    .bind(params.quality.as_deref()).bind(params.source_type.as_deref()).bind(params.has_solution)
    .bind(params.solution_status.as_deref())
    .bind(include_hidden)
    .bind(limit).bind(offset).fetch_all(&state.db).await?;
    let questions: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| question_row(row, &state.question_assets))
        .collect();
    let questions = questions?;
    let loaded = offset + questions.len() as i64;
    let has_more = loaded < total_count;
    let value = json!({
        "questions": questions,
        "pageInfo": { "nextCursor": if has_more { Some(loaded.to_string()) } else { None }, "hasMore": has_more, "totalLoaded": loaded, "totalCount": total_count }
    });
    crate::cache_set(&state.redis, &cache_key, &value).await;
    Ok(Json(value))
}
