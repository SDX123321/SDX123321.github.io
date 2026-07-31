use super::*;

pub(crate) async fn load_question_assets(
    project_root: &std::path::Path,
) -> std::collections::HashMap<String, Value> {
    let path = project_root.join("src/data/gaokao-question-assets.json");
    let Ok(raw) = tokio::fs::read_to_string(path).await else {
        return std::collections::HashMap::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return std::collections::HashMap::new();
    };
    value
        .get("questions")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            Some((
                item.get("questionKey")?.as_str()?.to_string(),
                item.get("images").cloned().unwrap_or_else(|| json!([])),
            ))
        })
        .collect()
}

pub(crate) async fn audit_question_completeness(
    db: &PgPool,
    project_root: &std::path::Path,
    assets: &std::collections::HashMap<String, Value>,
) -> anyhow::Result<()> {
    let rows = sqlx::query("SELECT id,question_key,prompt FROM gaokao_questions")
        .fetch_all(db)
        .await?;
    let asset_root = project_root.join("public/gaokao-assets/images");
    let mut ids = Vec::with_capacity(rows.len());
    let mut complete = Vec::with_capacity(rows.len());
    let mut reason_values = Vec::with_capacity(rows.len());
    for row in rows {
        let id: Uuid = row.get("id");
        let key: String = row.get("question_key");
        let prompt: String = row.get("prompt");
        let image_required = ["如图", "图中", "下图", "示意图", "图表", "看图", "据图"]
            .iter()
            .any(|marker| prompt.contains(marker));
        let images = assets
            .get(&key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut reasons = Vec::new();
        if prompt.trim().chars().count() < 12 {
            reasons.push("prompt_incomplete");
        }
        if image_required && images.is_empty() {
            reasons.push("required_image_missing");
        }
        for image in &images {
            if image.get("needsReview").and_then(Value::as_bool) == Some(true) {
                reasons.push("image_needs_review");
            }
            let url = image.get("url").and_then(Value::as_str).unwrap_or_default();
            let name = url.rsplit('/').next().unwrap_or_default();
            let supported = ["png", "jpg", "jpeg", "webp", "gif"]
                .iter()
                .any(|ext| name.to_ascii_lowercase().ends_with(ext));
            if !supported {
                reasons.push("unsupported_image");
            }
            if name.is_empty() || tokio::fs::metadata(asset_root.join(name)).await.is_err() {
                reasons.push("image_file_missing");
            }
        }
        reasons.sort();
        reasons.dedup();
        ids.push(id);
        complete.push(reasons.is_empty());
        reason_values.push(reasons.join(","));
    }
    sqlx::query(r#"UPDATE gaokao_questions q SET display_complete=v.complete,incomplete_reason=NULLIF(v.reason,'')
      FROM (SELECT * FROM unnest($1::uuid[],$2::bool[],$3::text[]) AS t(id,complete,reason)) v WHERE q.id=v.id"#)
        .bind(ids).bind(complete).bind(reason_values).execute(db).await?;
    Ok(())
}
