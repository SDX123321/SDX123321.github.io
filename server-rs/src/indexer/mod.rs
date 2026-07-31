use super::*;
use std::path::PathBuf;

#[derive(Clone)]
pub(crate) struct IndexOptions {
    pub(crate) domain: String,
    pub(crate) root: PathBuf,
    pub(crate) rebuild: bool,
    pub(crate) missing_only: bool,
    pub(crate) retry_failed: bool,
    pub(crate) catalog_only: bool,
    pub(crate) file: Option<PathBuf>,
    pub(crate) course: Option<String>,
    pub(crate) subject: Option<String>,
    pub(crate) limit: Option<usize>,
}
struct IndexStats {
    discovered: i32,
    processed: i32,
    deduplicated: i32,
    extracted: i32,
    embedded: i32,
    failed: i32,
}

mod chunks;
mod classify;
mod embed;
mod extract;
mod run;

pub(crate) use chunks::*;
pub(crate) use classify::*;
pub(crate) use embed::*;
pub(crate) use extract::*;
pub(crate) use run::*;
