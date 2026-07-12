use super::*;
use axum::extract::Path as AxumPath;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct PreferenceInput {
    grade: Option<String>,
    #[serde(default)]
    subjects: Vec<String>,
    #[serde(rename = "defaultProviderId")]
    default_provider_id: Option<Uuid>,
    #[serde(default, rename = "completeOnboarding")]
    complete_onboarding: bool,
}

#[derive(Deserialize)]
pub(crate) struct ConversationInput {
    title: Option<String>,
    subject: Option<String>,
    grade: Option<String>,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct ConversationPatch {
    title: String,
}

#[derive(Deserialize)]
pub(crate) struct GraphInput {
    subject: String,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct GraphParams {
    subject: Option<String>,
}

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false",
        r#"CREATE TABLE IF NOT EXISTS user_preferences (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, grade TEXT,
          subjects JSONB NOT NULL DEFAULT '[]'::jsonb, default_provider_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          onboarding_completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS chat_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, subject TEXT, grade TEXT, provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'completed', error TEXT, provider TEXT, model TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ)"#,
        r#"CREATE TABLE IF NOT EXISTS chat_message_sources (
          message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
          material_id UUID REFERENCES materials(id) ON DELETE SET NULL, chunk_id UUID, source_order INTEGER NOT NULL,
          file_name TEXT NOT NULL, excerpt TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          PRIMARY KEY(message_id,source_order))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graphs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ready', is_current BOOLEAN NOT NULL DEFAULT false,
          node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,subject,version))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
          node_key TEXT NOT NULL, label TEXT NOT NULL, chapter TEXT NOT NULL, description TEXT NOT NULL,
          methods JSONB NOT NULL DEFAULT '[]'::jsonb, mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
          question_types JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE(graph_id,node_key))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
          source_key TEXT NOT NULL, target_key TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'prerequisite')"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_node_sources (
          node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
          material_id UUID REFERENCES materials(id) ON DELETE SET NULL, chunk_id UUID, file_name TEXT NOT NULL,
          excerpt TEXT NOT NULL, PRIMARY KEY(node_id,chunk_id))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_generation_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL, provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, graph_id UUID REFERENCES knowledge_graphs(id) ON DELETE SET NULL,
          error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "CREATE INDEX IF NOT EXISTS idx_conversations_user_time ON chat_conversations(user_id,updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_graphs_user_subject ON knowledge_graphs(user_id,subject,version DESC)",
        "INSERT INTO user_preferences(user_id,onboarding_completed_at) SELECT id,now() FROM users WHERE role<>'admin' ON CONFLICT(user_id) DO NOTHING",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}

pub(crate) async fn bootstrap_admin(db: &PgPool) -> anyhow::Result<()> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await?;
    if count != 0 {
        return Ok(());
    }
    let alphabet = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let mut bytes = [0u8; 20];
    OsRng.fill_bytes(&mut bytes);
    let password: String = bytes
        .iter()
        .map(|b| alphabet[*b as usize % alphabet.len()] as char)
        .collect();
    let password_hash = bcrypt_hash(&password, DEFAULT_COST)?;
    sqlx::query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES('admin',$1,'admin',true) ON CONFLICT DO NOTHING")
        .bind(password_hash).execute(db).await?;
    eprintln!("INITIAL ADMIN CREDENTIALS (shown once) username=admin password={password}");
    Ok(())
}

pub(crate) async fn preferences(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let row=sqlx::query("SELECT grade,subjects,default_provider_id,onboarding_completed_at FROM user_preferences WHERE user_id=$1").bind(u.id).fetch_optional(&state.db).await?;
    Ok(Json(match row {
        Some(r) => {
            json!({"grade":r.get::<Option<String>,_>("grade"),"subjects":r.get::<Value,_>("subjects"),"defaultProviderId":r.get::<Option<Uuid>,_>("default_provider_id"),"onboardingCompleted":r.get::<Option<DateTime<Utc>>,_>("onboarding_completed_at").is_some()})
        }
        None => {
            json!({"grade":null,"subjects":[],"defaultProviderId":null,"onboardingCompleted":false})
        }
    }))
}

pub(crate) async fn save_preferences(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<PreferenceInput>,
) -> Result<Json<Value>, ApiError> {
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
    if input
        .subjects
        .iter()
        .any(|s| !allowed.contains(&s.as_str()))
        || input.subjects.len() > 9
    {
        return Err(ApiError::bad_request());
    }
    if let Some(id) = input.default_provider_id {
        let owns: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM ai_provider_configs WHERE id=$1 AND user_id=$2",
        )
        .bind(id)
        .bind(u.id)
        .fetch_one(&state.db)
        .await?;
        if owns == 0 {
            return Err(ApiError::bad_request());
        }
    }
    sqlx::query(r#"INSERT INTO user_preferences(user_id,grade,subjects,default_provider_id,onboarding_completed_at) VALUES($1,$2,$3,$4,CASE WHEN $5 THEN now() END)
      ON CONFLICT(user_id) DO UPDATE SET grade=$2,subjects=$3,default_provider_id=$4,onboarding_completed_at=CASE WHEN $5 THEN COALESCE(user_preferences.onboarding_completed_at,now()) ELSE user_preferences.onboarding_completed_at END,updated_at=now()"#)
      .bind(u.id).bind(input.grade).bind(json!(input.subjects)).bind(input.default_provider_id).bind(input.complete_onboarding).execute(&state.db).await?;
    Ok(Json(json!({"ok":true})))
}

pub(crate) async fn conversations(
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let rows=sqlx::query("SELECT id,title,subject,grade,provider_config_id,created_at,updated_at FROM chat_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 100").bind(u.id).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"conversations":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"title":r.get::<String,_>("title"),"subject":r.get::<Option<String>,_>("subject"),"grade":r.get::<Option<String>,_>("grade"),"providerConfigId":r.get::<Option<Uuid>,_>("provider_config_id"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"updatedAt":r.get::<DateTime<Utc>,_>("updated_at")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn create_conversation(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<ConversationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let u = auth_user(&state, &headers).await?;
    let title = input.title.unwrap_or_else(|| "新对话".into());
    let title: String = title.chars().take(60).collect();
    let id:Uuid=sqlx::query_scalar("INSERT INTO chat_conversations(user_id,title,subject,grade,provider_config_id) VALUES($1,$2,$3,$4,$5) RETURNING id").bind(u.id).bind(title).bind(input.subject).bind(input.grade).bind(input.provider_config_id).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(json!({"id":id}))))
}

pub(crate) async fn conversation_messages(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    own_conversation(&state, id, u.id).await?;
    let rows=sqlx::query("SELECT id,role,content,status,error,provider,model,created_at FROM chat_messages WHERE conversation_id=$1 ORDER BY created_at,id").bind(id).fetch_all(&state.db).await?;
    let mut out = Vec::new();
    for r in rows {
        let mid = r.get::<Uuid, _>("id");
        let sources=sqlx::query("SELECT material_id,chunk_id,source_order,file_name,excerpt,metadata FROM chat_message_sources WHERE message_id=$1 ORDER BY source_order").bind(mid).fetch_all(&state.db).await?;
        out.push(json!({"id":mid,"role":r.get::<String,_>("role"),"content":r.get::<String,_>("content"),"status":r.get::<String,_>("status"),"error":r.get::<Option<String>,_>("error"),"provider":r.get::<Option<String>,_>("provider"),"model":r.get::<Option<String>,_>("model"),"createdAt":r.get::<DateTime<Utc>,_>("created_at"),"sources":sources.into_iter().map(|s|json!({"materialId":s.get::<Option<Uuid>,_>("material_id"),"chunkId":s.get::<Option<Uuid>,_>("chunk_id"),"order":s.get::<i32,_>("source_order"),"fileName":s.get::<String,_>("file_name"),"excerpt":s.get::<String,_>("excerpt"),"metadata":s.get::<Value,_>("metadata")})).collect::<Vec<_>>() }));
    }
    Ok(Json(json!({"messages":out})))
}

pub(crate) async fn patch_conversation(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<ConversationPatch>,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let title: String = input.title.trim().chars().take(60).collect();
    if title.is_empty() {
        return Err(ApiError::bad_request());
    }
    let n = sqlx::query(
        "UPDATE chat_conversations SET title=$1,updated_at=now() WHERE id=$2 AND user_id=$3",
    )
    .bind(title)
    .bind(id)
    .bind(u.id)
    .execute(&state.db)
    .await?
    .rows_affected();
    if n == 0 {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "conversation_not_found",
        ));
    }
    Ok(Json(json!({"ok":true})))
}
pub(crate) async fn delete_conversation(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let n = sqlx::query("DELETE FROM chat_conversations WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(u.id)
        .execute(&state.db)
        .await?
        .rows_affected();
    if n == 0 {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "conversation_not_found",
        ));
    }
    Ok(Json(json!({"ok":true})))
}

async fn own_conversation(state: &SharedState, id: Uuid, user_id: Uuid) -> Result<(), ApiError> {
    let n: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM chat_conversations WHERE id=$1 AND user_id=$2")
            .bind(id)
            .bind(user_id)
            .fetch_one(&state.db)
            .await?;
    if n == 0 {
        Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "conversation_not_found",
        ))
    } else {
        Ok(())
    }
}

pub(crate) async fn begin_message(
    state: &SharedState,
    user_id: Uuid,
    conversation_id: Uuid,
    question: &str,
) -> Result<Uuid, ApiError> {
    own_conversation(state, conversation_id, user_id).await?;
    let id:Uuid=sqlx::query_scalar("INSERT INTO chat_messages(conversation_id,role,content,status,completed_at) VALUES($1,'user',$2,'completed',now()) RETURNING id").bind(conversation_id).bind(question).fetch_one(&state.db).await?;
    sqlx::query("UPDATE chat_conversations SET title=CASE WHEN title='新对话' THEN left($1,60) ELSE title END,updated_at=now() WHERE id=$2").bind(question).bind(conversation_id).execute(&state.db).await?;
    Ok(id)
}

pub(crate) async fn save_answer(
    state: &SharedState,
    conversation_id: Uuid,
    content: &str,
    status: &str,
    error: Option<&str>,
    provider: &str,
    model: &str,
    sources: &[super::high_school::SearchMatch],
) -> Result<(), ApiError> {
    let id:Uuid=sqlx::query_scalar("INSERT INTO chat_messages(conversation_id,role,content,status,error,provider,model,completed_at) VALUES($1,'assistant',$2,$3,$4,$5,$6,now()) RETURNING id").bind(conversation_id).bind(content).bind(status).bind(error).bind(provider).bind(model).fetch_one(&state.db).await?;
    for (i, s) in sources.iter().enumerate() {
        sqlx::query("INSERT INTO chat_message_sources(message_id,material_id,chunk_id,source_order,file_name,excerpt,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)").bind(id).bind(s.material_id).bind(s.id).bind(i as i32+1).bind(&s.file_name).bind(&s.text).bind(json!({"subject":s.subject,"grade":s.grade,"year":s.year})).execute(&state.db).await?;
    }
    sqlx::query("UPDATE chat_conversations SET updated_at=now() WHERE id=$1")
        .bind(conversation_id)
        .execute(&state.db)
        .await?;
    Ok(())
}

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
    if rows.len() < 3 {
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
    let graph_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graphs(user_id,subject,version,status) VALUES($1,$2,$3,'building') RETURNING id").bind(user_id).bind(subject).bind(version).fetch_one(&mut*tx).await?;
    let mut previous: Option<String> = None;
    let mut node_count = 0;
    let mut edge_count = 0;
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
    let rows=sqlx::query("SELECT id,subject,version,status,is_current,node_count,edge_count,created_at FROM knowledge_graphs WHERE user_id=$1 AND ($2::text IS NULL OR subject=$2) ORDER BY created_at DESC").bind(u.id).bind(params.subject).fetch_all(&state.db).await?;
    Ok(Json(
        json!({"graphs":rows.into_iter().map(|r|json!({"id":r.get::<Uuid,_>("id"),"subject":r.get::<String,_>("subject"),"version":r.get::<i32,_>("version"),"status":r.get::<String,_>("status"),"isCurrent":r.get::<bool,_>("is_current"),"nodeCount":r.get::<i32,_>("node_count"),"edgeCount":r.get::<i32,_>("edge_count"),"createdAt":r.get::<DateTime<Utc>,_>("created_at")})).collect::<Vec<_>>()}),
    ))
}

pub(crate) async fn graph(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    let g=sqlx::query("SELECT id,subject,version,is_current FROM knowledge_graphs WHERE id=$1 AND user_id=$2 AND status='ready'").bind(id).bind(u.id).fetch_optional(&state.db).await?.ok_or_else(||ApiError::new(StatusCode::NOT_FOUND,"graph_not_found"))?;
    let nodes=sqlx::query("SELECT id,node_key,label,chapter,description,methods,mistakes,question_types FROM knowledge_graph_nodes WHERE graph_id=$1 ORDER BY chapter,label").bind(id).fetch_all(&state.db).await?;
    let edges = sqlx::query(
        "SELECT source_key,target_key,relation FROM knowledge_graph_edges WHERE graph_id=$1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;
    let mut out = Vec::new();
    for n in nodes {
        let nid = n.get::<Uuid, _>("id");
        let sources=sqlx::query("SELECT material_id,chunk_id,file_name,excerpt FROM knowledge_graph_node_sources WHERE node_id=$1").bind(nid).fetch_all(&state.db).await?;
        out.push(json!({"id":nid,"key":n.get::<String,_>("node_key"),"label":n.get::<String,_>("label"),"chapter":n.get::<String,_>("chapter"),"description":n.get::<String,_>("description"),"methods":n.get::<Value,_>("methods"),"mistakes":n.get::<Value,_>("mistakes"),"questionTypes":n.get::<Value,_>("question_types"),"sources":sources.into_iter().map(|s|json!({"materialId":s.get::<Option<Uuid>,_>("material_id"),"chunkId":s.get::<Option<Uuid>,_>("chunk_id"),"fileName":s.get::<String,_>("file_name"),"excerpt":s.get::<String,_>("excerpt")})).collect::<Vec<_>>() }));
    }
    Ok(Json(
        json!({"graph":{"id":g.get::<Uuid,_>("id"),"subject":g.get::<String,_>("subject"),"version":g.get::<i32,_>("version"),"isCurrent":g.get::<bool,_>("is_current")},"nodes":out,"edges":edges.into_iter().map(|e|json!({"source":e.get::<String,_>("source_key"),"target":e.get::<String,_>("target_key"),"relation":e.get::<String,_>("relation")})).collect::<Vec<_>>() }),
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

#[derive(Deserialize)]
pub(crate) struct PasswordInput {
    #[serde(rename = "currentPassword")]
    current_password: String,
    #[serde(rename = "newPassword")]
    new_password: String,
}
pub(crate) async fn change_password(
    State(state): State<SharedState>,
    headers: HeaderMap,
    Json(input): Json<PasswordInput>,
) -> Result<Json<Value>, ApiError> {
    let u = auth_user(&state, &headers).await?;
    if input.new_password.len() < 10 {
        return Err(ApiError::bad_request());
    }
    let hash: String = sqlx::query_scalar("SELECT password_hash FROM users WHERE id=$1")
        .bind(u.id)
        .fetch_one(&state.db)
        .await?;
    if !bcrypt_verify(input.current_password, &hash).unwrap_or(false) {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "invalid_credentials",
        ));
    }
    let next = bcrypt_hash(input.new_password, DEFAULT_COST).map_err(|_| ApiError::server())?;
    sqlx::query("UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2")
        .bind(next)
        .bind(u.id)
        .execute(&state.db)
        .await?;
    if let Some(token) = parse_cookie(&headers, SESSION_COOKIE) {
        sqlx::query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2")
            .bind(u.id)
            .bind(hash_token(&token))
            .execute(&state.db)
            .await?;
    }
    Ok(Json(json!({"ok":true})))
}
