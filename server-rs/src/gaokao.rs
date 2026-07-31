use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::{
    auth::auth_user,
    types::{
        ApiError, GaokaoAttemptInput, QuestionParams, RagImportInput, RagSearchParams, SharedState,
    },
};

pub(crate) async fn load_question_assets(
    project_root: &std::path::Path,
) -> std::collections::HashMap<String, Value> {
    let path = project_root.join("src/data/gaokao-question-assets.json");
    let Ok(raw) = tokio::fs::read_to_string(path).await else {
        return std::collections::HashMap::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return std::collections::HashMap::new();
    };
    value
        .get("questions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some((
                item.get("questionKey")?.as_str()?.to_string(),
                item.get("images").cloned().unwrap_or_else(|| json!([])),
            ))
        })
        .collect()
}

pub(crate) async fn audit_question_completeness(
    db: &PgPool,
    project_root: &std::path::Path,
    assets: &std::collections::HashMap<String, Value>,
) -> anyhow::Result<()> {
    let rows = sqlx::query("SELECT id,question_key,prompt FROM gaokao_questions")
        .fetch_all(db)
        .await?;
    let asset_root = project_root.join("public/gaokao-assets/images");
    let mut ids = Vec::with_capacity(rows.len());
    let mut complete = Vec::with_capacity(rows.len());
    let mut reason_values = Vec::with_capacity(rows.len());
    for row in rows {
        let id: Uuid = row.get("id");
        let key: String = row.get("question_key");
        let prompt: String = row.get("prompt");
        let image_required = ["如图", "图中", "下图", "示意图", "图表", "看图", "据图"]
            .iter()
            .any(|marker| prompt.contains(marker));
        let images = assets
            .get(&key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut reasons = Vec::new();
        if prompt.trim().chars().count() < 12 {
            reasons.push("prompt_incomplete");
        }
        if image_required && images.is_empty() {
            reasons.push("required_image_missing");
        }
        for image in &images {
            if image.get("needsReview").and_then(Value::as_bool) == Some(true) {
                reasons.push("image_needs_review");
            }
            let url = image.get("url").and_then(Value::as_str).unwrap_or_default();
            let name = url.rsplit('/').next().unwrap_or_default();
            let supported = ["png", "jpg", "jpeg", "webp", "gif"]
                .iter()
                .any(|ext| name.to_ascii_lowercase().ends_with(ext));
            if !supported {
                reasons.push("unsupported_image");
            }
            if name.is_empty() || tokio::fs::metadata(asset_root.join(name)).await.is_err() {
                reasons.push("image_file_missing");
            }
        }
        reasons.sort();
        reasons.dedup();
        ids.push(id);
        complete.push(reasons.is_empty());
        reason_values.push(reasons.join(","));
    }
    sqlx::query(r#"UPDATE gaokao_questions q SET display_complete=v.complete,incomplete_reason=NULLIF(v.reason,'')
      FROM (SELECT * FROM unnest($1::uuid[],$2::bool[],$3::text[]) AS t(id,complete,reason)) v WHERE q.id=v.id"#)
        .bind(ids).bind(complete).bind(reason_values).execute(db).await?;
    Ok(())
}

pub(crate) async fn gaokao_summary(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
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

pub(crate) async fn gaokao_subjects(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
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

fn question_row(
    row: sqlx::postgres::PgRow,
    question_assets: &std::collections::HashMap<String, Value>,
) -> Result<Value, sqlx::Error> {
    let solution: Value = row.try_get("solution")?;
    let metadata: Value = row.try_get("metadata")?;
    let subject_key: String = row.try_get("subjectKey")?;
    let question_type: Option<String> = row.try_get("questionType")?;
    let difficulty: Option<String> = row.try_get("difficulty")?;
    let source_type: String = row.try_get("sourceType")?;
    let prompt: String = row.try_get("prompt")?;
    let flags: Value = row.try_get("flags")?;
    let question_type_label = infer_question_type(&subject_key, question_type.as_deref(), &prompt);
    let source_type_label = source_type_label(&source_type);
    let (materials, stem) = split_reading_material(&subject_key, &prompt, &metadata);
    let solution_status = metadata
        .pointer("/solutionEnrichment/status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut display_tags = vec![question_type_label.clone(), source_type_label.clone()];
    if let Some(label) = difficulty.as_deref().map(difficulty_label) {
        display_tags.push(label);
    }
    if let Some(status) = solution_status.as_deref().and_then(solution_status_label) {
        display_tags.push(status);
    }
    display_tags.sort();
    display_tags.dedup();

    let mut admin_tags = value_string_vec(&flags);
    admin_tags.push(format!("quality:{}", row.try_get::<String, _>("quality")?));
    admin_tags.push(format!("sourceType:{}", source_type));
    if let Some(status) = metadata.pointer("/cleanup/status").and_then(Value::as_str) {
        admin_tags.push(format!("cleanup:{}", status));
    }
    if let Some(status) = solution_status.as_deref() {
        admin_tags.push(format!("solution:{}", status));
    }
    admin_tags.sort();
    admin_tags.dedup();

    let question_key: String = row.try_get("questionKey")?;
    let images = question_assets
        .get(&question_key)
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "questionKey": question_key,
        "year": row.try_get::<Option<i32>, _>("year")?,
        "subjectKey": subject_key,
        "subjectName": row.try_get::<String, _>("subjectName")?,
        "questionNumber": row.try_get::<Option<i32>, _>("questionNumber")?,
        "questionType": question_type,
        "questionTypeLabel": question_type_label,
        "difficulty": difficulty,
        "quality": row.try_get::<String, _>("quality")?,
        "prompt": prompt,
        "stem": stem,
        "materials": materials,
        "images": images,
        "answer": row.try_get::<Option<String>, _>("answer")?,
        "solution": solution,
        "flags": flags,
        "sourceType": source_type,
        "sourceTypeLabel": source_type_label,
        "displayTags": display_tags,
        "adminTags": admin_tags,
        "isHidden": metadata.pointer("/cleanup/status").and_then(Value::as_str) == Some("soft_deleted"),
        "displayComplete": row.try_get::<bool,_>("displayComplete")?,
        "incompleteReason": row.try_get::<Option<String>,_>("incompleteReason")?,
        "metadata": metadata,
        "hasSolution": solution.as_array().map(|items| !items.is_empty()).unwrap_or(false),
        "solutionStatus": solution_status,
        "updatedAt": row.try_get::<DateTime<Utc>, _>("updatedAt")?,
    }))
}

fn value_string_vec(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("tag").and_then(Value::as_str))
            })
            .map(str::to_string)
            .filter(|item| !item.trim().is_empty())
            .collect(),
        Value::String(item) if !item.trim().is_empty() => vec![item.to_string()],
        _ => Vec::new(),
    }
}

fn infer_question_type(subject_key: &str, raw: Option<&str>, prompt: &str) -> String {
    if let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) {
        if value
            .chars()
            .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch))
        {
            return value.to_string();
        }
        let lowered = value.to_ascii_lowercase();
        if lowered.contains("choice") || lowered == "single" || lowered == "multiple" {
            return "选择题".to_string();
        }
        if lowered.contains("fill") || lowered.contains("blank") {
            return "填空题".to_string();
        }
        if lowered.contains("essay")
            || lowered.contains("composition")
            || lowered.contains("writing")
        {
            return "写作题".to_string();
        }
        if lowered.contains("proof") || lowered.contains("solve") || lowered.contains("answer") {
            return "解答题".to_string();
        }
        if lowered.contains("reading") {
            return "阅读理解".to_string();
        }
    }

    if subject_key == "chinese" {
        if prompt.contains("作文") || prompt.contains("写作") {
            return "写作题".to_string();
        }
        if prompt.contains("文言文") || prompt.contains("翻译") {
            return "文言文阅读".to_string();
        }
        if prompt.contains("古诗") || prompt.contains("诗歌") {
            return "古诗文鉴赏".to_string();
        }
        if prompt.contains("阅读") || prompt.contains("材料") {
            return "阅读理解".to_string();
        }
    }
    if prompt.contains("A.") || prompt.contains("A．") || prompt.contains("A、") {
        return "选择题".to_string();
    }
    if prompt.contains("证明") || prompt.contains("求") || prompt.contains("解答") {
        return "解答题".to_string();
    }
    "综合题".to_string()
}

fn difficulty_label(value: &str) -> String {
    match value {
        "easy" => "基础巩固".to_string(),
        "medium" => "迁移应用".to_string(),
        "hard" => "综合创新".to_string(),
        _ => "难度待标注".to_string(),
    }
}

fn source_type_label(value: &str) -> String {
    match value {
        "real" => "真题入库".to_string(),
        "real-docx" => "文档抽取".to_string(),
        "real-pdf-text" => "文本抽取".to_string(),
        "real-ocr" => "扫描识别".to_string(),
        "generated" => "变式训练".to_string(),
        _ => "结构化题库".to_string(),
    }
}

fn solution_status_label(value: &str) -> Option<String> {
    match value {
        "generated" => Some("已生成分步思路".to_string()),
        "needs_review" => Some("需教师复核".to_string()),
        "failed" => Some("题解待补全".to_string()),
        "skipped" => Some("保留原解析".to_string()),
        _ => None,
    }
}

fn split_reading_material(
    subject_key: &str,
    prompt: &str,
    metadata: &Value,
) -> (Vec<Value>, String) {
    if let Some(items) = metadata.get("materials").and_then(Value::as_array) {
        let materials: Vec<Value> = items.to_vec();
        if !materials.is_empty() {
            return (materials, prompt.to_string());
        }
    }
    if subject_key != "chinese" || !(prompt.contains("阅读") || prompt.contains("材料")) {
        return (Vec::new(), prompt.to_string());
    }
    let markers = ["\n（1）", "\n(1)", "\n1．", "\n1.", "\n①"];
    let split_at = markers
        .iter()
        .filter_map(|marker| prompt.find(marker))
        .filter(|index| *index > 120)
        .min();
    if let Some(index) = split_at {
        let material = prompt[..index].trim();
        let stem = prompt[index..].trim();
        if material.len() > 80 && stem.len() > 8 {
            return (
                vec![json!({ "title": "阅读材料", "content": material })],
                stem.to_string(),
            );
        }
    }
    (Vec::new(), prompt.to_string())
}

fn rows_to_values(
    rows: Vec<sqlx::postgres::PgRow>,
    keys: &[&str],
) -> Result<Vec<Value>, sqlx::Error> {
    rows.into_iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for key in keys {
                if let Ok(value) = row.try_get::<String, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i32, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i64, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<Value, _>(*key) {
                    map.insert((*key).to_string(), value);
                }
            }
            Ok(Value::Object(map))
        })
        .collect()
}

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

pub(crate) async fn gaokao_rag_summary(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
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
