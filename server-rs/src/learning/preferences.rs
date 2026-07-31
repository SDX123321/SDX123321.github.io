use super::*;

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
