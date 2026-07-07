use anyhow::{Context, Result};
use chrono::Utc;
use serde_json::{json, Value};
use sqlx::{postgres::PgPoolOptions, PgPool, Row};
use std::{env, fs, path::PathBuf};
use uuid::Uuid;

#[derive(Debug)]
struct Args {
    apply: bool,
    report: PathBuf,
    limit: i64,
}

#[derive(Debug)]
struct Candidate {
    id: Uuid,
    question_key: String,
    subject_key: String,
    year: Option<i32>,
    prompt: String,
    answer: Option<String>,
    flags: Value,
    metadata: Value,
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

    ensure_audit_schema(&pool).await?;
    let candidates = load_candidates(&pool, args.limit).await?;
    let mut rows = Vec::new();
    let now = Utc::now().to_rfc3339();

    for candidate in &candidates {
        let reason = cleanup_reason(candidate);
        let evidence = json!({
            "promptLength": candidate.prompt.trim().chars().count(),
            "hasAnswer": candidate.answer.as_deref().map(str::trim).map(|v| !v.is_empty()).unwrap_or(false),
            "flags": candidate.flags,
            "previousCleanup": candidate.metadata.pointer("/cleanup/status"),
        });
        if args.apply {
            soft_delete_candidate(&pool, candidate, &reason, &evidence, &now).await?;
        }
        rows.push(ReportRow {
            question_key: candidate.question_key.clone(),
            subject_key: candidate.subject_key.clone(),
            year: candidate.year,
            reason,
            prompt_len: candidate.prompt.trim().chars().count(),
            has_answer: candidate
                .answer
                .as_deref()
                .map(str::trim)
                .map(|value| !value.is_empty())
                .unwrap_or(false),
            action: if args.apply {
                "soft_deleted"
            } else {
                "dry_run"
            }
            .to_string(),
        });
    }

    write_report(&args.report, &rows, args.apply)?;
    println!(
        "{} {} candidate questions; report={}",
        if args.apply { "soft-deleted" } else { "found" },
        rows.len(),
        args.report.display()
    );
    Ok(())
}

fn parse_args() -> Result<Args> {
    let mut apply = false;
    let mut report = PathBuf::from("docs/gaokao-cleanup-audit.md");
    let mut limit = 10_000;
    let mut iter = env::args().skip(1);
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--apply" => apply = true,
            "--report" => {
                let value = iter.next().context("--report requires a path")?;
                report = PathBuf::from(value);
            }
            "--limit" => {
                let value = iter.next().context("--limit requires a number")?;
                limit = value.parse().context("parse --limit")?;
            }
            "--help" | "-h" => {
                println!("Usage: gaokao-cleanup-questions [--apply] [--report PATH] [--limit N]");
                std::process::exit(0);
            }
            _ => anyhow::bail!("unknown argument: {arg}"),
        }
    }
    Ok(Args {
        apply,
        report,
        limit,
    })
}

async fn ensure_audit_schema(pool: &PgPool) -> Result<()> {
    let statements = [
        "CREATE TABLE IF NOT EXISTS gaokao_question_cleanup_audit (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), question_id UUID NOT NULL REFERENCES gaokao_questions(id) ON DELETE CASCADE, question_key TEXT NOT NULL, subject_key TEXT, year INTEGER, reason TEXT NOT NULL, evidence JSONB NOT NULL DEFAULT '{}'::jsonb, action TEXT NOT NULL DEFAULT 'soft_deleted', created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        "CREATE INDEX IF NOT EXISTS idx_gaokao_questions_cleanup_status ON gaokao_questions ((metadata #>> '{cleanup,status}'))",
    ];
    for statement in statements {
        sqlx::query(statement).execute(pool).await?;
    }
    Ok(())
}

async fn load_candidates(pool: &PgPool, limit: i64) -> Result<Vec<Candidate>> {
    let rows = sqlx::query(
        r#"SELECT id, question_key, subject_key, year, prompt, answer, flags, metadata
           FROM gaokao_questions
           WHERE COALESCE(metadata #>> '{cleanup,status}', '') <> 'soft_deleted'
             AND (
               length(trim(prompt)) = 0
               OR answer IS NULL
               OR length(trim(answer)) = 0
               OR length(trim(prompt)) < 12
               OR (
                 jsonb_typeof(flags) = 'array'
                 AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements_text(flags) AS flag(value)
                   WHERE flag.value IN (
                     'answer_not_found', 'solution_not_found', 'too_short',
                     'options_may_be_missing', 'formula_options_missing',
                     'contains_formula_placeholder', 'ocr_incomplete'
                   )
                 )
                 AND (answer IS NULL OR length(trim(answer)) = 0)
               )
             )
           ORDER BY subject_key, year NULLS LAST, question_number NULLS LAST, updated_at DESC
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
                year: row.try_get("year")?,
                prompt: row.try_get("prompt")?,
                answer: row.try_get("answer")?,
                flags: row.try_get("flags")?,
                metadata: row.try_get("metadata")?,
            })
        })
        .collect()
}

fn cleanup_reason(candidate: &Candidate) -> String {
    let mut reasons = Vec::new();
    if candidate.prompt.trim().is_empty() {
        reasons.push("题干缺失");
    }
    if candidate.prompt.trim().chars().count() < 12 {
        reasons.push("题干过短疑似不完整");
    }
    if candidate
        .answer
        .as_deref()
        .map(str::trim)
        .map(|value| value.is_empty())
        .unwrap_or(true)
    {
        reasons.push("答案缺失");
    }
    if flag_strings(&candidate.flags).iter().any(|flag| {
        matches!(
            flag.as_str(),
            "answer_not_found"
                | "solution_not_found"
                | "too_short"
                | "options_may_be_missing"
                | "formula_options_missing"
                | "contains_formula_placeholder"
                | "ocr_incomplete"
        )
    }) {
        reasons.push("抽取标记显示内容不完整");
    }
    reasons.sort();
    reasons.dedup();
    reasons.join("；")
}

fn flag_strings(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

async fn soft_delete_candidate(
    pool: &PgPool,
    candidate: &Candidate,
    reason: &str,
    evidence: &Value,
    timestamp: &str,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"INSERT INTO gaokao_question_cleanup_audit
             (question_id, question_key, subject_key, year, reason, evidence, action)
           SELECT $1, $2, $3, $4, $5, $6, 'soft_deleted'
           WHERE NOT EXISTS (
             SELECT 1 FROM gaokao_question_cleanup_audit
             WHERE question_id = $1 AND action = 'soft_deleted'
           )"#,
    )
    .bind(candidate.id)
    .bind(&candidate.question_key)
    .bind(&candidate.subject_key)
    .bind(candidate.year)
    .bind(reason)
    .bind(evidence)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"UPDATE gaokao_questions
           SET metadata = jsonb_set(
                 metadata,
                 '{cleanup}',
                 COALESCE(metadata->'cleanup', '{}'::jsonb) || jsonb_build_object(
                   'status', 'soft_deleted',
                   'reason', $2::text,
                   'deletedAt', $3::text,
                   'action', 'soft_delete_incomplete_question'
                 ),
                 true
               ),
               updated_at = now()
           WHERE id = $1"#,
    )
    .bind(candidate.id)
    .bind(reason)
    .bind(timestamp)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

struct ReportRow {
    question_key: String,
    subject_key: String,
    year: Option<i32>,
    reason: String,
    prompt_len: usize,
    has_answer: bool,
    action: String,
}

fn write_report(path: &PathBuf, rows: &[ReportRow], applied: bool) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut output = String::new();
    output.push_str("# 高考题库清理审计表\n\n");
    output.push_str(&format!("- 生成时间：{}\n", Utc::now().to_rfc3339()));
    output.push_str(&format!(
        "- 执行模式：{}\n",
        if applied { "soft delete" } else { "dry run" }
    ));
    output.push_str(&format!("- 命中题目：{}\n\n", rows.len()));
    output.push_str("| 题目 Key | 学科 | 年份 | 原因 | 题干字数 | 是否有答案 | 动作 |\n");
    output.push_str("| --- | --- | --- | --- | ---: | --- | --- |\n");
    for row in rows {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} | {} |\n",
            escape_table(&row.question_key),
            escape_table(&row.subject_key),
            row.year
                .map(|value| value.to_string())
                .unwrap_or_else(|| "-".to_string()),
            escape_table(&row.reason),
            row.prompt_len,
            if row.has_answer { "是" } else { "否" },
            row.action
        ));
    }
    fs::write(path, output)?;
    Ok(())
}

fn escape_table(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}
