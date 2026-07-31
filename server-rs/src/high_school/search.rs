use crate::{
    auth_user, json, ApiError, HeaderMap, Json, Query, Row, SharedState, State, StatusCode, Uuid,
    Value,
};
use axum::extract::Path as AxumPath;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, time::Duration};

use super::{MaterialParams, SearchMatch};

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

pub(super) async fn search_matches(
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
    values.truncate((limit * 3) as usize);

    // Apply reranking if configured
    if !values.is_empty() {
        let config = state.ollama_config.read().await.clone();
        if !config.rerank_url.is_empty() {
            if let Ok(reranked) =
                rerank_candidates(&config.rerank_url, &config.rerank_model, q, &values).await
            {
                values = reranked;
            }
        }
    }

    values.truncate(limit as usize);
    Ok(values)
}

#[derive(Serialize)]
struct RerankRequest<'a> {
    model: &'a str,
    query: &'a str,
    texts: Vec<&'a str>,
}

#[derive(Deserialize)]
struct RerankResult {
    index: usize,
    relevance_score: f64,
}

#[derive(Deserialize)]
struct RerankResponse {
    results: Option<Vec<RerankResult>>,
}

async fn rerank_candidates(
    url: &str,
    model: &str,
    query: &str,
    candidates: &[SearchMatch],
) -> Result<Vec<SearchMatch>, anyhow::Error> {
    let texts: Vec<&str> = candidates.iter().map(|c| c.text.as_str()).collect();
    let req = RerankRequest {
        model,
        query,
        texts,
    };
    let client = reqwest::Client::new();
    let res = client
        .post(url)
        .json(&req)
        .send()
        .await?
        .error_for_status()?;
    let data: RerankResponse = res.json().await?;
    let mut results = data.results.unwrap_or_default();
    results.sort_by(|a, b| b.relevance_score.total_cmp(&a.relevance_score));

    let mut ranked = Vec::new();
    for r in results {
        if let Some(c) = candidates.get(r.index) {
            let mut clone = c.clone();
            clone.score = r.relevance_score;
            ranked.push(clone);
        }
    }
    Ok(ranked)
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

#[cfg(test)]
mod tests {
    use super::keyword_patterns;

    #[test]
    fn builds_chinese_keyword_fallbacks_for_natural_questions() {
        let patterns = keyword_patterns("函数的单调性怎么判断");
        assert!(patterns.iter().any(|term| term.contains("函数")));
        assert!(patterns.iter().any(|term| term.contains("单调")));
        assert!(!patterns.is_empty());
    }
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
