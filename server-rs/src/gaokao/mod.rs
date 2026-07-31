use super::*;

fn question_row(
    row: sqlx::postgres::PgRow,
    question_assets: &std::collections::HashMap<String, Value>,
) -> Result<Value, sqlx::Error> {
    let solution: Value = row.try_get("solution")?;
    let metadata: Value = row.try_get("metadata")?;
    let subject_key: String = row.try_get("subjectKey")?;
    let question_type: Option<String> = row.try_get("questionType")?;
    let difficulty: Option<String> = row.try_get("difficulty")?;
    let source_type: String = row.try_get("sourceType")?;
    let prompt: String = row.try_get("prompt")?;
    let flags: Value = row.try_get("flags")?;
    let question_type_label = infer_question_type(&subject_key, question_type.as_deref(), &prompt);
    let source_type_label = source_type_label(&source_type);
    let (materials, stem) = split_reading_material(&subject_key, &prompt, &metadata);
    let solution_status = metadata
        .pointer("/solutionEnrichment/status")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut display_tags = vec![question_type_label.clone(), source_type_label.clone()];
    if let Some(label) = difficulty.as_deref().map(difficulty_label) {
        display_tags.push(label);
    }
    if let Some(status) = solution_status.as_deref().and_then(solution_status_label) {
        display_tags.push(status);
    }
    display_tags.sort();
    display_tags.dedup();

    let mut admin_tags = value_string_vec(&flags);
    admin_tags.push(format!("quality:{}", row.try_get::<String, _>("quality")?));
    admin_tags.push(format!("sourceType:{}", source_type));
    if let Some(status) = metadata.pointer("/cleanup/status").and_then(Value::as_str) {
        admin_tags.push(format!("cleanup:{}", status));
    }
    if let Some(status) = solution_status.as_deref() {
        admin_tags.push(format!("solution:{}", status));
    }
    admin_tags.sort();
    admin_tags.dedup();

    let question_key: String = row.try_get("questionKey")?;
    let images = question_assets
        .get(&question_key)
        .cloned()
        .unwrap_or_else(|| json!([]));
    Ok(json!({
        "id": row.try_get::<Uuid, _>("id")?,
        "questionKey": question_key,
        "year": row.try_get::<Option<i32>, _>("year")?,
        "subjectKey": subject_key,
        "subjectName": row.try_get::<String, _>("subjectName")?,
        "questionNumber": row.try_get::<Option<i32>, _>("questionNumber")?,
        "questionType": question_type,
        "questionTypeLabel": question_type_label,
        "difficulty": difficulty,
        "quality": row.try_get::<String, _>("quality")?,
        "prompt": prompt,
        "stem": stem,
        "materials": materials,
        "images": images,
        "answer": row.try_get::<Option<String>, _>("answer")?,
        "solution": solution,
        "flags": flags,
        "sourceType": source_type,
        "sourceTypeLabel": source_type_label,
        "displayTags": display_tags,
        "adminTags": admin_tags,
        "isHidden": metadata.pointer("/cleanup/status").and_then(Value::as_str) == Some("soft_deleted"),
        "displayComplete": row.try_get::<bool,_>("displayComplete")?,
        "incompleteReason": row.try_get::<Option<String>,_>("incompleteReason")?,
        "metadata": metadata,
        "hasSolution": solution.as_array().map(|items| !items.is_empty()).unwrap_or(false),
        "solutionStatus": solution_status,
        "updatedAt": row.try_get::<DateTime<Utc>, _>("updatedAt")?,
    }))
}

fn value_string_vec(value: &Value) -> Vec<String> {
    match value {
        Value::Array(items) => items
            .iter()
            .filter_map(|item| {
                item.as_str()
                    .or_else(|| item.get("tag").and_then(Value::as_str))
            })
            .map(str::to_string)
            .filter(|item| !item.trim().is_empty())
            .collect(),
        Value::String(item) if !item.trim().is_empty() => vec![item.to_string()],
        _ => Vec::new(),
    }
}

fn infer_question_type(subject_key: &str, raw: Option<&str>, prompt: &str) -> String {
    if let Some(value) = raw.map(str::trim).filter(|value| !value.is_empty()) {
        if value
            .chars()
            .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch))
        {
            return value.to_string();
        }
        let lowered = value.to_ascii_lowercase();
        if lowered.contains("choice") || lowered == "single" || lowered == "multiple" {
            return "选择题".to_string();
        }
        if lowered.contains("fill") || lowered.contains("blank") {
            return "填空题".to_string();
        }
        if lowered.contains("essay")
            || lowered.contains("composition")
            || lowered.contains("writing")
        {
            return "写作题".to_string();
        }
        if lowered.contains("proof") || lowered.contains("solve") || lowered.contains("answer") {
            return "解答题".to_string();
        }
        if lowered.contains("reading") {
            return "阅读理解".to_string();
        }
    }

    if subject_key == "chinese" {
        if prompt.contains("作文") || prompt.contains("写作") {
            return "写作题".to_string();
        }
        if prompt.contains("文言文") || prompt.contains("翻译") {
            return "文言文阅读".to_string();
        }
        if prompt.contains("古诗") || prompt.contains("诗歌") {
            return "古诗文鉴赏".to_string();
        }
        if prompt.contains("阅读") || prompt.contains("材料") {
            return "阅读理解".to_string();
        }
    }
    if prompt.contains("A.") || prompt.contains("A．") || prompt.contains("A、") {
        return "选择题".to_string();
    }
    if prompt.contains("证明") || prompt.contains("求") || prompt.contains("解答") {
        return "解答题".to_string();
    }
    "综合题".to_string()
}

fn difficulty_label(value: &str) -> String {
    match value {
        "easy" => "基础巩固".to_string(),
        "medium" => "迁移应用".to_string(),
        "hard" => "综合创新".to_string(),
        _ => "难度待标注".to_string(),
    }
}

fn source_type_label(value: &str) -> String {
    match value {
        "real" => "真题入库".to_string(),
        "real-docx" => "文档抽取".to_string(),
        "real-pdf-text" => "文本抽取".to_string(),
        "real-ocr" => "扫描识别".to_string(),
        "generated" => "变式训练".to_string(),
        _ => "结构化题库".to_string(),
    }
}

fn solution_status_label(value: &str) -> Option<String> {
    match value {
        "generated" => Some("已生成分步思路".to_string()),
        "needs_review" => Some("需教师复核".to_string()),
        "failed" => Some("题解待补全".to_string()),
        "skipped" => Some("保留原解析".to_string()),
        _ => None,
    }
}

fn split_reading_material(
    subject_key: &str,
    prompt: &str,
    metadata: &Value,
) -> (Vec<Value>, String) {
    if let Some(items) = metadata.get("materials").and_then(Value::as_array) {
        let materials: Vec<Value> = items.to_vec();
        if !materials.is_empty() {
            return (materials, prompt.to_string());
        }
    }
    if subject_key != "chinese" || !(prompt.contains("阅读") || prompt.contains("材料")) {
        return (Vec::new(), prompt.to_string());
    }
    let markers = ["\n（1）", "\n(1)", "\n1．", "\n1.", "\n①"];
    let split_at = markers
        .iter()
        .filter_map(|marker| prompt.find(marker))
        .filter(|index| *index > 120)
        .min();
    if let Some(index) = split_at {
        let material = prompt[..index].trim();
        let stem = prompt[index..].trim();
        if material.len() > 80 && stem.len() > 8 {
            return (
                vec![json!({ "title": "阅读材料", "content": material })],
                stem.to_string(),
            );
        }
    }
    (Vec::new(), prompt.to_string())
}

fn rows_to_values(
    rows: Vec<sqlx::postgres::PgRow>,
    keys: &[&str],
) -> Result<Vec<Value>, sqlx::Error> {
    rows.into_iter()
        .map(|row| {
            let mut map = serde_json::Map::new();
            for key in keys {
                if let Ok(value) = row.try_get::<String, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i32, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<i64, _>(*key) {
                    map.insert((*key).to_string(), json!(value));
                } else if let Ok(value) = row.try_get::<Value, _>(*key) {
                    map.insert((*key).to_string(), value);
                }
            }
            Ok(Value::Object(map))
        })
        .collect()
}

mod assets;
mod attempts;
mod questions;
mod rag;

pub(crate) use assets::*;
pub(crate) use attempts::*;
pub(crate) use questions::*;
pub(crate) use rag::*;
