use super::*;
use serde::Deserialize;

#[derive(Deserialize)]
pub(crate) struct PreferenceInput {
    grade: Option<String>,
    #[serde(default)]
    subjects: Vec<String>,
    #[serde(rename = "defaultProviderId")]
    default_provider_id: Option<Uuid>,
    #[serde(default, rename = "completeOnboarding")]
    complete_onboarding: bool,
}

#[derive(Deserialize)]
pub(crate) struct ConversationInput {
    title: Option<String>,
    subject: Option<String>,
    grade: Option<String>,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct ConversationPatch {
    title: String,
}

#[derive(Deserialize)]
pub(crate) struct GraphInput {
    subject: String,
    #[serde(rename = "providerConfigId")]
    provider_config_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub(crate) struct GraphParams {
    subject: Option<String>,
}

mod bootstrap;
mod conversations;
mod graphs;
mod password;
mod preferences;
mod schema;
mod seeds;

pub(crate) use bootstrap::*;
pub(crate) use conversations::*;
pub(crate) use graphs::*;
pub(crate) use password::*;
pub(crate) use preferences::*;
pub(crate) use schema::ensure_schema;
pub(crate) use seeds::*;
