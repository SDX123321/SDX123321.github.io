use super::*;
use axum::response::Response;

pub(crate) async fn domains(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let rows=sqlx::query(r#"SELECT d.id,d.domain_key,d.name,d.description,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'key',s.subject_key,'name',s.name) ORDER BY s.name) FROM knowledge_subjects s WHERE s.domain_id=d.id),'[]') subjects,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'key',c.course_key,'name',c.name,'subjectId',c.subject_id,'route',c.route) ORDER BY c.name) FROM knowledge_courses c WHERE c.domain_id=d.id),'[]') courses
      FROM content_domains d WHERE d.active ORDER BY d.sort_order,d.name"#).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"domains":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"key":r.get::<String,_>("domain_key"),"name":r.get::<String,_>("name"),"description":r.get::<String,_>("description"),"subjects":r.get::<Value,_>("subjects"),"courses":r.get::<Value,_>("courses")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn materials(
    Query(p): Query<KnowledgeParams>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let domain = resolve_domain(&state, &p).await?;
    let limit = p.limit.unwrap_or(30).clamp(1, 100);
    let offset = p.cursor.unwrap_or(0).max(0);
    let pattern =
        p.q.as_deref()
            .map(|q| format!("%{}%", q.trim()))
            .unwrap_or_else(|| "%%".into());
    let rows=sqlx::query(r#"SELECT id,file_name,subject,grade,year,kind,size_bytes,rag_status,text_length,metadata,updated_at,COUNT(*) OVER() total
      FROM materials WHERE domain_id=$1 AND ($2::uuid IS NULL OR subject_id=$2) AND (file_name ILIKE $3 OR metadata::text ILIKE $3)
      ORDER BY updated_at DESC LIMIT $4 OFFSET $5"#).bind(domain).bind(p.subject_id).bind(pattern).bind(limit).bind(offset).fetch_all(&state.db).await?;
    let total = rows.first().map(|r| r.get::<i64, _>("total")).unwrap_or(0);
    let items=rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"fileName":r.get::<String,_>("file_name"),"subject":r.get::<String,_>("subject"),"grade":r.get::<String,_>("grade"),"year":r.get::<Option<i32>,_>("year"),"kind":r.get::<String,_>("kind"),"sizeBytes":r.get::<i64,_>("size_bytes"),"ragStatus":r.get::<String,_>("rag_status"),"textLength":r.get::<i32,_>("text_length"),"metadata":r.get::<Value,_>("metadata"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")})).collect::<Vec<_>>();
    Ok(Json(
        json!({"items":items,"pageInfo":{"total":total,"nextCursor":if offset+limit<total{Some(offset+limit)}else{None}}}),
    ))
}

pub(crate) async fn search(
    State(state): State<SharedState>,
    Json(input): Json<SearchInput>,
) -> Result<Json<Value>, ApiError> {
    let q = input.query.trim();
    if q.chars().count() < 2 {
        return Err(ApiError::bad_request());
    }
    let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));
    let rows=sqlx::query(r#"SELECT c.id,c.material_id,c.chunk_index,c.chunk_text,m.file_name,m.subject,m.grade,m.year,
      similarity(c.chunk_text,$3)::float8 score FROM material_chunks c JOIN materials m ON m.id=c.material_id
      WHERE m.domain_id=$1 AND ($2::uuid IS NULL OR m.subject_id=$2) AND (c.chunk_text ILIKE $3 ESCAPE '\' OR m.file_name ILIKE $3 ESCAPE '\')
      ORDER BY score DESC LIMIT $4"#).bind(input.domain_id).bind(input.subject_id).bind(pattern).bind(input.limit.unwrap_or(12).clamp(1,30)).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"query":q,"vectorEnabled":state.vector_enabled,"matches":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"materialId":r.get::<Uuid,_>("material_id"),"chunkIndex":r.get::<i32,_>("chunk_index"),"text":r.get::<String,_>("chunk_text"),"fileName":r.get::<String,_>("file_name"),"subject":r.get::<String,_>("subject"),"grade":r.get::<String,_>("grade"),"year":r.get::<Option<i32>,_>("year"),"score":r.get::<f64,_>("score")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn answer(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<super::high_school::AnswerInput>,
) -> Result<Response, ApiError> {
    if input.domain_id.is_none() {
        return Err(ApiError::bad_request());
    }
    super::high_school::answer(State(state), headers, Json(input)).await
}
