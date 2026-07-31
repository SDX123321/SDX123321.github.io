use super::*;
use crate::admin::require_admin;
use axum::extract::Path as AxumPath;

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
