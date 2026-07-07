use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{env, time::Duration};
use uuid::Uuid;

const ENRICH_VERSION: &str = "rust-enrich-v1";

#[derive(Debug, Default)]
struct Args {
    dry_run: bool,
    limit: i64,
}

#[derive(Debug)]
struct Candidate {
    id: Uuid,
    question_key: String,
    subject_key: String,
    question_type: Option<String>,
    quality: String,
    source_type: String,
    prompt: String,
    answer: String,
    solution: Value,
    flags: Value,
    metadata: Value,
}

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    #[serde(rename = "response_format")]
    response_format: Value,
}

#[derive(Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageOut,
}

#[derive(Deserialize)]
struct ChatMessageOut {
    content: String,
}

#[derive(Deserialize)]
struct SolutionPayload {
    steps: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let args = parse_args()?;
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@127.0.0.1:5432/exam_review".to_string());
    let pool = PgPoolOptions::new()
        .max_connections(4)
        .connect(&database_url)
        .await
        .context("connect postgres")?;

    let model_url =
        env::var("LOCAL_MODEL_URL").unwrap_or_else(|_| "http://127.0.0.1:11434/v1".to_string());
    let model = env::var("LOCAL_MODEL_NAME").unwrap_or_else(|_| "local-gaokao-solver".to_string());
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()?;

    let candidates = load_candidates(&pool, args.limit).await?;
    let mut generated = 0usize;
    let mut needs_review = 0usize;
    let mut failed = 0usize;

    println!(
        "found {} candidate questions, dry_run={}, limit={}",
        candidates.len(),
        args.dry_run,
        args.limit
    );

    for candidate in candidates {
        let review_reason = review_reason(&candidate);
        if let Some(reason) = review_reason {
            needs_review += 1;
            let metadata = enrichment_metadata(
                candidate.metadata.clone(),
                "needs_review",
                &model,
                "standard_answer_and_existing_metadata",
                reason,
            );
            println!("needs_review {}: {}", candidate.question_key, reason);
            if !args.dry_run {
                update_metadata(&pool, candidate.id, metadata).await?;
            }
            continue;
        }

        if args.dry_run {
            generated += 1;
            println!(
                "would_generate {}: prompt_and_standard_answer",
                candidate.question_key
            );
            continue;
        }

        match generate_solution(&client, &model_url, &model, &candidate).await {
            Ok(steps) if !steps.is_empty() => {
                generated += 1;
                let basis = if existing_solution_steps(&candidate.solution).is_empty() {
                    "prompt_and_standard_answer"
                } else {
                    "prompt_standard_answer_and_short_existing_solution"
                };
                let metadata = enrichment_metadata(
                    candidate.metadata.clone(),
                    "generated",
                    &model,
                    basis,
                    "generated_step_by_step_solution",
                );
                println!(
                    "generated {}: {} steps",
                    candidate.question_key,
                    steps.len()
                );
                if !args.dry_run {
                    write_solution(&pool, candidate.id, steps, metadata).await?;
                }
            }
            Ok(_) => {
                failed += 1;
                let metadata = enrichment_metadata(
                    candidate.metadata.clone(),
                    "failed",
                    &model,
                    "prompt_and_standard_answer",
                    "model_returned_empty_steps",
                );
                println!("failed {}: empty model result", candidate.question_key);
                if !args.dry_run {
                    update_metadata(&pool, candidate.id, metadata).await?;
                }
            }
            Err(error) => {
                failed += 1;
                let reason = format!("model_error: {error}");
                let metadata = enrichment_metadata(
                    candidate.metadata.clone(),
                    "failed",
                    &model,
                    "prompt_and_standard_answer",
                    &reason,
                );
                println!("failed {}: {error}", candidate.question_key);
                if !args.dry_run {
                    update_metadata(&pool, candidate.id, metadata).await?;
                }
            }
        }
    }

    let generated_label = if args.dry_run {
        "would_generate"
    } else {
        "generated"
    };
    println!(
        "summary: {}={}, needs_review={}, failed={}, dry_run={}",
        generated_label, generated, needs_review, failed, args.dry_run
    );
    Ok(())
}

fn parse_args() -> Result<Args> {
    let mut args = Args {
        dry_run: false,
        limit: 50,
    };
    let mut iter = env::args().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--dry-run" => args.dry_run = true,
            "--limit" => {
                let value = iter
                    .next()
                    .ok_or_else(|| anyhow!("--limit requires a number"))?;
                args.limit = value.parse::<i64>().context("parse --limit")?.clamp(1, 500);
            }
            "--help" | "-h" => {
                println!("Usage: gaokao-enrich-solutions [--dry-run] [--limit N]");
                std::process::exit(0);
            }
            other => return Err(anyhow!("unknown argument: {other}")),
        }
    }
    Ok(args)
}

async fn load_candidates(pool: &PgPool, limit: i64) -> Result<Vec<Candidate>> {
    let rows = sqlx::query(
        r#"SELECT id, question_key, subject_key, question_type, quality, source_type,
                  prompt, answer, solution, flags, metadata
           FROM gaokao_questions
           WHERE answer IS NOT NULL
             AND btrim(answer) <> ''
             AND answer <> '答案待补全'
             AND COALESCE(metadata #>> '{solutionEnrichment,status}', '') NOT IN ('generated', 'skipped')
             AND (
               jsonb_array_length(solution) = 0
               OR length(solution::text) < 120
             )
           ORDER BY updated_at DESC, id
           LIMIT $1"#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(Candidate {
                id: row.try_get("id")?,
                question_key: row.try_get("question_key")?,
                subject_key: row.try_get("subject_key")?,
                question_type: row.try_get("question_type")?,
                quality: row.try_get("quality")?,
                source_type: row.try_get("source_type")?,
                prompt: row.try_get("prompt")?,
                answer: row.try_get("answer")?,
                solution: row.try_get("solution")?,
                flags: row.try_get("flags")?,
                metadata: row.try_get("metadata")?,
            })
        })
        .collect::<Result<Vec<_>, sqlx::Error>>()
        .map_err(Into::into)
}

fn review_reason(candidate: &Candidate) -> Option<&'static str> {
    let haystack = format!(
        "{} {} {} {} {} {}",
        candidate.subject_key,
        candidate.question_type.as_deref().unwrap_or_default(),
        candidate.quality,
        candidate.source_type,
        candidate.prompt,
        candidate.flags
    )
    .to_lowercase();

    let risky_terms = [
        "ocr",
        "作文",
        "写作",
        "开放",
        "材料",
        "阅读",
        "续写",
        "如图",
        "图中",
        "下图",
        "表格",
        "图表",
        "曲线图",
        "统计图",
        "图片",
        "示意图",
        "电路图",
        "流程图",
        "听力",
    ];

    if candidate.prompt.chars().count() < 24 {
        return Some("prompt_too_short_or_incomplete");
    }
    if candidate.answer.chars().count() > 500 {
        return Some("answer_is_long_form_or_open_ended");
    }
    if candidate.quality == "review" || candidate.quality == "candidate" {
        return Some("question_quality_requires_review");
    }
    if risky_terms.iter().any(|term| haystack.contains(term)) {
        return Some("open_ended_or_visual_material_requires_review");
    }
    None
}

async fn generate_solution(
    client: &Client,
    base_url: &str,
    model: &str,
    candidate: &Candidate,
) -> Result<Vec<String>> {
    let existing = existing_solution_steps(&candidate.solution).join("\n");
    let user_prompt = format!(
        "请基于以下题干、标准答案和已有解析证据，生成中文分步骤题解。要求：只使用题干和标准答案中能确认的信息，不虚构图片、表格或材料中不存在的内容；每一步写成可直接展示给学生的短段落；返回 JSON，格式为 {{\"steps\":[\"步骤1...\",\"步骤2...\"]}}。\n\n题目编号：{}\n科目：{}\n题干：\n{}\n\n标准答案：\n{}\n\n已有解析证据：\n{}",
        candidate.question_key,
        candidate.subject_key,
        candidate.prompt,
        candidate.answer,
        if existing.is_empty() { "无" } else { existing.as_str() }
    );

    let request = ChatRequest {
        model: model.to_string(),
        temperature: 0.2,
        response_format: json!({ "type": "json_object" }),
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: "你是一名严谨的高考阅卷教师，只根据给定题干和标准答案补写分步骤解析。"
                    .to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt,
            },
        ],
    };

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let response = client
        .post(url)
        .json(&request)
        .send()
        .await?
        .error_for_status()?;
    let payload: ChatResponse = response.json().await?;
    let content = payload
        .choices
        .first()
        .map(|choice| choice.message.content.trim().to_string())
        .ok_or_else(|| anyhow!("missing model choice"))?;
    parse_steps(&content)
}

fn parse_steps(content: &str) -> Result<Vec<String>> {
    if let Ok(payload) = serde_json::from_str::<SolutionPayload>(content) {
        return Ok(clean_steps(payload.steps));
    }
    if let Some(start) = content.find('{') {
        if let Some(end) = content.rfind('}') {
            if start < end {
                if let Ok(payload) = serde_json::from_str::<SolutionPayload>(&content[start..=end])
                {
                    return Ok(clean_steps(payload.steps));
                }
            }
        }
    }
    Ok(clean_steps(
        content
            .lines()
            .map(|line| {
                line.trim()
                    .trim_start_matches(|ch: char| ch.is_ascii_digit() || ch == '.' || ch == '、')
            })
            .filter(|line| !line.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
    ))
}

fn clean_steps(steps: Vec<String>) -> Vec<String> {
    steps
        .into_iter()
        .map(|step| step.trim().to_string())
        .filter(|step| step.chars().count() >= 8)
        .take(8)
        .collect()
}

fn existing_solution_steps(solution: &Value) -> Vec<String> {
    solution
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::trim))
                .filter(|item| !item.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn enrichment_metadata(
    mut metadata: Value,
    status: &str,
    model: &str,
    basis: &str,
    reason: &str,
) -> Value {
    if !metadata.is_object() {
        metadata = json!({});
    }
    if let Some(object) = metadata.as_object_mut() {
        object.insert(
            "solutionEnrichment".to_string(),
            json!({
                "status": status,
                "model": model,
                "version": ENRICH_VERSION,
                "generatedAt": Utc::now(),
                "basis": basis,
                "reason": reason,
            }),
        );
    }
    metadata
}

async fn write_solution(
    pool: &PgPool,
    id: Uuid,
    steps: Vec<String>,
    metadata: Value,
) -> Result<()> {
    sqlx::query(
        "UPDATE gaokao_questions SET solution = $1, metadata = $2, updated_at = now() WHERE id = $3",
    )
    .bind(json!(steps))
    .bind(metadata)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

async fn update_metadata(pool: &PgPool, id: Uuid, metadata: Value) -> Result<()> {
    sqlx::query("UPDATE gaokao_questions SET metadata = $1, updated_at = now() WHERE id = $2")
        .bind(metadata)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
