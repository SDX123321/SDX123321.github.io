use super::*;
use crate::admin::require_admin;
use axum::extract::Path as AxumPath;

pub(crate) async fn start_web_research(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<WebResearchInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    require_admin(&state, &headers).await?;
    let run: Uuid = sqlx::query_scalar(
        "INSERT INTO web_research_runs(domain_id,subject) VALUES($1,$2) RETURNING id",
    )
    .bind(input.domain_id)
    .bind(&input.subject)
    .fetch_one(&state.db)
    .await?;
    let mut command = tokio::process::Command::new("node");
    let config = state.ollama_config.read().await.clone();
    command
        .current_dir(&state.project_root)
        .arg("scripts/web-knowledge-research.mjs")
        .arg("--run-id")
        .arg(run.to_string())
        .arg("--domain-id")
        .arg(input.domain_id.to_string())
        .arg("--subject")
        .arg(&input.subject)
        .env("OLLAMA_URL", config.base_url)
        .env("CHAT_MODEL", config.chat_model)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped());
    let child = command.spawn().map_err(|_| ApiError::server())?;
    let db = state.db.clone();
    tokio::spawn(async move {
        match child.wait_with_output().await {
            Ok(out) if out.status.success() => {}
            result => {
                let error = match result {
                    Ok(out) => String::from_utf8_lossy(&out.stderr)
                        .chars()
                        .take(2000)
                        .collect(),
                    Err(e) => e.to_string(),
                };
                let _=sqlx::query("UPDATE web_research_runs SET status='failed',error=$2,updated_at=now() WHERE id=$1").bind(run).bind(error).execute(&db).await;
            }
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"runId":run,"status":"queued"})),
    ))
}

pub(crate) async fn web_research_run(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let r = sqlx::query("SELECT * FROM web_research_runs WHERE id=$1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "run_not_found"))?;
    Ok(Json(
        json!({"id":r.get::<Uuid,_>("id"),"status":r.get::<String,_>("status"),"progress":r.get::<i32,_>("progress"),"queryCount":r.get::<i32,_>("query_count"),"visitedCount":r.get::<i32,_>("visited_count"),"evidenceCount":r.get::<i32,_>("evidence_count"),"error":r.get::<Option<String>,_>("error"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")}),
    ))
}

pub(crate) async fn web_evidence(
    Query(p): Query<KnowledgeParams>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let domain = resolve_domain(&state, &p).await?;
    let rows=sqlx::query("SELECT id,url,title,host,excerpt,concept,relation,target_concept,confidence,status,fetched_at FROM web_knowledge_evidence WHERE domain_id=$1 ORDER BY confidence DESC,fetched_at DESC LIMIT 200").bind(domain).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"evidence":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"url":r.get::<String,_>("url"),"title":r.get::<String,_>("title"),"host":r.get::<String,_>("host"),"excerpt":r.get::<String,_>("excerpt"),"concept":r.get::<Option<String>,_>("concept"),"relation":r.get::<Option<String>,_>("relation"),"targetConcept":r.get::<Option<String>,_>("target_concept"),"confidence":r.get::<f64,_>("confidence"),"status":r.get::<String,_>("status"),"fetchedAt":r.get::<DateTime<Utc>,_>("fetched_at")})).collect::<Vec<_>>() }),
    ))
}
