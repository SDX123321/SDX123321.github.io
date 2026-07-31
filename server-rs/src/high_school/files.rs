use axum::{
    body::Body,
    extract::Path as AxumPath,
    http::{header, HeaderValue, StatusCode},
    response::Response,
};
use sqlx::Row;
use std::path::Path;
use tokio::{
    fs::File,
    io::{AsyncReadExt, AsyncSeekExt, SeekFrom},
};
use tokio_util::io::ReaderStream;

use crate::{auth_user, ApiError, HeaderMap, SharedState, State, Uuid};

pub(crate) async fn download(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    auth_user(&state, &headers).await?;
    serve_material_file(&state, id, &headers, false).await
}

pub(crate) async fn file_preview(
    AxumPath(id): AxumPath<Uuid>,
    State(state): State<SharedState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    auth_user(&state, &headers).await?;
    serve_material_file(&state, id, &headers, true).await
}

async fn serve_material_file(
    state: &SharedState,
    id: Uuid,
    headers: &HeaderMap,
    inline: bool,
) -> Result<Response, ApiError> {
    let row = sqlx::query(r#"SELECT m.file_name,m.mime_type,COALESCE(p.storage_path,p.relative_path) storage_path FROM materials m JOIN material_paths p ON p.material_id=m.id
        WHERE m.id=$1 ORDER BY p.is_canonical DESC,p.relative_path LIMIT 1"#).bind(id).fetch_optional(&state.db).await?
        .ok_or_else(|| ApiError::new(StatusCode::NOT_FOUND,"material_not_found"))?;
    let file_name: String = row.try_get("file_name")?;
    let mime: String = row.try_get("mime_type")?;
    let relative: String = row.try_get("storage_path")?;
    let root = state
        .material_root
        .canonicalize()
        .map_err(|_| ApiError::server())?;
    let target = root
        .join(Path::new(&relative))
        .canonicalize()
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "file_missing"))?;
    if !target.starts_with(&root) || !target.is_file() {
        return Err(ApiError::forbidden());
    }
    let mut file = File::open(&target)
        .await
        .map_err(|_| ApiError::new(StatusCode::NOT_FOUND, "file_missing"))?;
    let size = file.metadata().await.map_err(|_| ApiError::server())?.len();
    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| parse_range(v, size));
    let (start, end, status) = range
        .map(|(s, e)| (s, e, StatusCode::PARTIAL_CONTENT))
        .unwrap_or((0, size.saturating_sub(1), StatusCode::OK));
    if start > 0 {
        file.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| ApiError::server())?;
    }
    let length = end.saturating_sub(start) + 1;
    let stream = ReaderStream::new(file.take(length));
    let mut response = Response::new(Body::from_stream(stream));
    *response.status_mut() = status;
    let h = response.headers_mut();
    h.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    h.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&length.to_string()).unwrap(),
    );
    h.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    h.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!(
            "{}; filename*=UTF-8''{}",
            if inline { "inline" } else { "attachment" },
            urlencoding::encode(&file_name)
        ))
        .unwrap(),
    );
    h.insert(
        header::HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    if status == StatusCode::PARTIAL_CONTENT {
        h.insert(
            header::CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{size}")).unwrap(),
        );
    }
    Ok(response)
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let raw = value.strip_prefix("bytes=")?.split(',').next()?;
    let (a, b) = raw.split_once('-')?;
    let start = a.parse::<u64>().ok()?;
    let end = if b.is_empty() {
        size.saturating_sub(1)
    } else {
        b.parse::<u64>().ok()?.min(size.saturating_sub(1))
    };
    (start <= end && start < size).then_some((start, end))
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn parses_bounded_and_open_ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=900-1200", 1000), Some((900, 999)));
    }

    #[test]
    fn rejects_invalid_ranges() {
        assert_eq!(parse_range("items=0-10", 100), None);
        assert_eq!(parse_range("bytes=100-120", 100), None);
        assert_eq!(parse_range("bytes=20-10", 100), None);
    }
}
