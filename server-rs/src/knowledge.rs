use super::admin::require_admin;
use super::*;
use axum::extract::Path as AxumPath;
use axum::response::Response;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

const RELATIONS: [&str; 6] = [
    "prerequisite",
    "part_of",
    "related",
    "derived_from",
    "contrasts_with",
    "applies_to",
];

fn stable_concept_key(term: &str) -> String {
    format!(
        "concept-{}",
        &hex::encode(Sha256::digest(term.as_bytes()))[..24]
    )
}

async fn optional_user(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<Option<UserSession>, ApiError> {
    match auth_user(state, headers).await {
        Ok(user) => Ok(Some(user)),
        Err(error) if error.status == StatusCode::UNAUTHORIZED => Ok(None),
        Err(error) => Err(error),
    }
}

#[derive(Deserialize)]
pub(crate) struct KnowledgeParams {
    #[serde(rename = "domainId")]
    domain_id: Option<Uuid>,
    #[serde(rename = "domainKey")]
    domain_key: Option<String>,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
    q: Option<String>,
    limit: Option<i64>,
    cursor: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SearchInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
    query: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct GraphInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct SuggestionParams {
    subject: Option<String>,
    grade: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SuggestionRunInput {
    subject: String,
    grade: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct WebResearchInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    subject: String,
}

#[derive(Deserialize)]
pub(crate) struct GraphPatch {
    nodes: Option<Vec<NodePatch>>,
    edges: Option<Vec<EdgePatch>>,
}

#[derive(Deserialize)]
pub(crate) struct NodePatch {
    key: String,
    label: String,
    summary: Option<String>,
    aliases: Option<Vec<String>>,
    tags: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct EdgePatch {
    source: String,
    target: String,
    relation: String,
}

#[derive(Deserialize)]
pub(crate) struct NodeStateInput {
    mastery: Option<i32>,
    favorite: Option<bool>,
    note: Option<String>,
}

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS content_domains (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_subjects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_key TEXT NOT NULL, name TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE(domain_id,subject_key))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_courses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE SET NULL, course_key TEXT NOT NULL, name TEXT NOT NULL,
          route TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(domain_id,course_key))"#,
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES content_domains(id) ON DELETE RESTRICT",
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE SET NULL",
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES knowledge_courses(id) ON DELETE SET NULL",
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_graphs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE CASCADE, version INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
          node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_at TIMESTAMPTZ, UNIQUE(domain_id,subject_id,version))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES canonical_knowledge_graphs(id) ON DELETE CASCADE,
          node_key TEXT NOT NULL, label TEXT NOT NULL, aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
          summary TEXT NOT NULL DEFAULT '', tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          occurrence_count INTEGER NOT NULL DEFAULT 0, document_frequency INTEGER NOT NULL DEFAULT 0,
          question_frequency INTEGER NOT NULL DEFAULT 0, source_diversity INTEGER NOT NULL DEFAULT 0,
          centrality DOUBLE PRECISION NOT NULL DEFAULT 0, importance DOUBLE PRECISION NOT NULL DEFAULT 0,
          UNIQUE(graph_id,node_key))"#,
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_level TEXT NOT NULL DEFAULT 'intermediate'",
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_score INTEGER NOT NULL DEFAULT 50",
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_reason TEXT NOT NULL DEFAULT ''",
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES canonical_knowledge_graphs(id) ON DELETE CASCADE,
          source_key TEXT NOT NULL, target_key TEXT NOT NULL, relation TEXT NOT NULL,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5, evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
          UNIQUE(graph_id,source_key,target_key,relation))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_node_sources (
          node_id UUID NOT NULL REFERENCES canonical_knowledge_nodes(id) ON DELETE CASCADE,
          material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          chunk_id UUID NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
          excerpt TEXT NOT NULL, PRIMARY KEY(node_id,chunk_id))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_graph_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id),
          subject_id UUID REFERENCES knowledge_subjects(id), requested_by UUID REFERENCES users(id),
          graph_id UUID REFERENCES canonical_knowledge_graphs(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS user_knowledge_node_states (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          node_id UUID NOT NULL REFERENCES canonical_knowledge_nodes(id) ON DELETE CASCADE,
          mastery INTEGER NOT NULL DEFAULT 0 CHECK(mastery BETWEEN 0 AND 100), favorite BOOLEAN NOT NULL DEFAULT false,
          note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,node_id))"#,
        r#"CREATE TABLE IF NOT EXISTS user_knowledge_states (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          scope_key TEXT NOT NULL, concept_key TEXT NOT NULL,
          mastery INTEGER NOT NULL DEFAULT 0 CHECK(mastery BETWEEN 0 AND 100), favorite BOOLEAN NOT NULL DEFAULT false,
          note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,domain_id,scope_key,concept_key))"#,
        r#"CREATE TABLE IF NOT EXISTS suggested_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_key TEXT NOT NULL DEFAULT 'high-school',
          subject TEXT NOT NULL, grade TEXT, question TEXT NOT NULL, model TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active', use_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(domain_key,subject,grade,question))"#,
        r#"CREATE TABLE IF NOT EXISTS suggested_question_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subject TEXT NOT NULL, grade TEXT,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS web_research_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL, subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, query_count INTEGER NOT NULL DEFAULT 0,
          visited_count INTEGER NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS web_knowledge_evidence (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES web_research_runs(id) ON DELETE CASCADE,
          domain_id UUID NOT NULL, subject TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', host TEXT NOT NULL,
          excerpt TEXT NOT NULL, content_hash TEXT NOT NULL, concept TEXT, relation TEXT, target_concept TEXT,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'candidate', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(run_id,url,content_hash))"#,
        "CREATE INDEX IF NOT EXISTS idx_materials_domain_subject ON materials(domain_id,subject_id,updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_canonical_graph_current ON canonical_knowledge_graphs(domain_id,subject_id,status,published_at DESC)",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    sqlx::query("INSERT INTO content_domains(domain_key,name,description,sort_order) VALUES ('high-school','高中','高中课程、试卷与备考资料',10),('university','大学','大学课程、讲义与期末复习资料',20) ON CONFLICT(domain_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description")
        .execute(db).await?;
    sqlx::query("UPDATE materials SET domain_id=(SELECT id FROM content_domains WHERE domain_key='high-school') WHERE domain_id IS NULL")
        .execute(db).await?;
    sqlx::query(r#"INSERT INTO user_knowledge_states(user_id,domain_id,scope_key,concept_key,mastery,favorite,note,updated_at)
      SELECT s.user_id,g.domain_id,COALESCE(g.subject_id::text,'all'),
        CASE WHEN n.node_key LIKE 'concept-%' THEN n.node_key ELSE 'concept-'||substr(encode(digest(n.label,'sha256'),'hex'),1,24) END,
        s.mastery,s.favorite,s.note,s.updated_at
      FROM user_knowledge_node_states s JOIN canonical_knowledge_nodes n ON n.id=s.node_id
      JOIN canonical_knowledge_graphs g ON g.id=n.graph_id ON CONFLICT DO NOTHING"#).execute(db).await?;
    Ok(())
}

fn fallback_suggestions(subject: &str) -> Vec<String> {
    let name = match subject {
        "math" => "数学",
        "physics" => "物理",
        "chemistry" => "化学",
        "biology" => "生物",
        "english" => "英语",
        "chinese" => "语文",
        "history" => "历史",
        "geography" => "地理",
        "politics" => "政治",
        _ => "这门学科",
    };
    vec![
        format!("{name}有哪些必须掌握的基础概念？"),
        format!("{name}中容易混淆的知识点有哪些？"),
        format!("如何建立{name}知识点之间的联系？"),
    ]
}

async fn generate_suggestions(
    state: &SharedState,
    run: Uuid,
    subject: String,
    grade: Option<String>,
) -> anyhow::Result<()> {
    sqlx::query("UPDATE suggested_question_runs SET status='running',progress=10,updated_at=now() WHERE id=$1").bind(run).execute(&state.db).await?;
    let config = state.ollama_config.read().await.clone();
    let prompt = format!("为高中{}{}生成30个具体、互不重复、适合RAG资料问答的中文学习问题。覆盖基础理解、综合应用和提高探究。只返回JSON字符串数组，不要解释。", subject, grade.as_deref().map(|g|format!("（{g}）")).unwrap_or_default());
    let response = state.http.post(format!("{}/api/chat",config.base_url.trim_end_matches('/'))).json(&json!({"model":config.chat_model,"stream":false,"think":false,"format":"json","messages":[{"role":"user","content":prompt}]})).send().await?;
    if !response.status().is_success() {
        anyhow::bail!("ollama_status_{}", response.status());
    }
    let body: Value = response.json().await?;
    let content = body
        .pointer("/message/content")
        .and_then(Value::as_str)
        .unwrap_or("[]");
    let parsed: Value = serde_json::from_str(content)
        .or_else(|_| serde_json::from_str(content.trim_matches('`')))?;
    let questions = parsed.as_array().cloned().unwrap_or_default();
    let mut inserted = 0;
    for value in questions.into_iter().take(40) {
        let Some(q) = value
            .as_str()
            .map(str::trim)
            .filter(|q| (8..=100).contains(&q.chars().count()))
        else {
            continue;
        };
        inserted += sqlx::query("INSERT INTO suggested_questions(subject,grade,question,model) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING").bind(&subject).bind(&grade).bind(q).bind(&config.chat_model).execute(&state.db).await?.rows_affected();
    }
    if inserted < 3 {
        anyhow::bail!("insufficient_questions");
    }
    sqlx::query("UPDATE suggested_question_runs SET status='completed',progress=100,updated_at=now() WHERE id=$1").bind(run).execute(&state.db).await?;
    Ok(())
}

pub(crate) async fn suggested_questions(
    Query(p): Query<SuggestionParams>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, ApiError> {
    let subject = p.subject.unwrap_or_else(|| "all".into());
    let limit = p.limit.unwrap_or(3).clamp(1, 6);
    let rows=sqlx::query("SELECT id,question FROM suggested_questions WHERE status='active' AND subject=$1 AND ($2::text IS NULL OR grade IS NULL OR grade=$2) ORDER BY random() LIMIT $3").bind(&subject).bind(&p.grade).bind(limit).fetch_all(&state.db).await?;
    let mut questions = rows
        .iter()
        .map(|r| r.get::<String, _>("question"))
        .collect::<Vec<_>>();
    let pool_size:i64=sqlx::query_scalar("SELECT COUNT(*) FROM suggested_questions WHERE status='active' AND subject=$1 AND ($2::text IS NULL OR grade IS NULL OR grade=$2) AND created_at>now()-interval '30 days'").bind(&subject).bind(&p.grade).fetch_one(&state.db).await?;
    if pool_size < 12 {
        let running:i64=sqlx::query_scalar("SELECT COUNT(*) FROM suggested_question_runs WHERE subject=$1 AND grade IS NOT DISTINCT FROM $2 AND status IN ('queued','running')").bind(&subject).bind(&p.grade).fetch_one(&state.db).await?;
        if running == 0 {
            let run: Uuid = sqlx::query_scalar(
                "INSERT INTO suggested_question_runs(subject,grade) VALUES($1,$2) RETURNING id",
            )
            .bind(&subject)
            .bind(&p.grade)
            .fetch_one(&state.db)
            .await?;
            let bg = state.clone();
            let suggestion_subject = subject.clone();
            let suggestion_grade = p.grade.clone();
            tokio::spawn(async move {
                if let Err(error) =
                    generate_suggestions(&bg, run, suggestion_subject, suggestion_grade).await
                {
                    let _=sqlx::query("UPDATE suggested_question_runs SET status='failed',error=$2,updated_at=now() WHERE id=$1").bind(run).bind(error.to_string()).execute(&bg.db).await;
                }
            });
        }
    }
    if questions.len() < limit as usize {
        for q in fallback_suggestions(&subject) {
            if questions.len() >= limit as usize {
                break;
            }
            if !questions.contains(&q) {
                questions.push(q)
            }
        }
    }
    Ok(Json(
        json!({"questions":questions,"cached":!rows.is_empty()}),
    ))
}

pub(crate) async fn start_suggestion_run(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<SuggestionRunInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    require_admin(&state, &headers).await?;
    let run: Uuid = sqlx::query_scalar(
        "INSERT INTO suggested_question_runs(subject,grade) VALUES($1,$2) RETURNING id",
    )
    .bind(&input.subject)
    .bind(&input.grade)
    .fetch_one(&state.db)
    .await?;
    let bg = state.clone();
    tokio::spawn(async move {
        if let Err(error) = generate_suggestions(&bg, run, input.subject, input.grade).await {
            let _=sqlx::query("UPDATE suggested_question_runs SET status='failed',error=$2,updated_at=now() WHERE id=$1").bind(run).bind(error.to_string()).execute(&bg.db).await;
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"runId":run,"status":"queued"})),
    ))
}

pub(crate) async fn suggestion_run(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    require_admin(&state, &headers).await?;
    let r = sqlx::query(
        "SELECT id,status,progress,error,updated_at FROM suggested_question_runs WHERE id=$1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND, "run_not_found"))?;
    Ok(Json(
        json!({"id":r.get::<Uuid,_>("id"),"status":r.get::<String,_>("status"),"progress":r.get::<i32,_>("progress"),"error":r.get::<Option<String>,_>("error"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")}),
    ))
}

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

pub(crate) async fn domains(State(state): State<SharedState>) -> Result<Json<Value>, ApiError> {
    let rows=sqlx::query(r#"SELECT d.id,d.domain_key,d.name,d.description,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'key',s.subject_key,'name',s.name) ORDER BY s.name) FROM knowledge_subjects s WHERE s.domain_id=d.id),'[]') subjects,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'key',c.course_key,'name',c.name,'subjectId',c.subject_id,'route',c.route) ORDER BY c.name) FROM knowledge_courses c WHERE c.domain_id=d.id),'[]') courses
      FROM content_domains d WHERE d.active ORDER BY d.sort_order,d.name"#).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"domains":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"key":r.get::<String,_>("domain_key"),"name":r.get::<String,_>("name"),"description":r.get::<String,_>("description"),"subjects":r.get::<Value,_>("subjects"),"courses":r.get::<Value,_>("courses")})).collect::<Vec<_>>()}),
    ))
}

async fn resolve_domain(state: &SharedState, p: &KnowledgeParams) -> Result<Uuid, ApiError> {
    if let Some(id) = p.domain_id {
        return Ok(id);
    }
    let key = p.domain_key.as_deref().ok_or_else(ApiError::bad_request)?;
    sqlx::query_scalar("SELECT id FROM content_domains WHERE domain_key=$1 AND active")
        .bind(key)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(ApiError::bad_request)
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

fn terms(text: &str) -> Vec<String> {
    let stop: HashSet<&str> = [
        "一个", "这种", "可以", "因为", "所以", "以及", "进行", "相关", "问题", "答案", "解析",
        "the", "and", "with", "from",
    ]
    .into_iter()
    .collect();
    text.split(|c: char| !(c.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&c)))
        .filter_map(|v| {
            let v = v.trim().to_lowercase();
            ((2..=24).contains(&v.chars().count()) && !stop.contains(v.as_str())).then_some(v)
        })
        .collect()
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

#[cfg(test)]
mod tests {
    use super::stable_concept_key;

    #[test]
    fn concept_keys_are_stable_across_graph_rankings() {
        assert_eq!(
            stable_concept_key("傅里叶变换"),
            stable_concept_key("傅里叶变换")
        );
        assert_ne!(
            stable_concept_key("傅里叶变换"),
            stable_concept_key("拉普拉斯变换")
        );
    }
}
