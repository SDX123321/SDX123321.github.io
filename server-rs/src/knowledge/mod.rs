use super::*;
use serde::Deserialize;
use std::collections::HashSet;

fn stable_concept_key(term: &str) -> String {
    format!(
        "concept-{}",
        &hex::encode(Sha256::digest(term.as_bytes()))[..24]
    )
}

async fn optional_user(
    state: &SharedState,
    headers: &HeaderMap,
) -> Result<Option<UserSession>, ApiError> {
    match auth_user(state, headers).await {
        Ok(user) => Ok(Some(user)),
        Err(error) if error.status == StatusCode::UNAUTHORIZED => Ok(None),
        Err(error) => Err(error),
    }
}

#[derive(Deserialize)]
pub(crate) struct KnowledgeParams {
    #[serde(rename = "domainId")]
    domain_id: Option<Uuid>,
    #[serde(rename = "domainKey")]
    domain_key: Option<String>,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
    q: Option<String>,
    limit: Option<i64>,
    cursor: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SearchInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
    query: String,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct GraphInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    #[serde(rename = "subjectId")]
    subject_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct SuggestionParams {
    subject: Option<String>,
    grade: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub(crate) struct SuggestionRunInput {
    subject: String,
    grade: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct WebResearchInput {
    #[serde(rename = "domainId")]
    domain_id: Uuid,
    subject: String,
}

#[derive(Deserialize)]
pub(crate) struct GraphPatch {
    nodes: Option<Vec<NodePatch>>,
    edges: Option<Vec<EdgePatch>>,
}

#[derive(Deserialize)]
pub(crate) struct NodePatch {
    key: String,
    label: String,
    summary: Option<String>,
    aliases: Option<Vec<String>>,
    tags: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub(crate) struct EdgePatch {
    source: String,
    target: String,
    relation: String,
}

#[derive(Deserialize)]
pub(crate) struct NodeStateInput {
    mastery: Option<i32>,
    favorite: Option<bool>,
    note: Option<String>,
}

async fn resolve_domain(state: &SharedState, p: &KnowledgeParams) -> Result<Uuid, ApiError> {
    if let Some(id) = p.domain_id {
        return Ok(id);
    }
    let key = p.domain_key.as_deref().ok_or_else(ApiError::bad_request)?;
    sqlx::query_scalar("SELECT id FROM content_domains WHERE domain_key=$1 AND active")
        .bind(key)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(ApiError::bad_request)
}

fn terms(text: &str) -> Vec<String> {
    let stop: HashSet<&str> = [
        "一个", "这种", "可以", "因为", "所以", "以及", "进行", "相关", "问题", "答案", "解析",
        "the", "and", "with", "from",
    ]
    .into_iter()
    .collect();
    text.split(|c: char| !(c.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(&c)))
        .filter_map(|v| {
            let v = v.trim().to_lowercase();
            ((2..=24).contains(&v.chars().count()) && !stop.contains(v.as_str())).then_some(v)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::stable_concept_key;

    #[test]
    fn concept_keys_are_stable_across_graph_rankings() {
        assert_eq!(
            stable_concept_key("傅里叶变换"),
            stable_concept_key("傅里叶变换")
        );
        assert_ne!(
            stable_concept_key("傅里叶变换"),
            stable_concept_key("拉普拉斯变换")
        );
    }
}

mod graphs;
mod materials;
mod schema;
mod suggestions;
mod web_research;

pub(crate) use graphs::*;
pub(crate) use materials::*;
pub(crate) use schema::ensure_schema;
pub(crate) use suggestions::*;
pub(crate) use web_research::*;
