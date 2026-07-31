use super::*;
use bcrypt::{hash as bcrypt_hash, verify as bcrypt_verify, DEFAULT_COST};

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
