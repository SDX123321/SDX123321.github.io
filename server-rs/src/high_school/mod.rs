use super::*;
use serde::Deserialize;

#[derive(Debug, Deserialize, Serialize, Default)]
pub(crate) struct MaterialParams {
    q: Option<String>,
    grade: Option<String>,
    #[serde(skip)]
    grades: Option<Vec<String>>,
    subject: Option<String>,
    year: Option<i32>,
    region: Option<String>,
    kind: Option<String>,
    cursor: Option<i64>,
    limit: Option<i64>,
    #[serde(rename = "domainId")]
    domain_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct AnswerInput {
    question: String,
    grade: Option<String>,
    grades: Option<Vec<String>>,
    subject: Option<String>,
    year: Option<i32>,
    region: Option<String>,
    kind: Option<String>,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
    #[serde(rename = "conversationId")]
    conversation_id: Option<Uuid>,
    #[serde(rename = "domainId")]
    pub(crate) domain_id: Option<Uuid>,
}

#[derive(Clone, Serialize)]
pub(crate) struct SearchMatch {
    pub(crate) id: Uuid,
    #[serde(rename = "materialId")]
    pub(crate) material_id: Uuid,
    #[serde(rename = "fileName")]
    pub(crate) file_name: String,
    pub(crate) subject: String,
    pub(crate) grade: String,
    pub(crate) year: Option<i32>,
    region: String,
    kind: String,
    #[serde(rename = "chunkIndex")]
    chunk_index: i32,
    pub(crate) text: String,
    score: f64,
}

mod answer;
mod files;
mod index_runs;
mod materials;
mod schema;
mod search;

pub(crate) use answer::*;
pub(crate) use files::*;
pub(crate) use index_runs::*;
pub(crate) use materials::*;
pub(crate) use schema::ensure_schema;
pub(crate) use search::*;
