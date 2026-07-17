use super::*;
use async_stream::stream;
use axum::{
    body::{Body, Bytes},
    extract::Path as AxumPath,
    response::Response,
};
use futures_util::StreamExt;
use serde::Deserialize;
use sqlx::{Postgres, QueryBuilder};
use std::{
    collections::HashMap,
    convert::Infallible,
    path::Path,
    time::{Duration, Instant},
};
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
};
use tokio_util::io::ReaderStream;

#[derive(Default)]
pub(crate) struct AnswerRateState {
    recent: HashMap<Uuid, Vec<Instant>>,
}

#[derive(Debug, Deserialize, Serialize, Default)]
pub(crate) struct MaterialParams {
    q: Option<String>,
    grade: Option<String>,
    #[serde(skip)]
    grades: Option<Vec<String>>,
    subject: Option<String>,
    year: Option<i32>,
    region: Option<String>,
    kind: Option<String>,
    cursor: Option<i64>,
    limit: Option<i64>,
    #[serde(rename = "domainId")]
    domain_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnswerInput {
    question: String,
    grade: Option<String>,
    grades: Option<Vec<String>>,
    subject: Option<String>,
    year: Option<i32>,
    region: Option<String>,
    kind: Option<String>,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
    #[serde(rename = "conversationId")]
    conversation_id: Option<Uuid>,
    #[serde(rename = "domainId")]
    pub(crate) domain_id: Option<Uuid>,
}

#[derive(Clone, Serialize)]
pub(crate) struct SearchMatch {
    pub(crate) id: Uuid,
    #[serde(rename = "materialId")]
    pub(crate) material_id: Uuid,
    #[serde(rename = "fileName")]
    pub(crate) file_name: String,
    pub(crate) subject: String,
    pub(crate) grade: String,
    pub(crate) year: Option<i32>,
    region: String,
    kind: String,
    #[serde(rename = "chunkIndex")]
    chunk_index: i32,
    pub(crate) text: String,
    score: f64,
}

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<bool> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS materials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), content_hash TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL, file_ext TEXT NOT NULL, mime_type TEXT NOT NULL,
            size_bytes BIGINT NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT 'other',
            subject TEXT NOT NULL DEFAULT 'other', year INTEGER, region TEXT NOT NULL DEFAULT 'other',
            kind TEXT NOT NULL DEFAULT 'other', downloadable BOOLEAN NOT NULL DEFAULT true,
            rag_status TEXT NOT NULL DEFAULT 'pending', text_length INTEGER NOT NULL DEFAULT 0,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS material_paths (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL UNIQUE, storage_path TEXT, is_canonical BOOLEAN NOT NULL DEFAULT false,
            size_bytes BIGINT NOT NULL, modified_at TIMESTAMPTZ, last_seen_run UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS material_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL, chunk_text TEXT NOT NULL, content_hash TEXT NOT NULL,
            token_estimate INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(material_id, chunk_index))"#,
        r#"CREATE TABLE IF NOT EXISTS material_index_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), status TEXT NOT NULL DEFAULT 'queued',
            source_root TEXT NOT NULL, discovered INTEGER NOT NULL DEFAULT 0, deduplicated INTEGER NOT NULL DEFAULT 0,
            extracted INTEGER NOT NULL DEFAULT 0, embedded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
            remaining INTEGER NOT NULL DEFAULT 0, summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS embedding_generations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL,
            model TEXT NOT NULL, dimensions INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'building',
            total_chunks INTEGER NOT NULL DEFAULT 0, embedded_chunks INTEGER NOT NULL DEFAULT 0, failed_chunks INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT false, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            activated_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_generation_active ON embedding_generations(domain_id) WHERE is_active",
        "ALTER TABLE material_index_runs ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES embedding_generations(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_materials_filters ON materials(subject, grade, year, region, kind)",
        "CREATE INDEX IF NOT EXISTS idx_materials_name_trgm ON materials USING gin (file_name gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_material_chunks_material ON material_chunks(material_id, chunk_index)",
        "CREATE INDEX IF NOT EXISTS idx_material_chunks_text_trgm ON material_chunks USING gin (chunk_text gin_trgm_ops)",
        "ALTER TABLE material_paths ADD COLUMN IF NOT EXISTS storage_path TEXT",
        "UPDATE material_paths p SET storage_path=COALESCE(m.metadata->>'sourceRelativePath',p.relative_path) FROM materials m WHERE p.material_id=m.id AND p.storage_path IS NULL",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }

    let vector_available: bool = sqlx::query_scalar(
        "SELECT to_regtype('vector') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'vector')",
    )
    .fetch_one(db)
    .await
    .unwrap_or(false);
    if vector_available {
        let registered: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector')",
        )
        .fetch_one(db)
        .await
        .unwrap_or(false);
        if registered {
            sqlx::query("CREATE EXTENSION IF NOT EXISTS vector")
                .execute(db)
                .await?;
        }
        sqlx::query("ALTER TABLE material_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024)")
            .execute(db)
            .await?;
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS material_chunk_embeddings (
            generation_id UUID NOT NULL REFERENCES embedding_generations(id) ON DELETE CASCADE,
            chunk_id UUID NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
            embedding vector NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY(generation_id,chunk_id))"#,
        )
        .execute(db)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_generation ON material_chunk_embeddings(generation_id,chunk_id)").execute(db).await?;
        let dimensions: i32 = sqlx::query_scalar(
            "SELECT GREATEST(atttypmod,0) FROM pg_attribute WHERE attrelid='material_chunks'::regclass AND attname='embedding'",
        )
        .fetch_one(db)
        .await?;
        if dimensions <= 2_000 {
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_material_chunks_embedding_hnsw ON material_chunks USING hnsw (embedding vector_cosine_ops)")
                .execute(db).await?;
        }
    }
    Ok(vector_available)
}

fn public_material(row: &sqlx::postgres::PgRow) -> Result<Value, sqlx::Error> {
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "fileName": row.try_get::<String, _>("file_name")?,
        "fileExt": row.try_get::<String, _>("file_ext")?,
        "mimeType": row.try_get::<String, _>("mime_type")?,
        "sizeBytes": row.try_get::<i64, _>("size_bytes")?,
        "grade": row.try_get::<String, _>("grade")?,
        "subject": row.try_get::<String, _>("subject")?,
        "year": row.try_get::<Option<i32>, _>("year")?,
        "region": row.try_get::<String, _>("region")?,
        "kind": row.try_get::<String, _>("kind")?,
        "downloadable": row.try_get::<bool, _>("downloadable")?,
        "ragStatus": row.try_get::<String, _>("rag_status")?,
        "textLength": row.try_get::<i32, _>("text_length")?,
        "metadata": row.try_get::<Value, _>("metadata")?,
        "updatedAt": row.try_get::<DateTime<Utc>, _>("updated_at")?,
    }))
}

pub(crate) async fn overview(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM materials")
        .fetch_one(&state.db)
        .await?;
    let indexed: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM materials WHERE rag_status = 'indexed'")
            .fetch_one(&state.db)
            .await?;
    let chunks: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM material_chunks")
        .fetch_one(&state.db)
        .await?;
    let bytes: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(size_bytes), 0)::bigint FROM materials")
            .fetch_one(&state.db)
            .await?;
    let facets = sqlx::query(
        "SELECT subject, COUNT(*)::int AS count FROM materials GROUP BY subject ORDER BY count DESC, subject LIMIT 20",
    ).fetch_all(&state.db).await?;
    let subjects: Result<Vec<_>, sqlx::Error> = facets
        .into_iter()
        .map(|row| {
            Ok(json!({
                "key": row.try_get::<String,_>("subject")?, "count": row.try_get::<i32,_>("count")?
            }))
        })
        .collect();
    let last_run = sqlx::query("SELECT id, status, discovered, deduplicated, extracted, embedded, failed, remaining, created_at, updated_at FROM material_index_runs ORDER BY created_at DESC LIMIT 1")
        .fetch_optional(&state.db).await?.map(|row| json!({
            "id": row.try_get::<Uuid,_>("id").ok(), "status": row.try_get::<String,_>("status").ok(),
            "discovered": row.try_get::<i32,_>("discovered").ok(), "deduplicated": row.try_get::<i32,_>("deduplicated").ok(),
            "extracted": row.try_get::<i32,_>("extracted").ok(), "embedded": row.try_get::<i32,_>("embedded").ok(),
            "failed": row.try_get::<i32,_>("failed").ok(), "remaining": row.try_get::<i32,_>("remaining").ok(),
            "createdAt": row.try_get::<DateTime<Utc>,_>("created_at").ok(), "updatedAt": row.try_get::<DateTime<Utc>,_>("updated_at").ok()
        }));
    Ok(Json(
        json!({"materials": total, "indexed": indexed, "chunks": chunks, "sizeBytes": bytes,
        "subjects": subjects?, "lastRun": last_run, "vectorEnabled": state.vector_enabled}),
    ))
}

fn bind_filters<'a>(builder: &mut QueryBuilder<'a, Postgres>, params: &'a MaterialParams) {
    if let Some(q) = params.q.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        builder
            .push(" AND (file_name ILIKE ")
            .push_bind(format!("%{q}%"))
            .push(" OR metadata::text ILIKE ")
            .push_bind(format!("%{q}%"))
            .push(")");
    }
    for (column, value) in [
        ("grade", params.grade.as_deref()),
        ("subject", params.subject.as_deref()),
        ("region", params.region.as_deref()),
        ("kind", params.kind.as_deref()),
    ] {
        if let Some(value) = value.filter(|v| !v.is_empty() && *v != "all") {
            builder
                .push(" AND ")
                .push(column)
                .push(" = ")
                .push_bind(value);
        }
    }
    if let Some(year) = params.year {
        builder.push(" AND year = ").push_bind(year);
    }
}

pub(crate) async fn materials(
    Query(params): Query<MaterialParams>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let limit = params.limit.unwrap_or(24).clamp(1, 100);
    let offset = params.cursor.unwrap_or(0).max(0);
    let mut count_builder =
        QueryBuilder::<Postgres>::new("SELECT COUNT(*)::bigint AS count FROM materials WHERE true");
    bind_filters(&mut count_builder, &params);
    let total: i64 = count_builder
        .build_query_scalar()
        .fetch_one(&state.db)
        .await?;
    let mut builder = QueryBuilder::<Postgres>::new("SELECT id,file_name,file_ext,mime_type,size_bytes,grade,subject,year,region,kind,downloadable,rag_status,text_length,metadata,updated_at FROM materials WHERE true");
    bind_filters(&mut builder, &params);
    builder
        .push(" ORDER BY year DESC NULLS LAST, updated_at DESC, file_name LIMIT ")
        .push_bind(limit)
        .push(" OFFSET ")
        .push_bind(offset);
    let rows = builder.build().fetch_all(&state.db).await?;
    let items: Result<Vec<_>, sqlx::Error> = rows.iter().map(public_material).collect();
    let next = (offset + limit < total).then_some(offset + limit);
    Ok(Json(
        json!({"items": items?, "pageInfo": {"total": total, "nextCursor": next}}),
    ))
}

pub(crate) async fn material(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let row = sqlx::query("SELECT id,file_name,file_ext,mime_type,size_bytes,grade,subject,year,region,kind,downloadable,rag_status,text_length,metadata,updated_at FROM materials WHERE id=$1")
        .bind(id).fetch_optional(&state.db).await?.ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "material_not_found"))?;
    let aliases: Vec<String> = sqlx::query_scalar("SELECT relative_path FROM material_paths WHERE material_id=$1 ORDER BY is_canonical DESC, relative_path")
        .bind(id).fetch_all(&state.db).await?;
    let mut value = public_material(&row)?;
    value["aliases"] = json!(aliases);
    Ok(Json(value))
}

async fn embed_query(state: &SharedState, query: &str) -> Option<String> {
    if !state.vector_enabled {
        return None;
    }
    let config = state.ollama_config.read().await.clone();
    let response = state
        .http
        .post(format!(
            "{}/api/embed",
            config.base_url.trim_end_matches('/')
        ))
        .json(&json!({
            "model": config.embedding_model,
            "input": query,
            "dimensions": config.embedding_dimensions
        }))
        .timeout(Duration::from_secs(12))
        .send()
        .await
        .ok()?;
    let value: Value = response.json().await.ok()?;
    let vector = value.get("embeddings")?.as_array()?.first()?.as_array()?;
    if vector.len() != config.embedding_dimensions {
        return None;
    }
    Some(format!(
        "[{}]",
        vector
            .iter()
            .filter_map(Value::as_f64)
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(",")
    ))
}

fn keyword_patterns(query: &str) -> Vec<String> {
    let compact: String = query
        .chars()
        .filter(|c| c.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(c))
        .collect();
    let chars: Vec<char> = compact.chars().collect();
    let mut terms = Vec::new();
    for width in [4usize, 3, 2] {
        if chars.len() < width {
            continue;
        }
        for window in chars.windows(width) {
            let term: String = window.iter().collect();
            if [
                "怎么", "如何", "哪些", "什么", "一下", "请问", "判断", "解释",
            ]
            .iter()
            .any(|stop| term == *stop)
            {
                continue;
            }
            terms.push(format!(
                "%{}%",
                term.replace('%', "\\%").replace('_', "\\_")
            ));
            if terms.len() >= 24 {
                break;
            }
        }
        if terms.len() >= 24 {
            break;
        }
    }
    terms.sort();
    terms.dedup();
    if terms.is_empty() && !compact.is_empty() {
        terms.push(format!("%{compact}%"));
    }
    terms
}

async fn search_matches(
    state: &SharedState,
    params: &MaterialParams,
    limit: i64,
) -> Result<Vec<SearchMatch>, ApiError> {
    let q = params.q.as_deref().unwrap_or_default().trim();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));
    let grade_filters = params.grades.clone().or_else(|| {
        params
            .grade
            .as_deref()
            .filter(|value| *value != "all")
            .map(|value| vec![value.to_string()])
    });
    let patterns = keyword_patterns(q);
    let fallback_a = patterns.first().unwrap_or(&pattern);
    let fallback_b = patterns.get(1).unwrap_or(fallback_a);
    let fallback_c = patterns.get(2).unwrap_or(fallback_b);
    let keyword_query = sqlx::query(r#"WITH candidates AS MATERIALIZED (
        SELECT c.id,c.material_id,m.file_name,m.subject,m.grade,m.year,m.region,m.kind,c.chunk_index,c.chunk_text
        FROM material_chunks c JOIN materials m ON m.id=c.material_id
        WHERE (c.chunk_text ILIKE $1 ESCAPE '\' OR m.file_name ILIKE $1 ESCAPE '\'
               OR c.chunk_text ILIKE $9 ESCAPE '\' OR c.chunk_text ILIKE $10 ESCAPE '\'
               OR c.chunk_text ILIKE $11 ESCAPE '\')
          AND ($2::uuid IS NULL OR m.domain_id=$2)
          AND ($3::text[] IS NULL OR m.grade=ANY($3)) AND ($4::text IS NULL OR m.subject=$4)
          AND ($5::int IS NULL OR m.year=$5) AND ($6::text IS NULL OR m.region=$6) AND ($7::text IS NULL OR m.kind=$7)
        LIMIT $12)
        SELECT c.*,
          CASE WHEN c.chunk_text ILIKE $1 ESCAPE '\' THEN 1.0
               WHEN c.file_name ILIKE $1 ESCAPE '\' THEN 0.9
               ELSE GREATEST(similarity(c.chunk_text,$8),0.35) END::float8 AS score
        FROM candidates c ORDER BY score DESC, similarity(c.chunk_text,$8) DESC LIMIT $13"#)
        .bind(&pattern).bind(params.domain_id).bind(grade_filters.clone()).bind(params.subject.as_deref().filter(|v| *v!="all"))
        .bind(params.year).bind(params.region.as_deref().filter(|v| *v!="all")).bind(params.kind.as_deref().filter(|v| *v!="all"))
        .bind(q).bind(fallback_a).bind(fallback_b).bind(fallback_c).bind(limit * 40).bind(limit * 4);
    let keyword_future = async {
        match tokio::time::timeout(Duration::from_secs(6), keyword_query.fetch_all(&state.db)).await
        {
            Ok(rows) => rows.map_err(ApiError::from),
            Err(_) => Ok(Vec::new()),
        }
    };
    let (keyword_rows, vector) = tokio::join!(keyword_future, embed_query(state, q));
    let keyword_rows = keyword_rows?;
    let mut ranked: HashMap<Uuid, (SearchMatch, f64)> = HashMap::new();
    for (rank, row) in keyword_rows.into_iter().enumerate() {
        let item = row_to_match(&row, row.try_get("score")?)?;
        ranked.insert(item.id, (item, 1.0 / (60.0 + rank as f64)));
    }
    if let Some(vector) = vector {
        let dense_query = sqlx::query(r#"SELECT c.id,c.material_id,m.file_name,m.subject,m.grade,m.year,m.region,m.kind,c.chunk_index,c.chunk_text,
            (1 - (e.embedding <=> $1::vector))::float8 AS score
            FROM material_chunks c JOIN materials m ON m.id=c.material_id
            JOIN embedding_generations g ON g.domain_id=m.domain_id AND g.is_active
            JOIN material_chunk_embeddings e ON e.generation_id=g.id AND e.chunk_id=c.id
            WHERE ($2::uuid IS NULL OR m.domain_id=$2)
              AND ($3::text[] IS NULL OR m.grade=ANY($3)) AND ($4::text IS NULL OR m.subject=$4)
              AND ($5::int IS NULL OR m.year=$5) AND ($6::text IS NULL OR m.region=$6) AND ($7::text IS NULL OR m.kind=$7)
            ORDER BY e.embedding <=> $1::vector LIMIT $8"#)
            .bind(vector).bind(params.domain_id).bind(grade_filters).bind(params.subject.as_deref().filter(|v| *v!="all"))
            .bind(params.year).bind(params.region.as_deref().filter(|v| *v!="all")).bind(params.kind.as_deref().filter(|v| *v!="all")).bind(limit*3);
        let dense_rows =
            match tokio::time::timeout(Duration::from_secs(8), dense_query.fetch_all(&state.db))
                .await
            {
                Ok(rows) => rows?,
                Err(_) => Vec::new(),
            };
        for (rank, row) in dense_rows.into_iter().enumerate() {
            let item = row_to_match(&row, row.try_get("score")?)?;
            ranked
                .entry(item.id)
                .and_modify(|entry| entry.1 += 1.0 / (60.0 + rank as f64))
                .or_insert((item, 1.0 / (60.0 + rank as f64)));
        }
    }
    let mut values: Vec<_> = ranked
        .into_values()
        .map(|(mut item, score)| {
            item.score = score;
            item
        })
        .collect();
    values.sort_by(|a, b| b.score.total_cmp(&a.score));
    // Prefer evidence diversity: do not let one long document occupy the whole context.
    let mut per_material = HashMap::<Uuid, usize>::new();
    values.retain(|item| {
        let count = per_material.entry(item.material_id).or_default();
        if *count >= 2 {
            false
        } else {
            *count += 1;
            true
        }
    });
    values.truncate(limit as usize);
    Ok(values)
}

fn row_to_match(row: &sqlx::postgres::PgRow, score: f64) -> Result<SearchMatch, sqlx::Error> {
    Ok(SearchMatch {
        id: row.try_get("id")?,
        material_id: row.try_get("material_id")?,
        file_name: row.try_get("file_name")?,
        subject: row.try_get("subject")?,
        grade: row.try_get("grade")?,
        year: row.try_get("year")?,
        region: row.try_get("region")?,
        kind: row.try_get("kind")?,
        chunk_index: row.try_get("chunk_index")?,
        text: row.try_get("chunk_text")?,
        score,
    })
}

pub(crate) async fn rag_search(
    Query(mut params): Query<MaterialParams>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    if params.domain_id.is_none() {
        params.domain_id =
            sqlx::query_scalar("SELECT id FROM content_domains WHERE domain_key='high-school'")
                .fetch_optional(&state.db)
                .await?;
    }
    let matches = search_matches(&state, &params, params.limit.unwrap_or(12).clamp(1, 30)).await?;
    Ok(Json(
        json!({"query": params.q.unwrap_or_default(), "matches": matches, "vectorEnabled": state.vector_enabled}),
    ))
}

pub(crate) async fn source_preview(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    auth_user(&state, &headers).await?;
    let row = sqlx::query(
        r#"SELECT c.id,c.chunk_index,c.chunk_text,c.metadata AS chunk_metadata,
           m.id AS material_id,m.file_name,m.file_ext,m.mime_type,m.subject,m.grade,m.year,m.region,m.kind,m.rag_status
           FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE c.id=$1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "source_not_found"))?;
    Ok(Json(json!({"source":{
        "id":row.try_get::<Uuid,_>("id")?,"chunkIndex":row.try_get::<i32,_>("chunk_index")?,
        "text":row.try_get::<String,_>("chunk_text")?,"metadata":row.try_get::<Value,_>("chunk_metadata")?,
        "material":{"id":row.try_get::<Uuid,_>("material_id")?,"fileName":row.try_get::<String,_>("file_name")?,
            "fileExt":row.try_get::<String,_>("file_ext")?,"mimeType":row.try_get::<String,_>("mime_type")?,
            "subject":row.try_get::<String,_>("subject")?,"grade":row.try_get::<String,_>("grade")?,
            "year":row.try_get::<Option<i32>,_>("year")?,"region":row.try_get::<String,_>("region")?,
            "kind":row.try_get::<String,_>("kind")?,"ragStatus":row.try_get::<String,_>("rag_status")?}
    }})))
}

pub(crate) async fn material_preview(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    auth_user(&state, &headers).await?;
    let row = sqlx::query(
        r#"SELECT c.id,c.chunk_index,c.chunk_text,c.metadata AS chunk_metadata,
           m.id AS material_id,m.file_name,m.file_ext,m.mime_type,m.subject,m.grade,m.year,m.region,m.kind,m.rag_status
           FROM materials m LEFT JOIN material_chunks c ON c.material_id=m.id
           WHERE m.id=$1 ORDER BY c.chunk_index NULLS LAST LIMIT 1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "material_not_found"))?;
    let chunk_id: Option<Uuid> = row.try_get("id")?;
    let text: Option<String> = row.try_get("chunk_text")?;
    Ok(Json(json!({"source":{
        "id":chunk_id,"chunkIndex":row.try_get::<Option<i32>,_>("chunk_index")?.unwrap_or(0),
        "text":text.unwrap_or_else(||"该资料尚未生成可预览的文本切片。".to_string()),
        "metadata":row.try_get::<Option<Value>,_>("chunk_metadata")?.unwrap_or_else(||json!({})),
        "material":{"id":row.try_get::<Uuid,_>("material_id")?,"fileName":row.try_get::<String,_>("file_name")?,
            "fileExt":row.try_get::<String,_>("file_ext")?,"mimeType":row.try_get::<String,_>("mime_type")?,
            "subject":row.try_get::<String,_>("subject")?,"grade":row.try_get::<String,_>("grade")?,
            "year":row.try_get::<Option<i32>,_>("year")?,"region":row.try_get::<String,_>("region")?,
            "kind":row.try_get::<String,_>("kind")?,"ragStatus":row.try_get::<String,_>("rag_status")?}
    }})))
}

pub(crate) async fn download(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    auth_user(&state, &headers).await?;
    serve_material_file(&state, id, &headers, false).await
}

pub(crate) async fn file_preview(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    auth_user(&state, &headers).await?;
    serve_material_file(&state, id, &headers, true).await
}

async fn serve_material_file(
    state: &SharedState,
    id: Uuid,
    headers: &HeaderMap,
    inline: bool,
) -> Result<Response, ApiError> {
    let row = sqlx::query(r#"SELECT m.file_name,m.mime_type,COALESCE(p.storage_path,p.relative_path) storage_path FROM materials m JOIN material_paths p ON p.material_id=m.id
        WHERE m.id=$1 ORDER BY p.is_canonical DESC,p.relative_path LIMIT 1"#).bind(id).fetch_optional(&state.db).await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND,"material_not_found"))?;
    let file_name: String = row.try_get("file_name")?;
    let mime: String = row.try_get("mime_type")?;
    let relative: String = row.try_get("storage_path")?;
    let root = state
        .material_root
        .canonicalize()
        .map_err(|_| ApiError::server())?;
    let target = root
        .join(Path::new(&relative))
        .canonicalize()
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "file_missing"))?;
    if !target.starts_with(&root) || !target.is_file() {
        return Err(ApiError::forbidden());
    }
    let mut file = File::open(&target)
        .await
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "file_missing"))?;
    let size = file.metadata().await.map_err(|_| ApiError::server())?.len();
    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| parse_range(v, size));
    let (start, end, status) = range
        .map(|(s, e)| (s, e, StatusCode::PARTIAL_CONTENT))
        .unwrap_or((0, size.saturating_sub(1), StatusCode::OK));
    if start > 0 {
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| ApiError::server())?;
    }
    let length = end.saturating_sub(start) + 1;
    let stream = ReaderStream::new(file.take(length));
    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    let h = response.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    h.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&length.to_string()).unwrap(),
    );
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "{}; filename*=UTF-8''{}",
            if inline { "inline" } else { "attachment" },
            urlencoding::encode(&file_name)
        ))
        .unwrap(),
    );
    h.insert(
        header::HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    if status == StatusCode::PARTIAL_CONTENT {
        h.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{size}")).unwrap(),
        );
    }
    Ok(response)
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let raw = value.strip_prefix("bytes=")?.split(',').next()?;
    let (a, b) = raw.split_once('-')?;
    let start = a.parse::<u64>().ok()?;
    let end = if b.is_empty() {
        size.saturating_sub(1)
    } else {
        b.parse::<u64>().ok()?.min(size.saturating_sub(1))
    };
    (start <= end && start < size).then_some((start, end))
}

fn supports_reasoning_effort(model: &str) -> bool {
    let model = model.to_ascii_lowercase();
    ["gpt-5", "o1", "o3", "o4", "gpt-oss"]
        .iter()
        .any(|prefix| model.starts_with(prefix))
}

fn is_clearly_off_topic(question: &str) -> bool {
    let normalized = question.to_lowercase();
    [
        "天气",
        "股票",
        "基金",
        "比特币",
        "彩票",
        "娱乐新闻",
        "明星八卦",
        "订酒店",
        "订机票",
        "餐厅推荐",
        "外卖",
        "旅游攻略",
        "写代码",
        "编程",
        "javascript",
        "python",
        "java ",
        "游戏攻略",
    ]
    .iter()
    .any(|term| normalized.contains(term))
}

fn push_utf8_chunk(target: &mut String, pending: &mut Vec<u8>, chunk: &[u8]) {
    pending.extend_from_slice(chunk);
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                target.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                if valid > 0 {
                    target.push_str(std::str::from_utf8(&pending[..valid]).unwrap_or_default());
                }
                match error.error_len() {
                    Some(invalid) => {
                        target.push('\u{fffd}');
                        pending.drain(..valid + invalid);
                    }
                    None => {
                        pending.drain(..valid);
                        break;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        is_clearly_off_topic, keyword_patterns, parse_range, push_utf8_chunk,
        supports_reasoning_effort,
    };

    #[test]
    fn parses_bounded_and_open_ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=900-1200", 1000), Some((900, 999)));
    }

    #[test]
    fn rejects_invalid_ranges() {
        assert_eq!(parse_range("items=0-10", 100), None);
        assert_eq!(parse_range("bytes=100-120", 100), None);
        assert_eq!(parse_range("bytes=20-10", 100), None);
    }

    #[test]
    fn builds_chinese_keyword_fallbacks_for_natural_questions() {
        let patterns = keyword_patterns("函数的单调性怎么判断");
        assert!(patterns.iter().any(|term| term.contains("函数")));
        assert!(patterns.iter().any(|term| term.contains("单调")));
        assert!(!patterns.is_empty());
    }

    #[test]
    fn enables_reasoning_effort_only_for_compatible_models() {
        assert!(supports_reasoning_effort("gpt-5.2"));
        assert!(supports_reasoning_effort("o3-mini"));
        assert!(!supports_reasoning_effort("deepseek-chat"));
        assert!(!supports_reasoning_effort("qwen-plus"));
    }

    #[test]
    fn gates_only_confidently_unrelated_queries() {
        assert!(is_clearly_off_topic("帮我推荐今天买哪只股票"));
        assert!(!is_clearly_off_topic("函数的单调性怎么判断"));
        assert!(!is_clearly_off_topic("牛顿第二定律如何应用"));
    }

    #[test]
    fn decodes_utf8_split_across_network_chunks_without_replacement_chars() {
        let bytes = "数学引用[S1]".as_bytes();
        let mut output = String::new();
        let mut pending = Vec::new();
        for chunk in bytes.chunks(2) {
            push_utf8_chunk(&mut output, &mut pending, chunk);
        }
        assert!(pending.is_empty());
        assert_eq!(output, "数学引用[S1]");
        assert!(!output.contains('\u{fffd}'));
    }
}

pub(crate) async fn answer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<AnswerInput>,
) -> Result<Response, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let question = input.question.trim().to_string();
    if question.chars().count() < 2 {
        return Err(ApiError::bad_request());
    }
    let conversation_id = input.conversation_id;
    let conversation_context = if let Some(id) = conversation_id {
        super::learning::conversation_reasoning_context(&state, user.id, id).await?
    } else {
        String::new()
    };
    if let Some(id) = conversation_id {
        super::learning::begin_message(&state, user.id, id, &question).await?;
    }
    if is_clearly_off_topic(&question) {
        let sources: Vec<SearchMatch> = Vec::new();
        let answer = "这个问题与高中学科学习及当前资料库无关，已在调用模型前中断。请改为提问高中课程、解题方法、知识点或资料内容。";
        if let Some(id) = conversation_id {
            super::learning::save_answer(
                &state,
                id,
                answer,
                "completed",
                None,
                "relevance-gate",
                "rules-v1",
                &sources,
            )
            .await?;
        }
        let mut out = Response::new(Body::from(format!(
            "{}\n{}\n{}\n{}\n",
            json!({"type":"sources","sources":sources,"answerMode":"blocked","warning":"问题与高中学科资料无关，未调用模型。","reasoningLevel":"advanced"}),
            json!({"type":"gate","status":"blocked","reason":"off_topic"}),
            json!({"type":"delta","text":answer}),
            json!({"type":"done","answerMode":"blocked","warning":"问题与高中学科资料无关，未调用模型。","reasoningLevel":"advanced"})
        )));
        out.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
        );
        out.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return Ok(out);
    }
    {
        let mut rate = state.answer_rate.lock().map_err(|_| ApiError::server())?;
        let now = Instant::now();
        let recent = rate.recent.entry(user.id).or_default();
        recent.retain(|t| now.duration_since(*t) < Duration::from_secs(60));
        if recent.len() >= 30 {
            return Err(ApiError::new(
                StatusCode::TOO_MANY_REQUESTS,
                "answer_rate_limited",
            ));
        }
        recent.push(now);
    }
    let domain_id = match input.domain_id {
        Some(id) => Some(id),
        None => {
            sqlx::query_scalar("SELECT id FROM content_domains WHERE domain_key='high-school'")
                .fetch_optional(&state.db)
                .await?
        }
    };
    let mut selected_grades = input.grades.unwrap_or_else(|| {
        input
            .grade
            .filter(|grade| grade != "all")
            .into_iter()
            .collect()
    });
    selected_grades.retain(|grade| matches!(grade.as_str(), "grade-1" | "grade-2" | "grade-3"));
    selected_grades.sort();
    selected_grades.dedup();
    let selected_subject = input.subject.filter(|subject| subject != "all");
    let params = MaterialParams {
        q: Some(question.clone()),
        grade: None,
        grades: (!selected_grades.is_empty()).then_some(selected_grades.clone()),
        subject: selected_subject.clone(),
        year: input.year,
        region: input.region,
        kind: input.kind,
        domain_id,
        ..Default::default()
    };
    let sources = match search_matches(&state, &params, 8).await {
        Ok(value) => value,
        Err(error) => {
            return Err(error);
        }
    };
    let answer_mode = if sources.is_empty() {
        "general"
    } else if sources.len() < 4 {
        "hybrid"
    } else {
        "grounded"
    };
    let warning = match answer_mode {
        "general" => Some("未从资料库检索到直接依据，以下为模型通识补充，请核对教材。"),
        "hybrid" => Some("资料依据有限，回答可能包含明确标记的模型通识补充。"),
        _ => None,
    };
    let context = sources
        .iter()
        .enumerate()
        .map(|(i, s)| format!("[S{}] {}\n{}", i + 1, s.file_name, s.text))
        .collect::<Vec<_>>()
        .join("\n\n");
    let answer_policy = if sources.is_empty() {
        "资料为空。请使用可靠的高中通识作答，并以“通识补充（无资料引用）”开头；不得使用 [S1] 等虚假引用。"
    } else {
        "优先依据资料回答并使用 [S1] 形式标注来源。资料未覆盖的必要补充必须放在“通识补充”小节，且不得添加虚假引用。"
    };
    let advanced_reasoning_policy = format!(
        "你是高中学习助教，采用进阶思考等级。{answer_policy}\
         用户在界面选择的年级与学科是强约束：回答深度、术语和例题必须适配该范围，不得擅自切换学科。\
         回答前应综合当前问题、已有对话结论和全部 RAG 资料，交叉核验不同来源，识别适用条件、隐含假设、矛盾与证据边界。\
         对数学问题优先给出结论、关键依据、推导摘要、方法迁移与易错边界；不得只复述资料。\
         内部可以充分推理，但只输出对学习者有用且可核验的推理摘要，不输出隐藏思维链。\
         不为追求篇幅而截断答案，完成必要推导后再结束。回答使用结构清晰的简体中文。"
    );
    let grade_scope = if selected_grades.is_empty() {
        "全部高中年级".to_string()
    } else {
        selected_grades
            .iter()
            .map(|grade| match grade.as_str() {
                "grade-1" => "高一",
                "grade-2" => "高二",
                "grade-3" => "高三",
                _ => grade,
            })
            .collect::<Vec<_>>()
            .join("、")
    };
    let subject_scope = match selected_subject.as_deref() {
        Some("chinese") => "语文",
        Some("math") => "数学",
        Some("english") => "英语",
        Some("physics") => "物理",
        Some("chemistry") => "化学",
        Some("biology") => "生物",
        Some("politics") => "政治",
        Some("history") => "历史",
        Some("geography") => "地理",
        Some(value) => value,
        None => "全部学科",
    };
    let user_prompt = format!(
        "用户选择范围：年级={grade_scope}；学科={subject_scope}。该范围已用于 RAG 检索，请严格按此范围组织回答。\n\n当前问题：{question}\n\n已有对话结果：\n{}\n\nRAG 资料：\n{}",
        if conversation_context.is_empty() {
            "（无）"
        } else {
            &conversation_context
        },
        if context.is_empty() {
            "（无）"
        } else {
            &context
        }
    );
    let answer_slot = tokio::time::timeout(
        Duration::from_secs(15),
        state.answer_slots.clone().acquire_owned(),
    )
    .await
    .map_err(|_| ApiError::new(StatusCode::TOO_MANY_REQUESTS, "answer_capacity_reached"))?
    .map_err(|_| ApiError::server())?;
    let source_event = json!({"type":"sources","sources":sources,"answerMode":answer_mode,"warning":warning,"reasoningLevel":"advanced"});
    let stream_answer_mode = answer_mode.to_string();
    let stream_warning = warning.map(str::to_string);
    let remote_provider =
        super::admin::preferred_provider_runtime(&state, user.id, input.provider_config_id).await?;
    if let Some(config) = remote_provider {
        let mut request_payload = json!({"model":config.model.clone(),"stream":true,"stream_options":{"include_usage":true},"temperature":0.15,
            "messages":[{"role":"system","content":advanced_reasoning_policy},{"role":"user","content":user_prompt.clone()}]});
        if supports_reasoning_effort(&config.model) {
            request_payload["reasoning_effort"] = json!("high");
        }
        let stream_state = state.clone();
        let save_sources = sources.clone();
        let input_chars = user_prompt.chars().count();
        let user_id = user.id;
        let body_stream = stream! {
            let _answer_slot = answer_slot;
            yield Ok::<Bytes,Infallible>(Bytes::from(format!("{}\n", source_event)));
            let started = Instant::now();
            let response = stream_state.http.post(format!("{}/chat/completions", config.base_url.trim_end_matches('/')))
                .bearer_auth(&config.api_key).json(&request_payload).send().await;
            let Ok(response) = response else {
                yield Ok(Bytes::from(format!("{}\n", json!({"type":"error","error":"model_unavailable"}))));
                if let Some(id)=conversation_id { let _=super::learning::save_answer(&stream_state,id,"","failed",Some("model_unavailable"),&config.provider,&config.model,&save_sources).await; }
                return;
            };
            if !response.status().is_success() {
                yield Ok(Bytes::from(format!("{}\n", json!({"type":"error","error":"model_unavailable"}))));
                if let Some(id)=conversation_id { let _=super::learning::save_answer(&stream_state,id,"","failed",Some("model_unavailable"),&config.provider,&config.model,&save_sources).await; }
                return;
            }
            let mut bytes=response.bytes_stream();
            let mut buffer=String::new();
            let mut utf8_pending=Vec::new();
            let mut complete_answer=String::new();
            let mut reasoning_chars=0usize;
            let mut ttft_ms=None;
            let mut input_tokens=0usize;
            let mut output_tokens=0usize;
            let mut stream_failed=false;
            while let Some(next)=bytes.next().await {
                match next {
                    Ok(chunk) => {
                        push_utf8_chunk(&mut buffer,&mut utf8_pending,&chunk);
                        while let Some(pos)=buffer.find('\n') {
                            let line=buffer[..pos].trim().to_string(); buffer.drain(..=pos);
                            let Some(data)=line.strip_prefix("data:").map(str::trim) else { continue };
                            if data.is_empty() || data == "[DONE]" { continue; }
                            let Ok(value)=serde_json::from_str::<Value>(data) else { continue };
                            if let Some(usage)=value.get("usage") {
                                input_tokens=usage.get("prompt_tokens").and_then(Value::as_u64).unwrap_or(input_tokens as u64) as usize;
                                output_tokens=usage.get("completion_tokens").and_then(Value::as_u64).unwrap_or(output_tokens as u64) as usize;
                            }
                            let reasoning=value.pointer("/choices/0/delta/reasoning_content").or_else(||value.pointer("/choices/0/delta/reasoning")).and_then(Value::as_str).unwrap_or_default();
                            if !reasoning.is_empty() {
                                ttft_ms.get_or_insert_with(||started.elapsed().as_millis());
                                reasoning_chars+=reasoning.chars().count();
                                yield Ok(Bytes::from(format!("{}\n",json!({"type":"reasoning","status":"thinking","text":reasoning,"processedChars":reasoning_chars}))));
                            }
                            let content=value.pointer("/choices/0/delta/content").and_then(Value::as_str).unwrap_or_default();
                            if !content.is_empty() {
                                ttft_ms.get_or_insert_with(||started.elapsed().as_millis());
                                complete_answer.push_str(content);
                                yield Ok(Bytes::from(format!("{}\n",json!({"type":"delta","text":content}))));
                            }
                        }
                    }
                    Err(_) => { stream_failed=true; yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_stream_failed"})))); break; }
                }
            }
            let output_chars=complete_answer.chars().count();
            if input_tokens==0 { input_tokens=(input_chars+2)/3; }
            if output_tokens==0 { output_tokens=(output_chars+2)/3; }
            let duration_ms=started.elapsed().as_millis();
            yield Ok(Bytes::from(format!("{}\n",json!({"type":"metrics","inputTokens":input_tokens,"outputTokens":output_tokens,"totalTokens":input_tokens+output_tokens,"ttftMs":ttft_ms,"durationMs":duration_ms}))));
            yield Ok(Bytes::from(format!("{}\n",json!({"type":"done","answerMode":stream_answer_mode,"warning":stream_warning,"reasoningLevel":"advanced"}))));
            super::admin::record_ai_metrics(&stream_state,user_id,&config.provider,&config.model,input_chars,output_chars,input_tokens,output_tokens,ttft_ms,duration_ms,if stream_failed{"failed"}else{"completed"}).await;
            if let Some(id)=conversation_id { let _=super::learning::save_answer(&stream_state,id,&complete_answer,if stream_failed{"failed"}else{"completed"},if stream_failed{Some("model_stream_failed")}else{None},&config.provider,&config.model,&save_sources).await; }
        };
        let mut out = Response::new(Body::from_stream(body_stream));
        out.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
        );
        out.headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        return Ok(out);
    }
    let ollama = state.ollama_config.read().await.clone();
    let payload = json!({"model":ollama.chat_model,"stream":true,"think":true,"options":{"temperature":0.15},"messages":[{"role":"system","content":advanced_reasoning_policy},{"role":"user","content":user_prompt} ]});
    let save_state = state.clone();
    let save_sources = sources.clone();
    let save_model = ollama.chat_model.clone();
    let input_chars = question.chars().count() + context.chars().count();
    let user_id = user.id;
    let body_stream = stream! {
        let _answer_slot=answer_slot;
        yield Ok::<Bytes,Infallible>(Bytes::from(format!("{}\n",source_event)));
        let started=Instant::now();
        let response=save_state.http.post(format!("{}/api/chat",ollama.base_url.trim_end_matches('/'))).json(&payload).send().await;
        let Ok(response)=response else { yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_unavailable"})))); return; };
        if !response.status().is_success() { yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_unavailable"})))); return; }
        let mut bytes=response.bytes_stream(); let mut buffer=String::new(); let mut utf8_pending=Vec::new(); let mut complete_answer=String::new(); let mut stream_failed=false; let mut reasoning_chars=0usize; let mut ttft_ms=None; let mut input_tokens=0usize; let mut output_tokens=0usize;
        while let Some(next)=bytes.next().await { match next { Ok(chunk)=>{ push_utf8_chunk(&mut buffer,&mut utf8_pending,&chunk); while let Some(pos)=buffer.find('\n') { let line=buffer[..pos].trim().to_string(); buffer.drain(..=pos); if line.is_empty(){continue} if let Ok(v)=serde_json::from_str::<Value>(&line) { if let Some(thinking)=v.pointer("/message/thinking").and_then(Value::as_str) { if !thinking.is_empty(){ ttft_ms.get_or_insert_with(||started.elapsed().as_millis()); reasoning_chars+=thinking.chars().count(); yield Ok(Bytes::from(format!("{}\n",json!({"type":"reasoning","status":"thinking","text":thinking,"processedChars":reasoning_chars})))); } } if let Some(content)=v.pointer("/message/content").and_then(Value::as_str) { if !content.is_empty(){ ttft_ms.get_or_insert_with(||started.elapsed().as_millis()); complete_answer.push_str(content); yield Ok(Bytes::from(format!("{}\n",json!({"type":"delta","text":content})))); } } if v.get("done").and_then(Value::as_bool)==Some(true) { input_tokens=v.get("prompt_eval_count").and_then(Value::as_u64).unwrap_or(0) as usize; output_tokens=v.get("eval_count").and_then(Value::as_u64).unwrap_or(0) as usize; } } } }, Err(_)=>{stream_failed=true; yield Ok(Bytes::from(format!("{}\n",json!({"type":"error","error":"model_stream_failed"})))); break} } }
        let output_chars=complete_answer.chars().count(); if input_tokens==0 {input_tokens=(input_chars+2)/3;} if output_tokens==0 {output_tokens=(output_chars+2)/3;} let duration_ms=started.elapsed().as_millis();
        yield Ok(Bytes::from(format!("{}\n",json!({"type":"metrics","inputTokens":input_tokens,"outputTokens":output_tokens,"totalTokens":input_tokens+output_tokens,"ttftMs":ttft_ms,"durationMs":duration_ms}))));
        yield Ok(Bytes::from(format!("{}\n",json!({"type":"done","answerMode":stream_answer_mode,"warning":stream_warning,"reasoningLevel":"advanced"}))));
        super::admin::record_ai_metrics(&save_state,user_id,"ollama",&save_model,input_chars,output_chars,input_tokens,output_tokens,ttft_ms,duration_ms,if stream_failed{"failed"}else{"completed"}).await;
        if let Some(id)=conversation_id { let _=super::learning::save_answer(&save_state,id,&complete_answer,if stream_failed{"failed"}else{"completed"},if stream_failed{Some("model_stream_failed")}else{None},"ollama",&save_model,&save_sources).await; }
    };
    let mut out = Response::new(Body::from_stream(body_stream));
    out.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
    );
    out.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(out)
}

#[allow(dead_code)]
fn ndjson_once(value: Value) -> Response {
    let mut r = Response::new(Body::from(format!("{}\n", value)));
    r.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-ndjson; charset=utf-8"),
    );
    r
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

#[derive(Deserialize)]
pub(crate) struct IndexRunInput {
    rebuild: Option<bool>,
    #[serde(rename = "missingOnly")]
    missing_only: Option<bool>,
    domain: Option<String>,
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
