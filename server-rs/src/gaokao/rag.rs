use super::*;

pub(crate) async fn gaokao_rag_summary(
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let cache_key = "gaokao:rag:summary:v1";
    if let Some(value) = crate::cache_get(&state.redis, cache_key).await {
        return Ok(Json(value));
    }

    let document_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_rag_documents")
        .fetch_one(&state.db)
        .await?;
    let chunk_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM gaokao_rag_chunks")
        .fetch_one(&state.db)
        .await?;
    let by_subject = rows_to_values(
        sqlx::query(
            r#"SELECT subject_key AS "subjectKey", COUNT(*)::int AS documents,
                      COALESCE(SUM(text_length), 0)::bigint AS "textLength"
               FROM gaokao_rag_documents
               GROUP BY subject_key
               ORDER BY subject_key"#,
        )
        .fetch_all(&state.db)
        .await?,
        &["subjectKey", "documents", "textLength"],
    )?;
    let by_kind = rows_to_values(
        sqlx::query(
            r#"SELECT doc_kind AS "docKind", COUNT(*)::int AS documents
               FROM gaokao_rag_documents
               GROUP BY doc_kind
               ORDER BY doc_kind"#,
        )
        .fetch_all(&state.db)
        .await?,
        &["docKind", "documents"],
    )?;
    let last_import = sqlx::query(
        r#"SELECT import_key AS "importKey", summary, created_at AS "createdAt"
           FROM gaokao_import_runs
           WHERE summary ->> 'kind' = 'rag-index'
           ORDER BY created_at DESC
           LIMIT 1"#,
    )
    .fetch_optional(&state.db)
    .await?
    .map(|row| {
        json!({
            "importKey": row.try_get::<String, _>("importKey").ok(),
            "summary": row.try_get::<Value, _>("summary").ok(),
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt").ok(),
        })
    });
    let pending_rows = sqlx::query(
        r#"SELECT source_path AS "sourcePath", subject_key AS "subjectKey", note, status,
                  created_at AS "createdAt"
           FROM gaokao_rag_imports
           ORDER BY created_at DESC
           LIMIT 10"#,
    )
    .fetch_all(&state.db)
    .await?;
    let pending_imports: Result<Vec<_>, sqlx::Error> = pending_rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "sourcePath": row.try_get::<String, _>("sourcePath")?,
                "subjectKey": row.try_get::<Option<String>, _>("subjectKey")?,
                "note": row.try_get::<Option<String>, _>("note")?,
                "status": row.try_get::<String, _>("status")?,
                "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt")?,
            }))
        })
        .collect();
    let value = json!({
        "documents": document_count,
        "chunks": chunk_count,
        "bySubject": by_subject,
        "byKind": by_kind,
        "lastImport": last_import,
        "pendingImports": pending_imports?,
    });
    crate::cache_set(&state.redis, cache_key, &value).await;
    Ok(Json(value))
}

pub(crate) async fn gaokao_rag_search(
    State(state): State<SharedState>,
    Query(params): Query<RagSearchParams>,
) -> Result<Json<Value>, ApiError> {
    let query = params.q.unwrap_or_default().trim().to_string();
    let limit = params.limit.unwrap_or(12).clamp(1, 50);
    let pattern = if query.is_empty() {
        None
    } else {
        Some(format!(
            "%{}%",
            query.replace('%', "\\%").replace('_', "\\_")
        ))
    };
    let cache_key = format!(
        "gaokao:rag:search:v1:{}:{}:{}:{}",
        query,
        params.subject.as_deref().unwrap_or(""),
        params.doc_kind.as_deref().unwrap_or(""),
        limit
    );
    if let Some(value) = crate::cache_get(&state.redis, &cache_key).await {
        return Ok(Json(value));
    }
    let rows = sqlx::query(
        r#"SELECT chunks.id, docs.source_path AS "sourcePath", docs.file_name AS "fileName",
                  docs.subject_key AS "subjectKey", docs.year, docs.doc_kind AS "docKind",
                  chunks.chunk_index AS "chunkIndex", chunks.chunk_text AS "chunkText",
                  chunks.token_estimate AS "tokenEstimate", chunks.metadata,
                  docs.metadata AS "documentMetadata", docs.updated_at AS "updatedAt",
                  CASE
                    WHEN $2::text IS NULL THEN 0
                    WHEN chunks.chunk_text ILIKE $2 ESCAPE '\' THEN 10
                    WHEN docs.file_name ILIKE $2 ESCAPE '\' OR docs.source_path ILIKE $2 ESCAPE '\' THEN 5
                    ELSE 1
                  END::int AS score
           FROM gaokao_rag_chunks chunks
           JOIN gaokao_rag_documents docs ON docs.id = chunks.document_id
           WHERE ($1::text IS NULL OR docs.subject_key = $1)
             AND ($2::text IS NULL OR chunks.chunk_text ILIKE $2 ESCAPE '\' OR docs.file_name ILIKE $2 ESCAPE '\' OR docs.source_path ILIKE $2 ESCAPE '\')
             AND ($3::text IS NULL OR docs.doc_kind = $3)
           ORDER BY score DESC, docs.year DESC NULLS LAST, docs.updated_at DESC, chunks.chunk_index
           LIMIT $4"#,
    )
    .bind(params.subject.as_deref().filter(|value| !value.is_empty()))
    .bind(pattern.as_deref())
    .bind(params.doc_kind.as_deref().filter(|value| !value.is_empty()))
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    let matches: Result<Vec<_>, sqlx::Error> = rows
        .into_iter()
        .map(|row| {
            Ok(json!({
                "id": row.try_get::<Uuid, _>("id")?,
                "sourcePath": row.try_get::<String, _>("sourcePath")?,
                "fileName": row.try_get::<String, _>("fileName")?,
                "subjectKey": row.try_get::<String, _>("subjectKey")?,
                "year": row.try_get::<Option<i32>, _>("year")?,
                "docKind": row.try_get::<String, _>("docKind")?,
                "chunkIndex": row.try_get::<i32, _>("chunkIndex")?,
                "chunkText": row.try_get::<String, _>("chunkText")?,
                "tokenEstimate": row.try_get::<i32, _>("tokenEstimate")?,
                "metadata": row.try_get::<Value, _>("metadata")?,
                "documentMetadata": row.try_get::<Value, _>("documentMetadata")?,
                "score": row.try_get::<i32, _>("score")?,
                "updatedAt": row.try_get::<DateTime<Utc>, _>("updatedAt")?,
            }))
        })
        .collect();
    let value = json!({ "matches": matches?, "query": query });
    crate::cache_set(&state.redis, &cache_key, &value).await;
    Ok(Json(value))
}

pub(crate) async fn gaokao_rag_import(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<RagImportInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    if user.role != "admin" {
        return Err(ApiError::forbidden());
    }
    let source_path = input.source_path.trim();
    if source_path.len() < 2 || source_path.len() > 500 {
        return Err(ApiError::bad_request());
    }
    let row = sqlx::query(
        r#"INSERT INTO gaokao_rag_imports
             (requested_by, source_path, subject_key, note, status, metadata)
           VALUES ($1,$2,$3,$4,'requested',$5)
           RETURNING id, created_at AS "createdAt""#,
    )
    .bind(user.id)
    .bind(source_path)
    .bind(input.subject_key.as_deref())
    .bind(input.note.as_deref())
    .bind(input.metadata)
    .fetch_one(&state.db)
    .await?;
    let mut command = format!("npm run gaokao:rag -- --only-root \"{}\"", source_path);
    if let Some(subject) = input
        .subject_key
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        command.push_str(&format!(" --subject {}", subject));
    }
    Ok(Json(json!({
        "ok": true,
        "import": {
            "id": row.try_get::<Uuid, _>("id")?,
            "sourcePath": source_path,
            "subjectKey": input.subject_key,
            "status": "requested",
            "createdAt": row.try_get::<DateTime<Utc>, _>("createdAt")?,
        },
        "suggestedCommand": command,
    })))
}
