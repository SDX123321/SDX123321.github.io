use std::path::{Path, PathBuf};
use std::fs::File as StdFile;
use std::io::{self, Read};
use std::sync::OnceLock;
use tokio::fs::{self, File};
use tokio::io::AsyncReadExt;
use sqlx::{PgPool, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use regex::Regex;
use walkdir::WalkDir;
use zip::ZipArchive;
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use lopdf::Document as PdfDocument;
use sha2::{Digest, Sha256};
use crate::SharedState;

static REGEX_SUBJECTS: OnceLock<Vec<(&'static str, Regex)>> = OnceLock::new();
static REGEX_YEAR: OnceLock<Regex> = OnceLock::new();
static HTML_CLEANERS: OnceLock<(Regex, Regex, Regex)> = OnceLock::new();
static RE_LINE_SPACES: OnceLock<Regex> = OnceLock::new();
static RE_MULTIPLE_NEWLINES: OnceLock<Regex> = OnceLock::new();

fn get_subjects_regex() -> &'static [(&'static str, Regex)] {
    REGEX_SUBJECTS.get_or_init(|| {
        let subjects = [
            ("chinese", "语文"),
            ("math", "数学"),
            ("english", "英语|听力"),
            ("physics", "物理"),
            ("chemistry", "化学"),
            ("biology", "生物"),
            ("politics", "政治|思想政治"),
            ("history", "历史"),
            ("geography", "地理"),
        ];
        subjects.iter().map(|(k, p)| (*k, Regex::new(p).unwrap())).collect()
    })
}

fn get_year_regex() -> &'static Regex {
    REGEX_YEAR.get_or_init(|| Regex::new(r"20(1[7-9]|2[0-6])").unwrap())
}

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

fn classify(relative_path: &str, ext: &str) -> (String, String, Option<i32>, String, String) {
    let text = relative_path.replace('\\', "/");
    
    // Grade matching
    let grade = if text.contains("高一") {
        "grade-1"
    } else if text.contains("高二") {
        "grade-2"
    } else if text.contains("高三") || text.contains("高考") {
        "grade-3"
    } else {
        "other"
    };

    // Subject matching
    let mut subject = "other";
    for &(key, ref re) in get_subjects_regex() {
        if re.is_match(&text) {
            subject = key;
            break;
        }
    }

    // Year detection
    let year_re = get_year_regex();
    let base_name = Path::new(&text).file_name().and_then(|n| n.to_str()).unwrap_or("");
    let mut year = None;
    if let Some(m) = year_re.find_iter(base_name).map(|m| m.as_str().parse::<i32>().unwrap_or(0)).max() {
        if m > 0 {
            year = Some(m);
        }
    }
    if year.is_none() {
        let segments: Vec<&str> = text.split('/').collect();
        if segments.len() > 1 {
            for segment in segments.iter().rev().skip(1) {
                if let Some(m) = year_re.find_iter(segment).map(|m| m.as_str().parse::<i32>().unwrap_or(0)).max() {
                    if m > 0 {
                        year = Some(m);
                        break;
                    }
                }
            }
        }
    }

    // Region matching
    let regions = [
        "南京", "苏州", "无锡", "常州", "南通", "扬州", "镇江", "泰州", "盐城", "淮安",
        "宿迁", "徐州", "连云港", "江苏", "北京", "上海", "天津", "重庆", "浙江", "山东",
        "广东", "福建", "安徽", "湖北", "湖南", "河北", "河南", "四川", "陕西", "山西",
        "江西", "辽宁", "吉林", "黑龙江", "广西", "贵州", "云南", "甘肃", "青海", "宁夏",
        "新疆", "西藏", "海南", "内蒙古",
    ];
    let mut region = "other";
    for r in regions {
        if text.contains(r) {
            region = r;
            break;
        }
    }
    if region == "other" && text.contains("全国") {
        region = "全国";
    }

    // Kind matching
    let mut kind = "other";
    if text.contains("答案") || text.contains("解析") || text.contains("详解") {
        kind = "answer";
    } else if text.contains("答题卡") || text.contains("答卷纸") {
        kind = "answer-sheet";
    } else if text.contains("听力") || ext == ".mp3" || ext == ".wav" {
        kind = "audio";
    } else if text.contains("试卷") || text.contains("试题") || text.contains("真题") ||
              text.contains("模拟") || text.contains("联考") || text.contains("月考") ||
              text.contains("期中") || text.contains("期末") || text.contains("高考") {
        kind = "paper";
    } else if ext == ".jpg" || ext == ".jpeg" || ext == ".png" {
        kind = "image";
    } else if ext == ".zip" {
        kind = "archive";
    }

    (grade.to_string(), subject.to_string(), year, region.to_string(), kind.to_string())
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        ".doc" => "application/msword",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".pdf" => "application/pdf",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".jpg" | ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".zip" => "application/zip",
        ".html" => "text/html",
        _ => "application/octet-stream",
    }
}

async fn compute_sha256(path: &Path) -> io::Result<String> {
    let mut file = File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];
    loop {
        let n = file.read(&mut buffer).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn compact(text: &str) -> String {
    let mut result = text.replace('\0', "");
    result = result.replace("\r\n", "\n");
    
    let re_line_spaces = RE_LINE_SPACES.get_or_init(|| Regex::new(r"[ \t]+\n").unwrap());
    let result = re_line_spaces.replace_all(&result, "\n").into_owned();

    let re_multiple_newlines = RE_MULTIPLE_NEWLINES.get_or_init(|| Regex::new(r"\n{3,}").unwrap());
    let result = re_multiple_newlines.replace_all(&result, "\n\n").into_owned();

    result.trim().to_string()
}

fn chunks(text: &str, size: usize, overlap: usize) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + size).min(chars.len());
        let slice: String = chars[start..end].iter().collect();
        let value = compact(&slice);
        if !value.is_empty() {
            out.push(value);
        }
        if start + size >= chars.len() {
            break;
        }
        start += size - overlap;
    }
    out
}

fn clean_html(html: &str) -> String {
    let (re_script, re_style, re_tags) = HTML_CLEANERS.get_or_init(|| {
        (
            Regex::new(r"(?i)<script[\s\S]*?</script>").unwrap(),
            Regex::new(r"(?i)<style[\s\S]*?</style>").unwrap(),
            Regex::new(r"<[^>]+>").unwrap(),
        )
    });

    let s1 = re_script.replace_all(html, " ");
    let s2 = re_style.replace_all(&s1, " ");
    let s3 = re_tags.replace_all(&s2, " ");
    s3.replace("&nbsp;", " ").replace("&amp;", "&")
}

fn extract_docx(file_path: &Path) -> anyhow::Result<String> {
    let file = StdFile::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut doc_file = archive.by_name("word/document.xml")?;
    let mut xml_data = String::new();
    doc_file.read_to_string(&mut xml_data)?;

    let mut reader = XmlReader::from_str(&xml_data);
    reader.config_mut().trim_text(true);
    let mut txt = String::new();
    let mut buf = Vec::new();
    let mut inside_t = false;
    let mut math_depth: i32 = 0;
    let mut last_was_math = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"t" {
                    inside_t = true;
                } else if name.as_ref() == b"oMath" || name.as_ref() == b"oMathPara" {
                    math_depth += 1;
                    if !last_was_math {
                        txt.push_str("[公式]");
                        last_was_math = true;
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"t" {
                    inside_t = false;
                } else if name.as_ref() == b"oMath" || name.as_ref() == b"oMathPara" {
                    math_depth = math_depth.saturating_sub(1);
                } else if name.as_ref() == b"p" {
                    txt.push('\n');
                    last_was_math = false;
                }
            }
            Ok(Event::Empty(ref e)) => {
                let name = e.local_name();
                if name.as_ref() == b"tab" {
                    txt.push('\t');
                    last_was_math = false;
                } else if name.as_ref() == b"br" {
                    txt.push('\n');
                    last_was_math = false;
                } else if name.as_ref() == b"p" {
                    txt.push('\n');
                    last_was_math = false;
                }
            }
            Ok(Event::Text(ref e)) => {
                if inside_t {
                    if let Ok(val) = e.unescape() {
                        txt.push_str(&val);
                        last_was_math = false;
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    
    Ok(txt)
}

async fn extract_doc(file_path: &Path, cache_root: &Path) -> anyhow::Result<String> {
    let upload_id = Uuid::new_v4();
    let temp_dir = cache_root.join(format!("doc-{}", upload_id));
    let profile_dir = cache_root.join(format!("lo-profile-{}", upload_id));
    fs::create_dir_all(&temp_dir).await?;
    fs::create_dir_all(&profile_dir).await?;

    let soffice_path = std::env::var("LIBREOFFICE_PATH").unwrap_or_else(|_| "soffice".to_string());
    let timeout_ms = std::env::var("LIBREOFFICE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30_000);

    let profile_url = format!("file:///{}", profile_dir.to_string_lossy().replace('\\', "/"));

    let mut cmd = tokio::process::Command::new(&soffice_path);
    cmd.arg(format!("-env:UserInstallation={}", profile_url))
        .arg("--headless")
        .arg("--convert-to")
        .arg("docx")
        .arg("--outdir")
        .arg(&temp_dir)
        .arg(file_path);

    let child = cmd.spawn()?;
    
    let result = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        child.wait_with_output(),
    )
    .await;

    let output_docx = match result {
        Ok(Ok(out)) if out.status.success() => {
            let stem = file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
            Some(temp_dir.join(format!("{}.docx", stem)))
        }
        _ => None,
    };

    let text = if let Some(path) = output_docx {
        if path.exists() {
            extract_docx(&path).unwrap_or_default()
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let _ = fs::remove_dir_all(&temp_dir).await;
    let _ = fs::remove_dir_all(&profile_dir).await;

    Ok(text)
}

fn extract_pdf(file_path: &Path) -> anyhow::Result<String> {
    let doc = PdfDocument::load(file_path)?;
    let mut text = String::new();
    let pages = doc.get_pages();
    for page_num in pages.keys() {
        if let Ok(page_text) = doc.extract_text(&[*page_num]) {
            text.push_str(&page_text);
            text.push('\n');
        }
    }
    Ok(text)
}

async fn extract_text(file_path: &Path, ext: &str, cache_root: &Path) -> anyhow::Result<String> {
    if ext == ".html" {
        let html = fs::read_to_string(file_path).await?;
        return Ok(compact(&clean_html(&html)));
    }
    if ext == ".docx" {
        return Ok(compact(&extract_docx(file_path)?));
    }
    if ext == ".doc" {
        return extract_doc(file_path, cache_root).await;
    }
    if ext == ".pdf" {
        return Ok(compact(&extract_pdf(file_path)?));
    }
    Ok(String::new())
}

async fn get_ollama_embeddings(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
    inputs: Vec<String>,
) -> anyhow::Result<Vec<Vec<f32>>> {
    let url = format!("{}/api/embed", base_url.trim_end_matches('/'));
    
    #[derive(Serialize)]
    struct EmbedRequest<'a> {
        model: &'a str,
        input: Vec<String>,
    }

    #[derive(Deserialize)]
    struct EmbedResponse {
        embeddings: Vec<Vec<f32>>,
    }

    let response = client
        .post(&url)
        .json(&EmbedRequest { model, input: inputs })
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let err_text = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("Ollama embedding failed with status {}: {}", status, err_text));
    }

    let data = response.json::<EmbedResponse>().await?;
    Ok(data.embeddings)
}

async fn update_run_stats(
    pool: &PgPool,
    run_id: Uuid,
    stats: &IndexStats,
    status: &str,
    summary: Value,
) -> anyhow::Result<()> {
    sqlx::query(
        r#"UPDATE material_index_runs SET status=$2,discovered=$3,deduplicated=$4,extracted=$5,embedded=$6,failed=$7,remaining=$8,summary=$9,
        started_at=COALESCE(started_at,now()),finished_at=CASE WHEN $2 IN ('completed','failed') THEN now() ELSE NULL END,updated_at=now() WHERE id=$1"#
    )
    .bind(run_id)
    .bind(status)
    .bind(stats.discovered)
    .bind(stats.deduplicated)
    .bind(stats.extracted)
    .bind(stats.embedded)
    .bind(stats.failed)
    .bind((stats.discovered - stats.processed).max(0))
    .bind(summary)
    .execute(pool)
    .await?;
    Ok(())
}

async fn check_run_status(pool: &PgPool, run_id: Uuid) -> anyhow::Result<String> {
    let status: String = sqlx::query_scalar("SELECT status FROM material_index_runs WHERE id=$1")
        .bind(run_id)
        .fetch_one(pool)
        .await?;
    Ok(status)
}

async fn handle_pause_cancel(pool: &PgPool, run_id: Uuid) -> anyhow::Result<bool> {
    loop {
        let status = check_run_status(pool, run_id).await?;
        if status == "cancelled" {
            return Ok(true);
        }
        if status == "paused" {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            continue;
        }
        break;
    }
    Ok(false)
}

async fn rebuild_generation(
    pool: &PgPool,
    run_id: Uuid,
    domain_id: Uuid,
    options: &IndexOptions,
    ollama_base: &str,
    ollama_model: &str,
    ollama_dimensions: usize,
    http_client: &reqwest::Client,
) -> anyhow::Result<()> {
    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*)::int count FROM material_chunks c JOIN materials m ON m.id=c.material_id WHERE m.domain_id=$1"
    )
    .bind(domain_id)
    .fetch_one(pool)
    .await?;

    let row = sqlx::query(
        "INSERT INTO embedding_generations(domain_id,model,dimensions,total_chunks,status) VALUES($1,$2,$3,$4,'building') RETURNING id"
    )
    .bind(domain_id)
    .bind(ollama_model)
    .bind(ollama_dimensions as i32)
    .bind(total as i32)
    .fetch_one(pool)
    .await?;
    
    let generation_id: Uuid = row.try_get("id")?;

    sqlx::query(
        r#"UPDATE material_index_runs SET generation_id=$2,status='running',discovered=$3,remaining=$3,
        started_at=COALESCE(started_at,now()),updated_at=now(),summary=$4 WHERE id=$1"#
    )
    .bind(run_id)
    .bind(generation_id)
    .bind(total as i32)
    .bind(json!({ "phase": "embedding", "model": ollama_model, "dimensions": ollama_dimensions, "domain": options.domain }))
    .execute(pool)
    .await?;

    let mut embedded = 0;
    let mut failed = 0;
    let started = std::time::Instant::now();

    loop {
        if handle_pause_cancel(pool, run_id).await? {
            return Err(anyhow::anyhow!("index_cancelled"));
        }

        let rows = sqlx::query(
            r#"SELECT c.id, c.chunk_text, m.file_name FROM material_chunks c JOIN materials m ON m.id=c.material_id
            WHERE m.domain_id=$1 AND NOT EXISTS(
              SELECT 1 FROM material_chunk_embeddings e WHERE e.generation_id=$2 AND e.chunk_id=c.id)
            ORDER BY c.id LIMIT 8"#
        )
        .bind(domain_id)
        .bind(generation_id)
        .fetch_all(pool)
        .await?;

        if rows.is_empty() {
            break;
        }

        let chunk_texts: Vec<String> = rows.iter().map(|r| r.get::<String, _>("chunk_text")).collect();
        let file_name = rows.last().map(|r| r.get::<String, _>("file_name")).unwrap_or_default();

        match get_ollama_embeddings(http_client, ollama_base, ollama_model, chunk_texts).await {
            Ok(vectors) => {
                let mut tx = pool.begin().await?;
                for (i, row) in rows.iter().enumerate() {
                    let chunk_id: Uuid = row.get("id");
                    let vec_str = format!("[{}]", vectors[i].iter().map(|v| v.to_string()).collect::<Vec<String>>().join(","));
                    
                    sqlx::query(
                        "INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding) VALUES($1,$2,$3::vector) ON CONFLICT DO NOTHING"
                    )
                    .bind(generation_id)
                    .bind(chunk_id)
                    .bind(&vec_str)
                    .execute(&mut *tx)
                    .await?;
                }
                tx.commit().await?;
                embedded += rows.len() as i32;
            }
            Err(e) => {
                failed += rows.len() as i32;
                for row in &rows {
                    let chunk_id: Uuid = row.get("id");
                    sqlx::query(
                        r#"INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding)
                        SELECT $1,id,embedding FROM material_chunks WHERE id=$2 AND embedding IS NOT NULL
                        ON CONFLICT DO NOTHING"#
                    )
                    .bind(generation_id)
                    .bind(chunk_id)
                    .execute(pool)
                    .await?;
                }
                sqlx::query("UPDATE embedding_generations SET error=$2,updated_at=now() WHERE id=$1")
                    .bind(generation_id)
                    .bind(format!("Error: {}", e).get(0..1000).unwrap_or(&format!("Error: {}", e)))
                    .execute(pool)
                    .await?;

                if total > 0 && (failed as f64 / total as f64) > 0.005 {
                    return Err(e);
                }
            }
        }

        let processed = embedded + failed;
        let elapsed_secs = started.elapsed().as_secs().max(1);
        let rate = embedded as f64 / elapsed_secs as f64;
        let eta_secs = if rate > 0.0 { Some(((total as i32 - processed) as f64 / rate).ceil() as i32) } else { None };

        sqlx::query("UPDATE embedding_generations SET embedded_chunks=$2,failed_chunks=$3,updated_at=now() WHERE id=$1")
            .bind(generation_id)
            .bind(embedded)
            .bind(failed)
            .execute(pool)
            .await?;

        sqlx::query(
            "UPDATE material_index_runs SET embedded=$2,failed=$3,remaining=$4,updated_at=now(),summary=$5 WHERE id=$1"
        )
        .bind(run_id)
        .bind(embedded)
        .bind(failed)
        .bind((total as i32 - processed).max(0))
        .bind(json!({
            "phase": "embedding",
            "model": ollama_model,
            "dimensions": ollama_dimensions,
            "domain": options.domain,
            "currentFile": file_name,
            "chunksPerSecond": (rate * 100.0).round() / 100.0,
            "etaSeconds": eta_secs
        }))
        .execute(pool)
        .await?;
    }

    let coverage = if total > 0 { embedded as f64 / total as f64 } else { 1.0 };
    if coverage < 0.995 {
        return Err(anyhow::anyhow!("Embedding coverage {}% is below 99.5%", coverage * 100.0));
    }

    let mut tx = pool.begin().await?;
    sqlx::query("UPDATE embedding_generations SET status='superseded',is_active=false WHERE domain_id=$1 AND is_active")
        .bind(domain_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"UPDATE embedding_generations SET status='active',is_active=true,embedded_chunks=$2,failed_chunks=$3,
        activated_at=now(),updated_at=now() WHERE id=$1"#
    )
    .bind(generation_id)
    .bind(embedded)
    .bind(failed)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE material_index_runs SET status='completed',embedded=$2,failed=$3,remaining=0,finished_at=now(),updated_at=now(),summary=$4 WHERE id=$1"
    )
    .bind(run_id)
    .bind(embedded)
    .bind(failed)
    .bind(json!({ "phase": "completed", "model": ollama_model, "dimensions": ollama_dimensions, "domain": options.domain, "coverage": coverage }))
    .execute(&mut *tx)
    .await?;
    
    tx.commit().await?;
    Ok(())
}

fn needs_text_extraction(ext: &str, catalog_only: bool, unchanged: bool, retry_failed: bool, status: &str) -> bool {
    let text_extensions = [".doc", ".docx", ".pdf", ".html"];
    let is_text = text_extensions.contains(&ext);
    let settled = ["indexed", "text_ready", "no_text"].contains(&status);
    is_text && !catalog_only && (!unchanged || (!settled && (status != "failed" || retry_failed)))
}

pub(crate) async fn run(
    state: SharedState,
    run_id: Uuid,
    options: IndexOptions,
) -> anyhow::Result<()> {
    let pool = &state.db;
    let root = &options.root;
    let requested_file = options.file.clone();

    let mut files = Vec::new();
    if options.rebuild {
        // Do not traverse
    } else if let Some(ref req_file) = requested_file {
        files.push(req_file.clone());
    } else {
        let supported_exts = [".doc", ".docx", ".pdf", ".mp3", ".wav", ".jpg", ".jpeg", ".png", ".zip", ".html"];
        for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let path = entry.path();
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    let ext_dot = format!(".{}", ext.to_ascii_lowercase());
                    if supported_exts.contains(&ext_dot.as_str()) {
                        files.push(path.to_path_buf());
                    }
                }
            }
        }
    }

    let limit = options.limit.unwrap_or(0);
    if limit > 0 && files.len() > limit {
        files.truncate(limit);
    }

    let mut ext_counts = serde_json::Map::new();
    for path in &files {
        if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
            let ext_dot = format!(".{}", ext.to_ascii_lowercase());
            let count = ext_counts.entry(&ext_dot).or_insert(Value::from(0));
            if let Some(c) = count.as_i64() {
                *count = Value::from(c + 1);
            }
        }
    }

    let domain_name = if options.domain == "university" { "大学" } else { "高中" };
    let domain_row = sqlx::query(
        r#"INSERT INTO content_domains(domain_key,name,description) VALUES($1,$2,$3)
        ON CONFLICT(domain_key) DO UPDATE SET name=EXCLUDED.name RETURNING id"#
    )
    .bind(&options.domain)
    .bind(domain_name)
    .bind(format!("{} materials", options.domain))
    .fetch_one(pool)
    .await?;

    let domain_id: Uuid = domain_row.try_get("id")?;

    let subject_id: Option<Uuid> = if let Some(ref subject_key) = options.subject {
        let row = sqlx::query(
            r#"INSERT INTO knowledge_subjects(domain_id,subject_key,name) VALUES($1,$2,$2)
            ON CONFLICT(domain_id,subject_key) DO UPDATE SET name=EXCLUDED.name RETURNING id"#
        )
        .bind(domain_id)
        .bind(subject_key)
        .fetch_one(pool)
        .await?;
        Some(row.try_get("id")?)
    } else {
        None
    };

    let course_id: Option<Uuid> = if let Some(ref course_key) = options.course {
        let row = sqlx::query(
            r#"INSERT INTO knowledge_courses(domain_id,subject_id,course_key,name) VALUES($1,$2,$3,$3)
            ON CONFLICT(domain_id,course_key) DO UPDATE SET subject_id=COALESCE(EXCLUDED.subject_id,knowledge_courses.subject_id) RETURNING id"#
        )
        .bind(domain_id)
        .bind(subject_id)
        .bind(course_key)
        .fetch_one(pool)
        .await?;
        Some(row.try_get("id")?)
    } else {
        None
    };

    let cache_root = std::env::var("MATERIAL_CACHE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("exam-review-materials"));
    fs::create_dir_all(&cache_root).await?;

    let stale_minutes = std::env::var("MATERIAL_RUN_STALE_MINUTES")
        .ok()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(5)
        .max(5);

    sqlx::query(
        r#"UPDATE material_index_runs
        SET status='interrupted',finished_at=now(),updated_at=now(),
            summary=summary||jsonb_build_object('reason','stale heartbeat recovered')
        WHERE status IN ('queued','running')
          AND updated_at < now() - ($1::int * interval '1 minute')"#
    )
    .bind(stale_minutes)
    .execute(pool)
    .await?;

    let mut stats = IndexStats {
        discovered: files.len() as i32,
        processed: 0,
        deduplicated: 0,
        extracted: 0,
        embedded: 0,
        failed: 0,
    };

    update_run_stats(pool, run_id, &stats, "running", json!({})).await?;

    let vector_enabled = state.vector_enabled;

    let target_generation: Option<Uuid> = if vector_enabled {
        sqlx::query_scalar(
            r#"SELECT id FROM embedding_generations WHERE domain_id=$1 AND status IN ('active','building')
            ORDER BY is_active DESC,created_at DESC LIMIT 1"#
        )
        .bind(domain_id)
        .fetch_optional(pool)
        .await?
    } else {
        None
    };

    let ollama = state.ollama_config.read().await.clone();

    if options.rebuild {
        match rebuild_generation(
            pool,
            run_id,
            domain_id,
            &options,
            &ollama.base_url,
            &ollama.embedding_model,
            ollama.embedding_dimensions,
            &state.http,
        )
        .await {
            Ok(_) => return Ok(()),
            Err(e) => {
                let err_str = format!("Error: {}", e).get(0..1000).unwrap_or(&format!("Error: {}", e)).to_string();
                sqlx::query("UPDATE embedding_generations SET status='failed',error=$2,updated_at=now() WHERE id=(SELECT generation_id FROM material_index_runs WHERE id=$1)")
                    .bind(run_id)
                    .bind(&err_str)
                    .execute(pool)
                    .await?;

                sqlx::query(
                    r#"UPDATE material_index_runs SET status='failed',failed=failed+1,finished_at=now(),updated_at=now(),
                    summary=summary||jsonb_build_object('error',$2) WHERE id=$1"#
                )
                .bind(run_id)
                .bind(&err_str)
                .execute(pool)
                .await?;
                return Err(e);
            }
        }
    }

    let mut heartbeat_at = std::time::Instant::now();

    for file_path in &files {
        if heartbeat_at.elapsed() >= std::time::Duration::from_secs(30) {
            sqlx::query("UPDATE material_index_runs SET updated_at=now() WHERE id=$1")
                .bind(run_id)
                .execute(pool)
                .await?;
            heartbeat_at = std::time::Instant::now();
        }

        if handle_pause_cancel(pool, run_id).await? {
            update_run_stats(pool, run_id, &stats, "cancelled", json!({ "reason": "cancelled by user" })).await?;
            return Ok(());
        }

        let metadata = fs::metadata(file_path).await?;
        let size_bytes = metadata.len() as i64;
        let modified_at: DateTime<Utc> = DateTime::from(metadata.modified()?);

        let source_relative_path = file_path.strip_prefix(root)?
            .to_string_lossy()
            .replace('\\', "/");

        let relative_path = format!("{}/{}", options.domain, source_relative_path);
        let storage_path = source_relative_path.clone();

        let ext = file_path.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase();
        let ext_dot = format!(".{}", ext);

        let row_opt = sqlx::query(
            r#"SELECT p.material_id, p.size_bytes, p.modified_at, m.content_hash, m.rag_status,
              EXISTS(SELECT 1 FROM material_chunks c WHERE c.material_id=m.id AND length(trim(c.chunk_text))>=20) has_chunks
             FROM material_paths p JOIN materials m ON m.id=p.material_id WHERE p.relative_path=$1"#
        )
        .bind(&relative_path)
        .fetch_optional(pool)
        .await?;

        let mut unchanged = false;
        let mut previous_hash = String::new();
        let mut previous_has_chunks = false;

        if let Some(ref r) = row_opt {
            let prev_size: i64 = r.get("size_bytes");
            let prev_mtime: Option<DateTime<Utc>> = r.get("modified_at");
            previous_hash = r.get("content_hash");
            previous_has_chunks = r.get("has_chunks");

            if prev_size == size_bytes && prev_mtime == Some(modified_at) {
                unchanged = true;
            }
        }

        if options.missing_only && row_opt.is_some() && previous_has_chunks {
            stats.processed += 1;
            if stats.processed % 100 == 0 {
                update_run_stats(pool, run_id, &stats, "running", json!({
                    "phase": "discovering-missing",
                    "currentFile": file_path.file_name().and_then(|s| s.to_str()).unwrap_or("")
                })).await?;
            }
            continue;
        }

        let mut hash = if unchanged {
            previous_hash.clone()
        } else {
            compute_sha256(file_path).await?
        };

        if options.domain != "high-school" {
            let mut hasher = Sha256::new();
            hasher.update(format!("{}:{}", options.domain, hash).as_bytes());
            hash = hex::encode(hasher.finalize());
        }

        let (grade, mut subject, year, region, kind) = classify(&source_relative_path, &ext_dot);
        if let Some(ref opt_sub) = options.subject {
            subject = opt_sub.clone();
        }

        let has_hash_row = sqlx::query("SELECT id FROM materials WHERE content_hash=$1")
            .bind(&hash)
            .fetch_optional(pool)
            .await?;
        
        if has_hash_row.is_some() {
            stats.deduplicated += 1;
        }

        let mat_row = sqlx::query(
            r#"INSERT INTO materials(content_hash,file_name,file_ext,mime_type,size_bytes,grade,subject,year,region,kind,metadata,domain_id,subject_id,course_id,downloadable)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT(content_hash) DO UPDATE SET domain_id=$12,subject_id=COALESCE($13,materials.subject_id),course_id=COALESCE($14,materials.course_id),updated_at=now()
            RETURNING id,rag_status"#
        )
        .bind(&hash)
        .bind(file_path.file_name().and_then(|s| s.to_str()).unwrap_or(""))
        .bind(&ext_dot)
        .bind(mime_for(&ext_dot))
        .bind(size_bytes)
        .bind(&grade)
        .bind(&subject)
        .bind(year)
        .bind(&region)
        .bind(&kind)
        .bind(json!({ "source": "local", "domain": options.domain, "course": options.course, "sourceRelativePath": source_relative_path }))
        .bind(domain_id)
        .bind(subject_id)
        .bind(course_id)
        .bind(ext_dot != ".html")
        .fetch_one(pool)
        .await?;

        let material_id: Uuid = mat_row.get("id");
        let mut current_status: String = mat_row.get("rag_status");

        sqlx::query(
            r#"INSERT INTO material_paths(material_id,relative_path,storage_path,is_canonical,size_bytes,modified_at,last_seen_run)
            VALUES($1,$2,$3,NOT EXISTS(SELECT 1 FROM material_paths WHERE material_id=$1),$4,$5,$6)
            ON CONFLICT(relative_path) DO UPDATE SET material_id=$1,storage_path=$3,size_bytes=$4,modified_at=$5,last_seen_run=$6,updated_at=now()"#
        )
        .bind(material_id)
        .bind(&relative_path)
        .bind(&storage_path)
        .bind(size_bytes)
        .bind(modified_at)
        .bind(run_id)
        .execute(pool)
        .await?;

        sqlx::query(
            r#"UPDATE materials SET file_name=$2,file_ext=$3,mime_type=$4,size_bytes=$5,grade=$6,subject=$7,year=$8,region=$9,kind=$10,updated_at=now()
            WHERE id=$1 AND EXISTS(SELECT 1 FROM material_paths WHERE material_id=$1 AND relative_path=$11 AND is_canonical=true)"#
        )
        .bind(material_id)
        .bind(file_path.file_name().and_then(|s| s.to_str()).unwrap_or(""))
        .bind(&ext_dot)
        .bind(mime_for(&ext_dot))
        .bind(size_bytes)
        .bind(&grade)
        .bind(&subject)
        .bind(year)
        .bind(&region)
        .bind(&kind)
        .bind(&relative_path)
        .execute(pool)
        .await?;

        let should_extract = needs_text_extraction(
            &ext_dot,
            options.catalog_only,
            unchanged,
            options.retry_failed,
            &current_status,
        );

        if should_extract {
            match extract_text(file_path, &ext_dot, &cache_root).await {
                Ok(text) => {
                    if text.len() < 20 {
                        sqlx::query(
                            "UPDATE materials SET rag_status='no_text',text_length=$2,metadata=metadata-'extractionError'-'embeddingError',updated_at=now() WHERE id=$1"
                        )
                        .bind(material_id)
                        .bind(text.len() as i32)
                        .execute(pool)
                        .await?;
                        current_status = "no_text".to_string();
                    } else {
                        let parts = chunks(&text, 1000, 150);
                        sqlx::query("DELETE FROM material_chunks WHERE material_id=$1")
                            .bind(material_id)
                            .execute(pool)
                            .await?;

                        for (index, chunk) in parts.iter().enumerate() {
                            let mut chunk_hasher = Sha256::new();
                            chunk_hasher.update(chunk.as_bytes());
                            let chunk_hash = hex::encode(chunk_hasher.finalize());

                            sqlx::query(
                                r#"INSERT INTO material_chunks(material_id,chunk_index,chunk_text,content_hash,token_estimate,metadata)
                                VALUES($1,$2,$3,$4,$5,$6)"#
                            )
                            .bind(material_id)
                            .bind(index as i32)
                            .bind(chunk)
                            .bind(&chunk_hash)
                            .bind((chunk.len() as f64 / 1.7).ceil() as i32)
                            .bind(json!({ "relativePath": relative_path }))
                            .execute(pool)
                            .await?;
                        }

                        sqlx::query(
                            "UPDATE materials SET rag_status='text_ready',text_length=$2,metadata=metadata-'extractionError'-'embeddingError',updated_at=now() WHERE id=$1"
                        )
                        .bind(material_id)
                        .bind(text.len() as i32)
                        .execute(pool)
                        .await?;
                        current_status = "text_ready".to_string();
                        stats.extracted += 1;
                    }
                }
                Err(e) => {
                    stats.failed += 1;
                    sqlx::query(
                        "UPDATE materials SET rag_status='failed',metadata=metadata||$2::jsonb,updated_at=now() WHERE id=$1"
                    )
                    .bind(material_id)
                    .bind(json!({ "extractionError": format!("{}", e).get(0..500).unwrap_or(&format!("{}", e)) }))
                    .execute(pool)
                    .await?;
                    current_status = "failed".to_string();
                }
            }
        }

        let is_text_ext = [".doc", ".docx", ".pdf", ".html"].contains(&ext_dot.as_str());
        if vector_enabled && !options.catalog_only && is_text_ext && current_status != "failed" {
            let pending_rows = sqlx::query(
                "SELECT id,chunk_text FROM material_chunks WHERE material_id=$1 AND embedding IS NULL ORDER BY chunk_index"
            )
            .bind(material_id)
            .fetch_all(pool)
            .await?;

            if !pending_rows.is_empty() {
                let mut embedding_error = None;
                for chunk_batch in pending_rows.chunks(16) {
                    let batch_texts: Vec<String> = chunk_batch.iter().map(|r| r.get::<String, _>("chunk_text")).collect();
                    match get_ollama_embeddings(&state.http, &ollama.base_url, &ollama.embedding_model, batch_texts).await {
                        Ok(vectors) => {
                            for (i, row) in chunk_batch.iter().enumerate() {
                                let chunk_id: Uuid = row.get("id");
                                let vec_str = format!("[{}]", vectors[i].iter().map(|v| v.to_string()).collect::<Vec<String>>().join(","));
                                
                                sqlx::query("UPDATE material_chunks SET embedding=$2::vector WHERE id=$1")
                                    .bind(chunk_id)
                                    .bind(&vec_str)
                                    .execute(pool)
                                    .await?;

                                if let Some(gen_id) = target_generation {
                                    sqlx::query(
                                        r#"INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding) VALUES($1,$2,$3::vector)
                                        ON CONFLICT(generation_id,chunk_id) DO UPDATE SET embedding=EXCLUDED.embedding"#
                                    )
                                    .bind(gen_id)
                                    .bind(chunk_id)
                                    .bind(&vec_str)
                                    .execute(pool)
                                    .await?;
                                }
                            }
                        }
                        Err(e) => {
                            embedding_error = Some(e);
                            break;
                        }
                    }
                }

                if let Some(err) = embedding_error {
                    sqlx::query("UPDATE materials SET metadata=metadata||$2::jsonb WHERE id=$1")
                        .bind(material_id)
                        .bind(json!({ "embeddingError": format!("{}", err).get(0..500).unwrap_or(&format!("{}", err)) }))
                        .execute(pool)
                        .await?;
                } else {
                    stats.embedded += 1;
                    let remaining_count: i64 = sqlx::query_scalar(
                        "SELECT COUNT(*)::int AS count FROM material_chunks WHERE material_id=$1 AND embedding IS NULL"
                    )
                    .bind(material_id)
                    .fetch_one(pool)
                    .await?;

                    if remaining_count == 0 {
                        sqlx::query(
                            "UPDATE materials SET rag_status='indexed',metadata=metadata-'embeddingError'-'extractionError',updated_at=now() WHERE id=$1"
                        )
                        .bind(material_id)
                        .execute(pool)
                        .await?;
                    }
                }
            } else if current_status == "indexed" || current_status == "text_ready" {
                sqlx::query("UPDATE materials SET metadata=metadata-'embeddingError' WHERE id=$1")
                    .bind(material_id)
                    .execute(pool)
                    .await?;
            }
        }

        stats.processed += 1;
        update_run_stats(pool, run_id, &stats, "running", json!({
            "phase": "embedding",
            "rebuild": options.rebuild,
            "currentFile": file_path.file_name().and_then(|s| s.to_str()).unwrap_or("")
        })).await?;
        
        heartbeat_at = std::time::Instant::now();
    }

    if options.file.is_none() && options.limit.is_none() {
        sqlx::query(
            "DELETE FROM material_paths p USING materials m WHERE p.material_id=m.id AND m.domain_id=$2 AND p.last_seen_run IS DISTINCT FROM $1"
        )
        .bind(run_id)
        .bind(domain_id)
        .execute(pool)
        .await?;

        sqlx::query(
            "DELETE FROM materials m WHERE NOT EXISTS(SELECT 1 FROM material_paths p WHERE p.material_id=m.id)"
        )
        .execute(pool)
        .await?;
    }

    update_run_stats(pool, run_id, &stats, "completed", json!({
        "extensions": ext_counts,
        "vectorEnabled": vector_enabled,
        "rebuild": options.rebuild,
        "phase": "completed"
    })).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify() {
        let (grade, subject, year, region, kind) = classify("高一数学试卷.docx", ".docx");
        assert_eq!(grade, "grade-1");
        assert_eq!(subject, "math");
        assert_eq!(year, None);
        assert_eq!(region, "other");
        assert_eq!(kind, "paper");

        let (grade, subject, year, region, kind) = classify("高三物理/2025南京一模物理试卷解析.pdf", ".pdf");
        assert_eq!(grade, "grade-3");
        assert_eq!(subject, "physics");
        assert_eq!(year, Some(2025));
        assert_eq!(region, "南京");
        assert_eq!(kind, "answer");
    }

    #[test]
    fn test_compact() {
        let text = " Hello  \t\n\n\nWorld! \n\n  ";
        assert_eq!(compact(text), "Hello\n\nWorld!");
    }

    #[test]
    fn test_chunks() {
        let text = "abcdefghij";
        let c = chunks(text, 5, 2);
        assert_eq!(c.len(), 3);
        assert_eq!(c[0], "abcde");
        assert_eq!(c[1], "defgh");
        assert_eq!(c[2], "ghij");
    }
}
