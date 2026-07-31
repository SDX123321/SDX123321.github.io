use crate::{
    json, ApiError, DateTime, Json, Query, Row, SharedState, State, StatusCode, Utc, Uuid, Value,
};
use axum::extract::Path as AxumPath;
use sqlx::{Postgres, QueryBuilder};

use super::MaterialParams;

pub(crate) fn public_material(row: &sqlx::postgres::PgRow) -> Result<Value, sqlx::Error> {
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
