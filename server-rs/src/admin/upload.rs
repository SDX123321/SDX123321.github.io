use super::*;
use axum::extract::Multipart;
use std::path::{Component, Path};
use tokio::fs;

fn safe_file_name(value: &str) -> Option<String> {
    let name = Path::new(value)
        .file_name()?
        .to_string_lossy()
        .trim()
        .to_string();
    if name.is_empty()
        || Path::new(&name)
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        None
    } else {
        Some(name)
    }
}

pub(crate) async fn upload_material(
    State(state): State<SharedState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let admin = require_admin(&state, &headers).await?;
    let mut file: Option<(String, Vec<u8>)> = None;
    let mut metadata = serde_json::Map::new();
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::bad_request())?
    {
        let name = field.name().unwrap_or_default().to_string();
        if name == "file" {
            let filename = safe_file_name(field.file_name().unwrap_or("upload.bin"))
                .ok_or_else(ApiError::bad_request)?;
            let bytes = field.bytes().await.map_err(|_| ApiError::bad_request())?;
            if bytes.len() > 50 * 1024 * 1024 {
                return Err(ApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "file_too_large",
                ));
            }
            file = Some((filename, bytes.to_vec()));
        } else if matches!(
            name.as_str(),
            "domain" | "course" | "subject" | "grade" | "year" | "region" | "kind"
        ) {
            metadata.insert(name, Value::String(field.text().await.unwrap_or_default()));
        }
    }
    let (filename, bytes) = file.ok_or_else(ApiError::bad_request)?;
    let ext = Path::new(&filename)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(
        ext.as_str(),
        "doc" | "docx" | "pdf" | "png" | "jpg" | "jpeg" | "mp3" | "wav" | "zip"
    ) {
        return Err(ApiError::bad_request());
    }
    let upload_id = Uuid::new_v4();
    let relative = Path::new("_uploads")
        .join(upload_id.to_string())
        .join(&filename);
    let target = state.material_root.join(&relative);
    fs::create_dir_all(target.parent().ok_or_else(ApiError::server)?)
        .await
        .map_err(|_| ApiError::server())?;
    fs::write(&target, &bytes)
        .await
        .map_err(|_| ApiError::server())?;
    let relative_text = relative.to_string_lossy().replace('\\', "/");
    sqlx::query("INSERT INTO material_uploads(id,requested_by,file_name,relative_path,size_bytes,status,metadata) VALUES($1,$2,$3,$4,$5,'indexing',$6)")
        .bind(upload_id).bind(admin.id).bind(&filename).bind(&relative_text).bind(bytes.len() as i64).bind(Value::Object(metadata.clone())).execute(&state.db).await?;
    let target_clone = target.clone();
    let state_clone = state.clone();
    let domain_str = metadata
        .get("domain")
        .and_then(Value::as_str)
        .unwrap_or("high-school")
        .to_string();
    tokio::spawn(async move {
        let run_id = Uuid::new_v4();
        let source_root = if domain_str == "university" {
            state_clone.project_root.join("src/content")
        } else {
            state_clone.material_root.clone()
        };
        let run_setup = sqlx::query(
            "INSERT INTO material_index_runs(id,source_root,status) VALUES($1,$2,'running')",
        )
        .bind(run_id)
        .bind(source_root.to_string_lossy().to_string())
        .execute(&state_clone.db)
        .await;

        if run_setup.is_ok() {
            let options = crate::indexer::IndexOptions {
                domain: domain_str,
                root: source_root,
                rebuild: false,
                missing_only: false,
                retry_failed: false,
                catalog_only: false,
                file: Some(target_clone),
                course: None,
                subject: None,
                limit: None,
            };
            let (status, error) =
                match crate::indexer::run(state_clone.clone(), run_id, options).await {
                    Ok(_) => ("indexed", None),
                    Err(e) => ("failed", Some(format!("indexer error: {:?}", e))),
                };
            let _ = sqlx::query(
                "UPDATE material_uploads SET status=$2,error=$3,updated_at=now() WHERE id=$1",
            )
            .bind(upload_id)
            .bind(status)
            .bind(error)
            .execute(&state_clone.db)
            .await;
        } else {
            let _ = sqlx::query(
                "UPDATE material_uploads SET status='failed',error='Failed to initialize index run',updated_at=now() WHERE id=$1",
            )
            .bind(upload_id)
            .execute(&state_clone.db)
            .await;
        }
    });
    Ok((
        StatusCode::ACCEPTED,
        Json(
            json!({"upload":{"id":upload_id,"fileName":filename,"sizeBytes":bytes.len(),"status":"indexing"}}),
        ),
    ))
}

#[cfg(test)]
mod tests {
    use super::safe_file_name;

    #[test]
    fn strips_upload_paths_to_a_file_name() {
        assert_eq!(safe_file_name("paper.pdf").as_deref(), Some("paper.pdf"));
        assert_eq!(safe_file_name("../paper.pdf").as_deref(), Some("paper.pdf"));
        assert!(safe_file_name("").is_none());
    }
}
