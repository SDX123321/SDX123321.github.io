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

struct ConceptSeed {
    label: &'static str,
    chapter: &'static str,
    keywords: &'static [&'static str],
    summary: &'static str,
}

fn math_concept_catalog() -> &'static [ConceptSeed] {
    &[
        ConceptSeed {
            label: "集合与元素",
            chapter: "集合与逻辑",
            keywords: &["集合", "子集", "交集", "并集"],
            summary: "理解集合、元素及集合间关系，熟练进行交集、并集与补集运算。",
        },
        ConceptSeed {
            label: "命题与量词",
            chapter: "集合与逻辑",
            keywords: &["命题", "充分条件", "必要条件", "全称量词", "存在量词"],
            summary: "判断命题真假，理解充分必要条件以及全称、存在量词的否定。",
        },
        ConceptSeed {
            label: "基本不等式",
            chapter: "不等式",
            keywords: &["基本不等式", "均值不等式", "不等式"],
            summary: "利用基本不等式求最值，并准确检查正数、定值与等号成立条件。",
        },
        ConceptSeed {
            label: "一元二次不等式",
            chapter: "不等式",
            keywords: &["一元二次不等式", "二次不等式", "判别式"],
            summary: "结合二次函数图像、根与判别式求解一元二次不等式。",
        },
        ConceptSeed {
            label: "函数概念与表示",
            chapter: "函数",
            keywords: &["函数", "定义域", "值域", "解析式"],
            summary: "从对应关系理解函数，掌握定义域、值域与常用表示方法。",
        },
        ConceptSeed {
            label: "函数单调性",
            chapter: "函数",
            keywords: &["单调性", "单调递增", "单调递减", "单调区间"],
            summary: "使用定义、图像或导数判断函数的单调区间。",
        },
        ConceptSeed {
            label: "函数奇偶性",
            chapter: "函数",
            keywords: &["奇偶性", "奇函数", "偶函数", "对称"],
            summary: "根据定义域与函数关系判断奇偶性，并利用图像对称性解决问题。",
        },
        ConceptSeed {
            label: "函数零点",
            chapter: "函数",
            keywords: &["零点", "方程的根", "二分法"],
            summary: "理解函数零点与方程根的联系，利用图像和零点存在定理判断根。",
        },
        ConceptSeed {
            label: "指数函数",
            chapter: "基本初等函数",
            keywords: &["指数函数", "指数幂", "指数"],
            summary: "掌握指数运算与指数函数图像、单调性及参数变化规律。",
        },
        ConceptSeed {
            label: "对数函数",
            chapter: "基本初等函数",
            keywords: &["对数函数", "对数", "换底公式"],
            summary: "掌握对数运算、换底公式以及对数函数的图像和性质。",
        },
        ConceptSeed {
            label: "幂函数",
            chapter: "基本初等函数",
            keywords: &["幂函数"],
            summary: "比较典型幂函数的定义域、奇偶性、单调性和图像特征。",
        },
        ConceptSeed {
            label: "三角函数",
            chapter: "三角函数",
            keywords: &["三角函数", "正弦", "余弦", "正切"],
            summary: "理解任意角三角函数，掌握单位圆、图像、周期与基本性质。",
        },
        ConceptSeed {
            label: "三角恒等变换",
            chapter: "三角函数",
            keywords: &["和差角", "二倍角", "恒等变换", "诱导公式"],
            summary: "运用诱导公式、和差角与倍角公式完成化简、求值和证明。",
        },
        ConceptSeed {
            label: "解三角形",
            chapter: "三角函数",
            keywords: &["正弦定理", "余弦定理", "解三角形"],
            summary: "利用正弦定理、余弦定理和面积公式求解三角形及实际测量问题。",
        },
        ConceptSeed {
            label: "平面向量",
            chapter: "向量",
            keywords: &["平面向量", "向量", "数量积"],
            summary: "掌握向量的线性运算、坐标表示和数量积的几何意义。",
        },
        ConceptSeed {
            label: "等差数列",
            chapter: "数列",
            keywords: &["等差数列", "公差"],
            summary: "掌握等差数列通项、前 n 项和及其基本性质。",
        },
        ConceptSeed {
            label: "等比数列",
            chapter: "数列",
            keywords: &["等比数列", "公比"],
            summary: "掌握等比数列通项、前 n 项和及其基本性质。",
        },
        ConceptSeed {
            label: "数列递推与求和",
            chapter: "数列",
            keywords: &["递推", "错位相减", "裂项相消", "数列求和"],
            summary: "由递推关系求通项，并使用错位相减、裂项相消等方法求和。",
        },
        ConceptSeed {
            label: "空间几何体",
            chapter: "立体几何",
            keywords: &["空间几何体", "棱柱", "棱锥", "球", "体积"],
            summary: "认识空间几何体结构，掌握表面积、体积和直观图。",
        },
        ConceptSeed {
            label: "空间线面关系",
            chapter: "立体几何",
            keywords: &["线面平行", "线面垂直", "面面平行", "面面垂直"],
            summary: "使用判定与性质定理证明空间中的平行、垂直关系。",
        },
        ConceptSeed {
            label: "直线与圆",
            chapter: "解析几何",
            keywords: &["直线方程", "圆的方程", "直线与圆"],
            summary: "建立直线与圆的方程，研究位置关系、距离及弦长问题。",
        },
        ConceptSeed {
            label: "圆锥曲线",
            chapter: "解析几何",
            keywords: &["椭圆", "双曲线", "抛物线", "圆锥曲线"],
            summary: "理解圆锥曲线定义、标准方程和几何性质，处理定点定值问题。",
        },
        ConceptSeed {
            label: "导数与切线",
            chapter: "导数",
            keywords: &["导数", "切线", "瞬时变化率"],
            summary: "理解导数的几何意义，计算基本函数导数并求曲线切线。",
        },
        ConceptSeed {
            label: "导数研究函数",
            chapter: "导数",
            keywords: &["极值", "最值", "导数", "单调区间"],
            summary: "利用导数研究函数单调性、极值、最值以及参数范围。",
        },
        ConceptSeed {
            label: "计数原理与排列组合",
            chapter: "计数原理",
            keywords: &["排列", "组合", "计数原理"],
            summary: "使用分类、分步计数原理以及排列组合模型解决计数问题。",
        },
        ConceptSeed {
            label: "二项式定理",
            chapter: "计数原理",
            keywords: &["二项式定理", "二项式系数"],
            summary: "掌握二项展开式、通项与二项式系数性质。",
        },
        ConceptSeed {
            label: "古典概型",
            chapter: "概率统计",
            keywords: &["古典概型", "概率", "样本空间"],
            summary: "建立样本空间，使用计数方法求等可能事件的概率。",
        },
        ConceptSeed {
            label: "统计与数据分析",
            chapter: "概率统计",
            keywords: &["平均数", "方差", "标准差", "频率分布", "统计"],
            summary: "使用统计图表和数字特征描述数据，理解抽样与估计。",
        },
    ]
}

fn math_prerequisites() -> &'static [(&'static str, &'static str)] {
    &[
        ("集合与元素", "命题与量词"),
        ("集合与元素", "函数概念与表示"),
        ("函数概念与表示", "函数单调性"),
        ("函数概念与表示", "函数奇偶性"),
        ("函数概念与表示", "函数零点"),
        ("函数概念与表示", "指数函数"),
        ("函数概念与表示", "对数函数"),
        ("函数概念与表示", "幂函数"),
        ("函数单调性", "导数研究函数"),
        ("导数与切线", "导数研究函数"),
        ("三角函数", "三角恒等变换"),
        ("三角恒等变换", "解三角形"),
        ("平面向量", "解三角形"),
        ("等差数列", "数列递推与求和"),
        ("等比数列", "数列递推与求和"),
        ("直线与圆", "圆锥曲线"),
        ("空间几何体", "空间线面关系"),
        ("计数原理与排列组合", "古典概型"),
        ("计数原理与排列组合", "二项式定理"),
        ("统计与数据分析", "古典概型"),
        ("基本不等式", "导数研究函数"),
        ("一元二次不等式", "函数零点"),
    ]
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
    let mut node_count = 0;
    let mut edge_count = 0;
    let mut concept_keys = std::collections::HashMap::<String, String>::new();
    if subject == "math" {
        for (idx, concept) in math_concept_catalog().iter().enumerate() {
            let source = rows.iter().find(|row| {
                let text = row.get::<String, _>("chunk_text");
                concept
                    .keywords
                    .iter()
                    .any(|keyword| text.contains(keyword))
            });
            let Some(r) = source else { continue };
            let text = r.get::<String, _>("chunk_text");
            let file = r.get::<String, _>("file_name");
            let key = format!("math-concept-{}", idx + 1);
            let node_id:Uuid=sqlx::query_scalar("INSERT INTO knowledge_graph_nodes(graph_id,node_key,label,chapter,description) VALUES($1,$2,$3,$4,$5) RETURNING id").bind(graph_id).bind(&key).bind(concept.label).bind(concept.chapter).bind(concept.summary).fetch_one(&mut*tx).await?;
            let excerpt = text.chars().take(320).collect::<String>();
            sqlx::query("INSERT INTO knowledge_graph_node_sources(node_id,material_id,chunk_id,file_name,excerpt) VALUES($1,$2,$3,$4,$5)").bind(node_id).bind(r.get::<Uuid,_>("material_id")).bind(r.get::<Uuid,_>("chunk_id")).bind(&file).bind(excerpt).execute(&mut*tx).await?;
            concept_keys.insert(concept.label.to_string(), key);
            node_count += 1;
        }
        for &(source_label, target_label) in math_prerequisites() {
            let (Some(source), Some(target)) = (
                concept_keys.get(source_label),
                concept_keys.get(target_label),
            ) else {
                continue;
            };
            sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,'prerequisite')").bind(graph_id).bind(source).bind(target).execute(&mut*tx).await?;
            edge_count += 1;
        }
        let mut chapter_tail = std::collections::HashMap::<&str, String>::new();
        for concept in math_concept_catalog() {
            let Some(key) = concept_keys.get(concept.label) else {
                continue;
            };
            if let Some(previous) = chapter_tail.insert(concept.chapter, key.clone()) {
                sqlx::query("INSERT INTO knowledge_graph_edges(graph_id,source_key,target_key,relation) VALUES($1,$2,$3,'related')").bind(graph_id).bind(previous).bind(key).execute(&mut*tx).await?;
                edge_count += 1;
            }
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

pub(crate) fn migrate_legacy_math_graphs(state: SharedState) {
    tokio::spawn(async move {
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
