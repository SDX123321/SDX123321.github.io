use super::*;
use axum::extract::Path as AxumPath;

pub(crate) async fn start_graph(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<GraphInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = auth_user(&state, &headers).await?;
    let allowed = [
        "chinese",
        "math",
        "english",
        "physics",
        "chemistry",
        "biology",
        "politics",
        "history",
        "geography",
    ];
    if !allowed.contains(&input.subject.as_str()) {
        return Err(ApiError::bad_request());
    }
    let running:i64=sqlx::query_scalar("SELECT COUNT(*) FROM knowledge_graph_generation_runs WHERE user_id=$1 AND subject=$2 AND status IN ('queued','running')").bind(u.id).bind(&input.subject).fetch_one(&state.db).await?;
    if running > 0 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "graph_generation_running",
        ));
    }
    let id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graph_generation_runs(user_id,subject,provider_config_id) VALUES($1,$2,$3) RETURNING id").bind(u.id).bind(&input.subject).bind(input.provider_config_id).fetch_one(&state.db).await?;
    let bg = state.clone();
    tokio::spawn(async move {
        if let Err(e) = generate_graph(&bg, id, u.id, &input.subject).await {
            eprintln!("knowledge graph generation failed: {e:?}");
            let _=sqlx::query("UPDATE knowledge_graph_generation_runs SET status='failed',error='generation_failed',updated_at=now() WHERE id=$1").bind(id).execute(&bg.db).await;
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"runId":id,"status":"queued"})),
    ))
}

async fn generate_graph(
    state: &SharedState,
    run_id: Uuid,
    user_id: Uuid,
    subject: &str,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE knowledge_graph_generation_runs SET status='running',progress=10,updated_at=now() WHERE id=$1").bind(run_id).execute(&state.db).await?;
    let rows=sqlx::query("SELECT c.id chunk_id,c.material_id,c.chunk_text,m.file_name,c.chunk_index FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE m.subject=$1 AND length(trim(c.chunk_text))>=20 ORDER BY m.file_name,c.chunk_index LIMIT 240").bind(subject).fetch_all(&state.db).await?;
    let seed = seeded_graph(subject).transpose()?;
    if rows.len() < 3 && seed.is_none() {
        sqlx::query("UPDATE knowledge_graph_generation_runs SET status='failed',error='insufficient_sources',updated_at=now() WHERE id=$1").bind(run_id).execute(&state.db).await?;
        return Ok(());
    }
    let version: i32 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(version),0)+1 FROM knowledge_graphs WHERE user_id=$1 AND subject=$2",
    )
    .bind(user_id)
    .bind(subject)
    .fetch_one(&state.db)
    .await?;
    let mut tx = state.db.begin().await?;
    let source_revision = seed.as_ref().map(|value| value.revision.as_str());
    let source_metadata = seed
        .as_ref()
        .map(|value| json!(value.sources))
        .unwrap_or_else(|| json!([]));
    let graph_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graphs(user_id,subject,version,status,source_revision,source_metadata) VALUES($1,$2,$3,'building',$4,$5) RETURNING id").bind(user_id).bind(subject).bind(version).bind(source_revision).bind(source_metadata).fetch_one(&mut*tx).await?;
    let mut node_count = 0;
    let mut edge_count = 0;
    let mut concept_keys = std::collections::HashMap::<String, String>::new();
    if let Some(seed) = seed.as_ref() {
        for module in &seed.modules {
            let module_key = format!("{}-module-{}", subject, module.key);
            let source = seed
                .sources
                .iter()
                .find(|source| source.key == module.source_key)
                .or_else(|| seed.sources.first());
            let source_title = source
                .map(|value| value.title.as_str())
                .unwrap_or("学科结构化资料");
            let module_description = format!(
                "{}模块总览，依据《{}》{}整理。",
                module.name,
                source_title,
                if module.locator.is_empty() {
                    ""
                } else {
                    module.locator.as_str()
                }
            );
            let module_node_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graph_nodes(graph_id,node_key,label,chapter,description,methods,mistakes,question_types,formulas,source_pages,source_locator,difficulty,importance) VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10,'basic',1.0) RETURNING id")
                .bind(graph_id).bind(&module_key).bind(&module.name).bind(&module_description)
                .bind(json!([module.method])).bind(json!([module.mistake])).bind(json!([module.question_type]))
                .bind(json!([module.formula])).bind((!module.pages.is_empty()).then_some(&module.pages)).bind(&module.locator).fetch_one(&mut *tx).await?;
            sqlx::query("INSERT INTO knowledge_graph_node_sources(node_id,material_id,chunk_id,file_name,excerpt,source_locator,source_url) VALUES($1,NULL,NULL,$2,$3,$4,$5)")
                .bind(module_node_id).bind(source_title).bind(&module_description).bind(&module.locator)
                .bind(source.and_then(|value| value.url.as_deref())).execute(&mut *tx).await?;
            concept_keys.insert(module.name.clone(), module_key.clone());
            node_count += 1;
            let mut previous_math_key: Option<String> = None;
            for (idx, label) in module.concepts.iter().enumerate() {
                let key = format!("{}-{}-{}", subject, module.key, idx + 1);
                let description = format!(
                    "{}是{}模块的核心知识点。需要掌握其概念、适用条件、典型方法与常见误区。",
                    label, module.name,
                );
                let ratio = idx as f64 / module.concepts.len().max(1) as f64;
                let difficulty = if ratio < 0.34 {
                    "basic"
                } else if ratio > 0.76 {
                    "advanced"
                } else {
                    "intermediate"
                };
                let importance = 0.62 + (1.0 - (ratio - 0.5).abs()) * 0.28;
                let node_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graph_nodes(graph_id,node_key,label,chapter,description,methods,mistakes,question_types,formulas,source_pages,source_locator,difficulty,importance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id")
                    .bind(graph_id).bind(&key).bind(label).bind(&module.name).bind(description)
                    .bind(json!([module.method])).bind(json!([module.mistake])).bind(json!([module.question_type]))
                    .bind(json!([module.formula])).bind((!module.pages.is_empty()).then_some(&module.pages)).bind(&module.locator).bind(difficulty).bind(importance).fetch_one(&mut *tx).await?;
                sqlx::query("INSERT INTO knowledge_graph_node_sources(node_id,material_id,chunk_id,file_name,excerpt,source_locator,source_url) VALUES($1,NULL,NULL,$2,$3,$4,$5)")
                    .bind(node_id).bind(source_title).bind(format!("{}：{}", label, module.method)).bind(&module.locator)
                    .bind(source.and_then(|value| value.url.as_deref())).execute(&mut *tx).await?;
                sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,'part_of')")
                    .bind(graph_id).bind(&key).bind(&module_key).execute(&mut *tx).await?;
                edge_count += 1;
                if subject == "math" {
                    if let Some(previous) = previous_math_key.replace(key.clone()) {
                        sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,'prerequisite')")
                            .bind(graph_id).bind(previous).bind(&key).execute(&mut *tx).await?;
                        edge_count += 1;
                    }
                }
                concept_keys.insert(label.clone(), key);
                node_count += 1;
            }
        }
        for (source_label, target_label, relation) in &seed.cross_links {
            let (Some(source), Some(target)) = (
                concept_keys.get(source_label),
                concept_keys.get(target_label),
            ) else {
                continue;
            };
            sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,$4)")
                .bind(graph_id).bind(source).bind(target).bind(relation).execute(&mut *tx).await?;
            edge_count += 1;
        }
    } else {
        let mut previous: Option<String> = None;
        for (idx, r) in rows.iter().step_by(4).take(48).enumerate() {
            let text = r.get::<String, _>("chunk_text");
            let file = r.get::<String, _>("file_name");
            let label = text
                .lines()
                .map(str::trim)
                .find(|s| s.chars().count() >= 4)
                .unwrap_or(&file)
                .chars()
                .take(28)
                .collect::<String>();
            let key = format!("{}-{}", subject, idx + 1);
            let description = text.chars().take(260).collect::<String>();
            let node_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graph_nodes(graph_id,node_key,label,chapter,description) VALUES($1,$2,$3,$4,$5) RETURNING id").bind(graph_id).bind(&key).bind(label).bind(&file).bind(&description).fetch_one(&mut*tx).await?;
            sqlx::query("INSERT INTO knowledge_graph_node_sources(node_id,material_id,chunk_id,file_name,excerpt) VALUES($1,$2,$3,$4,$5)").bind(node_id).bind(r.get::<Uuid,_>("material_id")).bind(r.get::<Uuid,_>("chunk_id")).bind(&file).bind(&description).execute(&mut*tx).await?;
            if let Some(prev) = previous {
                sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,'related')").bind(graph_id).bind(prev).bind(&key).execute(&mut*tx).await?;
                edge_count += 1
            }
            previous = Some(key);
            node_count += 1
        }
    }
    sqlx::query("UPDATE knowledge_graphs SET is_current=false WHERE user_id=$1 AND subject=$2")
        .bind(user_id)
        .bind(subject)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE knowledge_graphs SET status='ready',is_current=true,node_count=$2,edge_count=$3 WHERE id=$1").bind(graph_id).bind(node_count).bind(edge_count).execute(&mut*tx).await?;
    sqlx::query("UPDATE knowledge_graph_generation_runs SET status='completed',progress=100,graph_id=$2,updated_at=now() WHERE id=$1").bind(run_id).bind(graph_id).execute(&mut*tx).await?;
    tx.commit().await?;
    Ok(())
}

pub(crate) fn migrate_seeded_graphs(state: SharedState) {
    tokio::spawn(async move {
        for subject in ["math", "chinese", "english"] {
            let Some(Ok(seed)) = seeded_graph(subject) else {
                continue;
            };
            let stale_users = sqlx::query_scalar::<_, Uuid>(
                "SELECT DISTINCT user_id FROM knowledge_graphs WHERE subject=$1 AND is_current AND source_revision IS DISTINCT FROM $2",
            )
            .bind(subject)
            .bind(&seed.revision)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();
            for user_id in stale_users {
                let running: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM knowledge_graph_generation_runs WHERE user_id=$1 AND subject=$2 AND status IN ('queued','running')")
                    .bind(user_id).bind(subject).fetch_one(&state.db).await.unwrap_or(0);
                if running == 0 {
                    if let Ok(run_id) = sqlx::query_scalar::<_, Uuid>("INSERT INTO knowledge_graph_generation_runs(user_id,subject) VALUES($1,$2) RETURNING id")
                        .bind(user_id).bind(subject).fetch_one(&state.db).await {
                        if let Err(error) = generate_graph(&state, run_id, user_id, subject).await {
                            eprintln!("{subject} graph revision migration failed: {error:?}");
                            let _ = sqlx::query("UPDATE knowledge_graph_generation_runs SET status='failed',error='migration_failed',updated_at=now() WHERE id=$1")
                                .bind(run_id).execute(&state.db).await;
                        }
                    }
                }
            }
        }
        let users = sqlx::query_scalar::<_, Uuid>(
            r#"SELECT DISTINCT g.user_id
               FROM knowledge_graphs g
               JOIN knowledge_graph_nodes n ON n.graph_id=g.id
               WHERE g.subject='math' AND g.is_current
                 AND n.label ~ '(学年|试题|阶段测试|月考|真题及答案)'"#,
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
        for user_id in users {
            let running: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM knowledge_graph_generation_runs WHERE user_id=$1 AND subject='math' AND status IN ('queued','running')",
            )
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
            if running > 0 {
                continue;
            }
            let run_id = match sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO knowledge_graph_generation_runs(user_id,subject) VALUES($1,'math') RETURNING id",
            )
            .bind(user_id)
            .fetch_one(&state.db)
            .await
            {
                Ok(id) => id,
                Err(error) => {
                    eprintln!("failed to queue legacy math graph migration: {error:?}");
                    continue;
                }
            };
            if let Err(error) = generate_graph(&state, run_id, user_id, "math").await {
                eprintln!("legacy math graph migration failed: {error:?}");
                let _ = sqlx::query("UPDATE knowledge_graph_generation_runs SET status='failed',error='migration_failed',updated_at=now() WHERE id=$1")
                    .bind(run_id)
                    .execute(&state.db)
                    .await;
            }
        }
    });
}

pub(crate) async fn graph_run(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let r=sqlx::query("SELECT id,subject,status,progress,graph_id,error,created_at,updated_at FROM knowledge_graph_generation_runs WHERE id=$1 AND user_id=$2").bind(id).bind(u.id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"graph_run_not_found"))?;
    Ok(Json(
        json!({"id":r.get::<Uuid,_>("id"),"subject":r.get::<String,_>("subject"),"status":r.get::<String,_>("status"),"progress":r.get::<i32,_>("progress"),"graphId":r.get::<Option<Uuid>,_>("graph_id"),"error":r.get::<Option<String>,_>("error"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")}),
    ))
}

pub(crate) async fn graphs(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Query(params): Query<GraphParams>,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let rows=sqlx::query("SELECT id,subject,version,status,is_current,node_count,edge_count,source_revision,created_at FROM knowledge_graphs WHERE user_id=$1 AND ($2::text IS NULL OR subject=$2) ORDER BY created_at DESC").bind(u.id).bind(params.subject).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"graphs":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"subject":r.get::<String,_>("subject"),"version":r.get::<i32,_>("version"),"status":r.get::<String,_>("status"),"isCurrent":r.get::<bool,_>("is_current"),"nodeCount":r.get::<i32,_>("node_count"),"edgeCount":r.get::<i32,_>("edge_count"),"sourceRevision":r.get::<Option<String>,_>("source_revision"),"createdAt":r.get::<DateTime<Utc>,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn graph(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let g=sqlx::query("SELECT id,subject,version,is_current,source_revision,source_metadata FROM knowledge_graphs WHERE id=$1 AND user_id=$2 AND status='ready'").bind(id).bind(u.id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"graph_not_found"))?;
    let nodes=sqlx::query("SELECT id,node_key,label,chapter,description,methods,mistakes,question_types,formulas,source_pages,source_locator,difficulty,importance FROM knowledge_graph_nodes WHERE graph_id=$1 ORDER BY chapter,label").bind(id).fetch_all(&state.db).await?;
    let edges = sqlx::query(
        "SELECT source_key,target_key,relation FROM knowledge_graph_edges WHERE graph_id=$1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let mut out = Vec::new();
    for n in nodes {
        let nid = n.get::<Uuid, _>("id");
        let sources=sqlx::query("SELECT material_id,chunk_id,file_name,excerpt,source_locator,source_url FROM knowledge_graph_node_sources WHERE node_id=$1").bind(nid).fetch_all(&state.db).await?;
        out.push(json!({"id":nid,"key":n.get::<String,_>("node_key"),"label":n.get::<String,_>("label"),"chapter":n.get::<String,_>("chapter"),"description":n.get::<String,_>("description"),"methods":n.get::<Value,_>("methods"),"mistakes":n.get::<Value,_>("mistakes"),"questionTypes":n.get::<Value,_>("question_types"),"formulas":n.get::<Value,_>("formulas"),"sourcePages":n.get::<Option<String>,_>("source_pages"),"sourceLocator":n.get::<Option<String>,_>("source_locator"),"difficulty":n.get::<String,_>("difficulty"),"importance":n.get::<f64,_>("importance"),"sources":sources.into_iter().map(|s|json!({"materialId":s.get::<Option<Uuid>,_>("material_id"),"chunkId":s.get::<Option<Uuid>,_>("chunk_id"),"fileName":s.get::<String,_>("file_name"),"excerpt":s.get::<String,_>("excerpt"),"sourceLocator":s.get::<Option<String>,_>("source_locator"),"sourceUrl":s.get::<Option<String>,_>("source_url")})).collect::<Vec<_>>() }));
    }
    Ok(Json(
        json!({"graph":{"id":g.get::<Uuid,_>("id"),"subject":g.get::<String,_>("subject"),"version":g.get::<i32,_>("version"),"isCurrent":g.get::<bool,_>("is_current"),"sourceRevision":g.get::<Option<String>,_>("source_revision"),"sources":g.get::<Value,_>("source_metadata")},"nodes":out,"edges":edges.into_iter().map(|e|json!({"source":e.get::<String,_>("source_key"),"target":e.get::<String,_>("target_key"),"relation":e.get::<String,_>("relation")})).collect::<Vec<_>>() }),
    ))
}

pub(crate) async fn delete_graph(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let n =
        sqlx::query("DELETE FROM knowledge_graphs WHERE id=$1 AND user_id=$2 AND is_current=false")
            .bind(id)
            .bind(u.id)
            .execute(&state.db)
            .await?
            .rows_affected();
    if n == 0 {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "current_graph_cannot_be_deleted",
        ));
    }
    Ok(Json(json!({"ok":true})))
}
