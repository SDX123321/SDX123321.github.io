use super::*;
use crate::admin::require_admin;
use axum::extract::Path as AxumPath;
use std::collections::{HashMap, HashSet};

const RELATIONS: [&str; 6] = [
    "prerequisite",
    "part_of",
    "related",
    "derived_from",
    "contrasts_with",
    "applies_to",
];

pub(crate) async fn start_graph(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<GraphInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let admin = super::admin::require_admin(&state, &headers).await?;
    let run:Uuid=sqlx::query_scalar("INSERT INTO canonical_graph_runs(domain_id,subject_id,requested_by) VALUES($1,$2,$3) RETURNING id").bind(input.domain_id).bind(input.subject_id).bind(admin.id).fetch_one(&state.db).await?;
    let bg = state.clone();
    tokio::spawn(async move {
        if let Err(e) = generate_graph(&bg, run, input.domain_id, input.subject_id, admin.id).await
        {
            eprintln!("canonical graph generation failed: {e:?}");
            let _=sqlx::query("UPDATE canonical_graph_runs SET status='failed',error='generation_failed',updated_at=now() WHERE id=$1").bind(run).execute(&bg.db).await;
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"runId":run,"status":"queued"})),
    ))
}

async fn generate_graph(
    state: &SharedState,
    run: Uuid,
    domain: Uuid,
    subject: Option<Uuid>,
    user: Uuid,
) -> anyhow::Result<()> {
    sqlx::query(
        "UPDATE canonical_graph_runs SET status='running',progress=15,updated_at=now() WHERE id=$1",
    )
    .bind(run)
    .execute(&state.db)
    .await?;
    let rows=sqlx::query(r#"SELECT c.id,c.material_id,c.chunk_text,m.file_name,m.kind FROM material_chunks c JOIN materials m ON m.id=c.material_id
      WHERE m.domain_id=$1 AND ($2::uuid IS NULL OR m.subject_id=$2) AND length(trim(c.chunk_text))>=20 ORDER BY m.updated_at DESC,c.chunk_index LIMIT 1200"#).bind(domain).bind(subject).fetch_all(&state.db).await?;
    if rows.len() < 3 {
        sqlx::query("UPDATE canonical_graph_runs SET status='failed',error='insufficient_sources',updated_at=now() WHERE id=$1").bind(run).execute(&state.db).await?;
        return Ok(());
    }
    let mut counts: HashMap<
        String,
        (
            i32,
            HashSet<Uuid>,
            HashSet<String>,
            Vec<(Uuid, Uuid, String)>,
        ),
    > = HashMap::new();
    let mut pairs: HashMap<(String, String), i32> = HashMap::new();
    for r in &rows {
        let text = r.get::<String, _>("chunk_text");
        let mut local = terms(&text);
        local.sort();
        local.dedup();
        local.truncate(40);
        for t in &local {
            let e =
                counts
                    .entry(t.clone())
                    .or_insert((0, HashSet::new(), HashSet::new(), Vec::new()));
            e.0 += text.matches(t).count() as i32;
            e.1.insert(r.get("material_id"));
            e.2.insert(r.get("kind"));
            if e.3.len() < 5 {
                e.3.push((
                    r.get("id"),
                    r.get("material_id"),
                    text.chars().take(280).collect(),
                ));
            }
        }
        for i in 0..local.len() {
            for j in i + 1..local.len().min(i + 7) {
                *pairs
                    .entry((local[i].clone(), local[j].clone()))
                    .or_default() += 1;
            }
        }
    }
    let mut ranked = counts
        .into_iter()
        .filter(|(_, v)| v.1.len() >= 2 || v.0 >= 4)
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| (b.1 .1.len(), b.1 .0).cmp(&(a.1 .1.len(), a.1 .0)));
    ranked.truncate(80);
    let selected: HashSet<String> = ranked.iter().map(|x| x.0.clone()).collect();
    let version:i32=sqlx::query_scalar("SELECT COALESCE(MAX(version),0)+1 FROM canonical_knowledge_graphs WHERE domain_id=$1 AND subject_id IS NOT DISTINCT FROM $2").bind(domain).bind(subject).fetch_one(&state.db).await?;
    let mut tx = state.db.begin().await?;
    let graph:Uuid=sqlx::query_scalar("INSERT INTO canonical_knowledge_graphs(domain_id,subject_id,version,created_by) VALUES($1,$2,$3,$4) RETURNING id").bind(domain).bind(subject).bind(version).bind(user).fetch_one(&mut*tx).await?;
    let max_doc = ranked.iter().map(|x| x.1 .1.len()).max().unwrap_or(1) as f64;
    let max_occ = ranked.iter().map(|x| x.1 .0).max().unwrap_or(1) as f64;
    for (rank_index, (term, (occ, docs, kinds, sources))) in ranked.iter().enumerate() {
        let key = stable_concept_key(term);
        let doc_score = docs.len() as f64 / max_doc;
        let question = if kinds.iter().any(|k| k == "paper" || k == "answer") {
            *occ
        } else {
            0
        };
        let q_score = question as f64 / max_occ;
        let diversity = (kinds.len() as f64 / 4.0).min(1.0);
        let importance = 0.45 * doc_score + 0.30 * q_score + 0.10 * diversity;
        let ratio = rank_index as f64 / ranked.len().max(1) as f64;
        let (level, difficulty, reason) = if ratio < 0.34 {
            ("basic", 25, "高覆盖基础知识点")
        } else if ratio < 0.72 {
            ("intermediate", 55, "需要综合理解与应用")
        } else {
            ("advanced", 82, "关联更专门的提高知识点")
        };
        let node:Uuid=sqlx::query_scalar("INSERT INTO canonical_knowledge_nodes(graph_id,node_key,label,summary,occurrence_count,document_frequency,question_frequency,source_diversity,importance,difficulty_level,difficulty_score,difficulty_reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id").bind(graph).bind(&key).bind(term).bind(format!("在 {} 份资料中出现 {} 次",docs.len(),occ)).bind(occ).bind(docs.len() as i32).bind(question).bind(kinds.len() as i32).bind(importance).bind(level).bind(difficulty).bind(reason).fetch_one(&mut*tx).await?;
        for (chunk, material, excerpt) in sources {
            sqlx::query("INSERT INTO canonical_node_sources(node_id,material_id,chunk_id,excerpt) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(node).bind(material).bind(chunk).bind(excerpt).execute(&mut*tx).await?;
        }
    }
    let subject_key: Option<String> = if let Some(subject_id) = subject {
        sqlx::query_scalar("SELECT subject_key FROM knowledge_subjects WHERE id=$1")
            .bind(subject_id)
            .fetch_optional(&mut *tx)
            .await?
    } else {
        None
    };
    let web_rows = sqlx::query(
        r#"SELECT concept,MAX(confidence)::float8 confidence,
      COALESCE((array_agg(excerpt ORDER BY confidence DESC))[1],'') excerpt
      FROM web_knowledge_evidence WHERE domain_id=$1 AND status='accepted'
        AND ($2::text IS NULL OR subject=$2) AND concept IS NOT NULL
      GROUP BY concept ORDER BY confidence DESC LIMIT 40"#,
    )
    .bind(domain)
    .bind(&subject_key)
    .fetch_all(&mut *tx)
    .await?;
    let mut web_node_count = 0;
    for row in &web_rows {
        let concept = row.get::<String, _>("concept");
        let exists: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM canonical_knowledge_nodes WHERE graph_id=$1 AND label=$2",
        )
        .bind(graph)
        .bind(&concept)
        .fetch_one(&mut *tx)
        .await?;
        if exists > 0 {
            continue;
        }
        let confidence = row.get::<f64, _>("confidence");
        sqlx::query("INSERT INTO canonical_knowledge_nodes(graph_id,node_key,label,summary,tags,importance,difficulty_level,difficulty_score,difficulty_reason) VALUES($1,$2,$3,$4,'[\"web-researched\"]'::jsonb,$5,'intermediate',55,'权威网页证据补充知识点')")
          .bind(graph).bind(stable_concept_key(&concept)).bind(concept).bind(row.get::<String,_>("excerpt")).bind((confidence*0.75).min(0.9)).execute(&mut*tx).await?;
        web_node_count += 1;
    }
    let key_map =
        sqlx::query("SELECT node_key,label FROM canonical_knowledge_nodes WHERE graph_id=$1")
            .bind(graph)
            .fetch_all(&mut *tx)
            .await?
            .into_iter()
            .map(|r| (r.get::<String, _>("label"), r.get::<String, _>("node_key")))
            .collect::<HashMap<_, _>>();
    let mut edge_count = 0;
    let mut pair_vec = pairs
        .into_iter()
        .filter(|((a, b), n)| *n >= 2 && selected.contains(a) && selected.contains(b))
        .collect::<Vec<_>>();
    pair_vec.sort_by(|a, b| b.1.cmp(&a.1));
    pair_vec.truncate(180);
    for ((a, b), n) in pair_vec {
        sqlx::query("INSERT INTO canonical_knowledge_edges(graph_id,source_key,target_key,relation,confidence) VALUES($1,$2,$3,'related',$4) ON CONFLICT DO NOTHING").bind(graph).bind(&key_map[&a]).bind(&key_map[&b]).bind((n as f64/10.0).min(0.95)).execute(&mut*tx).await?;
        edge_count += 1;
    }
    for row in sqlx::query("SELECT concept,target_concept,relation,confidence,url FROM web_knowledge_evidence WHERE domain_id=$1 AND status='accepted' AND ($2::text IS NULL OR subject=$2) AND concept IS NOT NULL AND target_concept IS NOT NULL").bind(domain).bind(&subject_key).fetch_all(&mut*tx).await? {
        let source=row.get::<String,_>("concept");let target=row.get::<String,_>("target_concept");let relation=row.get::<Option<String>,_>("relation").unwrap_or_else(||"related".into());
        if !RELATIONS.contains(&relation.as_str()){continue}
        let Some(source_key)=key_map.get(&source) else{continue};let Some(target_key)=key_map.get(&target) else{continue};
        let inserted=sqlx::query("INSERT INTO canonical_knowledge_edges(graph_id,source_key,target_key,relation,confidence,evidence) VALUES($1,$2,$3,$4,$5,jsonb_build_array(jsonb_build_object('url',$6,'kind','web'))) ON CONFLICT DO NOTHING").bind(graph).bind(source_key).bind(target_key).bind(relation).bind(row.get::<f64,_>("confidence")).bind(row.get::<String,_>("url")).execute(&mut*tx).await?.rows_affected();edge_count+=inserted as i32;
    }
    sqlx::query("UPDATE canonical_knowledge_nodes n SET centrality=LEAST(1.0,(SELECT COUNT(*)::float8/10 FROM canonical_knowledge_edges e WHERE e.graph_id=n.graph_id AND (e.source_key=n.node_key OR e.target_key=n.node_key))),importance=LEAST(1.0,importance+.15*LEAST(1.0,(SELECT COUNT(*)::float8/10 FROM canonical_knowledge_edges e WHERE e.graph_id=n.graph_id AND (e.source_key=n.node_key OR e.target_key=n.node_key)))) WHERE graph_id=$1").bind(graph).execute(&mut*tx).await?;
    sqlx::query("UPDATE canonical_knowledge_graphs SET node_count=$2,edge_count=$3 WHERE id=$1")
        .bind(graph)
        .bind(ranked.len() as i32 + web_node_count)
        .bind(edge_count)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE canonical_graph_runs SET status='completed',progress=100,graph_id=$2,updated_at=now() WHERE id=$1").bind(run).bind(graph).execute(&mut*tx).await?;
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn graph_run(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let r = sqlx::query(
        "SELECT id,status,progress,graph_id,error,updated_at FROM canonical_graph_runs WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "graph_run_not_found"))?;
    Ok(Json(
        json!({"id":r.get::<Uuid,_>("id"),"status":r.get::<String,_>("status"),"progress":r.get::<i32,_>("progress"),"graphId":r.get::<Option<Uuid>,_>("graph_id"),"error":r.get::<Option<String>,_>("error"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")}),
    ))
}

async fn graph_payload(
    state: &SharedState,
    id: Uuid,
    user: Option<Uuid>,
) -> Result<Value, ApiError> {
    let g=sqlx::query("SELECT id,domain_id,subject_id,version,status,node_count,edge_count,published_at FROM canonical_knowledge_graphs WHERE id=$1").bind(id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"graph_not_found"))?;
    let domain_id = g.get::<Uuid, _>("domain_id");
    let scope_key = g
        .get::<Option<Uuid>, _>("subject_id")
        .map(|id| id.to_string())
        .unwrap_or_else(|| "all".into());
    let nodes=sqlx::query(r#"SELECT n.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('materialId',s.material_id,'chunkId',s.chunk_id,'excerpt',s.excerpt)) FROM canonical_node_sources s WHERE s.node_id=n.id),'[]') sources,
      COALESCE((SELECT jsonb_build_object('mastery',u.mastery,'favorite',u.favorite,'note',u.note) FROM user_knowledge_states u
        WHERE u.concept_key=n.node_key AND u.user_id=$2 AND u.domain_id=$3 AND u.scope_key=$4),'{}') user_state
      FROM canonical_knowledge_nodes n WHERE graph_id=$1 ORDER BY importance DESC"#).bind(id).bind(user).bind(domain_id).bind(&scope_key).fetch_all(&state.db).await?;
    let edges=sqlx::query("SELECT source_key,target_key,relation,confidence,evidence FROM canonical_knowledge_edges WHERE graph_id=$1").bind(id).fetch_all(&state.db).await?;
    Ok(
        json!({"graph":{"id":g.get::<Uuid,_>("id"),"domainId":g.get::<Uuid,_>("domain_id"),"subjectId":g.get::<Option<Uuid>,_>("subject_id"),"version":g.get::<i32,_>("version"),"status":g.get::<String,_>("status"),"nodeCount":g.get::<i32,_>("node_count"),"edgeCount":g.get::<i32,_>("edge_count"),"publishedAt":g.get::<Option<DateTime<Utc>>,_>("published_at")},"nodes":nodes.into_iter().map(|n|json!({"id":n.get::<Uuid,_>("id"),"key":n.get::<String,_>("node_key"),"label":n.get::<String,_>("label"),"aliases":n.get::<Value,_>("aliases"),"summary":n.get::<String,_>("summary"),"tags":n.get::<Value,_>("tags"),"importance":n.get::<f64,_>("importance"),"difficultyLevel":n.get::<String,_>("difficulty_level"),"difficultyScore":n.get::<i32,_>("difficulty_score"),"difficultyReason":n.get::<String,_>("difficulty_reason"),"metrics":{"occurrences":n.get::<i32,_>("occurrence_count"),"documentFrequency":n.get::<i32,_>("document_frequency"),"questionFrequency":n.get::<i32,_>("question_frequency"),"sourceDiversity":n.get::<i32,_>("source_diversity"),"centrality":n.get::<f64,_>("centrality")},"sources":n.get::<Value,_>("sources"),"userState":n.get::<Value,_>("user_state")})).collect::<Vec<_>>(),"edges":edges.into_iter().map(|e|json!({"source":e.get::<String,_>("source_key"),"target":e.get::<String,_>("target_key"),"relation":e.get::<String,_>("relation"),"confidence":e.get::<f64,_>("confidence"),"evidence":e.get::<Value,_>("evidence")})).collect::<Vec<_>>()}),
    )
}

pub(crate) async fn current_graph(
    Query(p): Query<KnowledgeParams>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let domain = resolve_domain(&state, &p).await?;
    let user = optional_user(&state, &headers).await?;
    let id:Uuid=sqlx::query_scalar("SELECT id FROM canonical_knowledge_graphs WHERE domain_id=$1 AND subject_id IS NOT DISTINCT FROM $2 AND status='published' ORDER BY version DESC LIMIT 1").bind(domain).bind(p.subject_id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"graph_not_found"))?;
    Ok(Json(graph_payload(&state, id, user.map(|u| u.id)).await?))
}

pub(crate) async fn patch_graph(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<GraphPatch>,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let status: Option<String> =
        sqlx::query_scalar("SELECT status FROM canonical_knowledge_graphs WHERE id=$1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    if status.as_deref() != Some("draft") {
        return Err(ApiError::new(StatusCode::CONFLICT, "graph_not_draft"));
    }
    let mut tx = state.db.begin().await?;
    if let Some(nodes) = input.nodes {
        for n in nodes {
            sqlx::query("UPDATE canonical_knowledge_nodes SET label=$1,summary=$2,aliases=$3,tags=$4 WHERE graph_id=$5 AND node_key=$6").bind(n.label).bind(n.summary.unwrap_or_default()).bind(json!(n.aliases.unwrap_or_default())).bind(json!(n.tags.unwrap_or_default())).bind(id).bind(n.key).execute(&mut*tx).await?;
        }
    }
    if let Some(edges) = input.edges {
        sqlx::query("DELETE FROM canonical_knowledge_edges WHERE graph_id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        for e in edges {
            if !RELATIONS.contains(&e.relation.as_str()) || e.source == e.target {
                return Err(ApiError::bad_request());
            }
            sqlx::query("INSERT INTO canonical_knowledge_edges(graph_id,source_key,target_key,relation,confidence) VALUES($1,$2,$3,$4,1)").bind(id).bind(e.source).bind(e.target).bind(e.relation).execute(&mut*tx).await?;
        }
        sqlx::query("UPDATE canonical_knowledge_graphs SET edge_count=(SELECT COUNT(*) FROM canonical_knowledge_edges WHERE graph_id=$1) WHERE id=$1").bind(id).execute(&mut*tx).await?;
    }
    tx.commit().await?;
    Ok(Json(graph_payload(&state, id, None).await?))
}

pub(crate) async fn publish_graph(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let mut tx = state.db.begin().await?;
    let g = sqlx::query(
        "SELECT domain_id,subject_id,status FROM canonical_knowledge_graphs WHERE id=$1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "graph_not_found"))?;
    if g.get::<String, _>("status") != "draft" {
        return Err(ApiError::new(StatusCode::CONFLICT, "graph_not_draft"));
    }
    sqlx::query("UPDATE canonical_knowledge_graphs SET status='archived' WHERE domain_id=$1 AND subject_id IS NOT DISTINCT FROM $2 AND status='published'").bind(g.get::<Uuid,_>("domain_id")).bind(g.get::<Option<Uuid>,_>("subject_id")).execute(&mut*tx).await?;
    sqlx::query(
        "UPDATE canonical_knowledge_graphs SET status='published',published_at=now() WHERE id=$1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(json!({"ok":true,"graphId":id,"status":"published"})))
}

pub(crate) async fn save_node_state(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<NodeStateInput>,
) -> Result<Json<Value>, ApiError> {
    let user = auth_user(&state, &headers).await?;
    let mastery = input.mastery.unwrap_or(0).clamp(0, 100);
    let note = input.note.unwrap_or_default();
    if note.chars().count() > 10000 {
        return Err(ApiError::bad_request());
    }
    let node=sqlx::query(r#"SELECT n.node_key,g.domain_id,COALESCE(g.subject_id::text,'all') scope_key
      FROM canonical_knowledge_nodes n JOIN canonical_knowledge_graphs g ON g.id=n.graph_id WHERE n.id=$1"#)
      .bind(id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"knowledge_node_not_found"))?;
    sqlx::query(r#"INSERT INTO user_knowledge_states(user_id,domain_id,scope_key,concept_key,mastery,favorite,note) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(user_id,domain_id,scope_key,concept_key) DO UPDATE SET mastery=$5,favorite=$6,note=$7,updated_at=now()"#)
      .bind(user.id).bind(node.get::<Uuid,_>("domain_id")).bind(node.get::<String,_>("scope_key"))
      .bind(node.get::<String,_>("node_key")).bind(mastery).bind(input.favorite.unwrap_or(false)).bind(note).execute(&state.db).await?;
    Ok(Json(json!({"ok":true})))
}
