use super::*;
use axum::extract::Path as AxumPath;

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

pub(crate) async fn conversation_reasoning_context(
    state: &SharedState,
    user_id: Uuid,
    conversation_id: Uuid,
) -> Result<String, ApiError> {
    own_conversation(state, conversation_id, user_id).await?;
    let rows = sqlx::query(
        "SELECT role,content FROM chat_messages WHERE conversation_id=$1 AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 8",
    )
    .bind(conversation_id)
    .fetch_all(&state.db)
    .await?;
    let mut messages = rows
        .into_iter()
        .map(|row| {
            let role = row.get::<String, _>("role");
            let content = row
                .get::<String, _>("content")
                .chars()
                .take(3000)
                .collect::<String>();
            format!(
                "{}：{}",
                if role == "user" { "用户" } else { "助教" },
                content
            )
        })
        .collect::<Vec<_>>();
    messages.reverse();
    Ok(messages.join("\n\n"))
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
