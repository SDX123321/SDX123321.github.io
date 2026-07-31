use super::*;
use serde::Deserialize;

pub(crate) async fn get_ollama_embeddings(
    http: &reqwest::Client,
    base_url: &str,
    model: &str,
    inputs: Vec<String>,
) -> anyhow::Result<Vec<Vec<f32>>> {
    if inputs.is_empty() {
        return Ok(Vec::new());
    }
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

    let response = http
        .post(&url)
        .json(&EmbedRequest {
            model,
            input: inputs,
        })
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!(
            "Ollama embedding failed with status {}: {}",
            status,
            err_text
        ));
    }

    let data = response.json::<EmbedResponse>().await?;
    Ok(data.embeddings)
}

#[allow(dead_code)]
pub(crate) async fn chunk_and_embed_text(
    pool: &PgPool,
    http: &reqwest::Client,
    ollama: &crate::OllamaRuntimeConfig,
    material_id: Uuid,
    relative_path: &str,
    text: &str,
    target_generation: Option<Uuid>,
) -> anyhow::Result<()> {
    if text.len() < 20 {
        sqlx::query(
            "UPDATE materials SET rag_status='no_text',text_length=$2,metadata=metadata-'extractionError'-'embeddingError',updated_at=now() WHERE id=$1"
        )
        .bind(material_id)
        .bind(text.len() as i32)
        .execute(pool)
        .await?;
        return Ok(());
    }

    let parts = chunks(text, 1000, 150);
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

    let pending_rows = sqlx::query(
        "SELECT id,chunk_text FROM material_chunks WHERE material_id=$1 AND embedding IS NULL ORDER BY chunk_index"
    )
    .bind(material_id)
    .fetch_all(pool)
    .await?;

    if !pending_rows.is_empty() {
        for chunk_batch in pending_rows.chunks(16) {
            let batch_texts: Vec<String> = chunk_batch
                .iter()
                .map(|r| r.get::<String, _>("chunk_text"))
                .collect();
            let vectors =
                get_ollama_embeddings(http, &ollama.base_url, &ollama.embedding_model, batch_texts)
                    .await?;
            let chunk_ids: Vec<Uuid> = chunk_batch.iter().map(|row| row.get("id")).collect();
            let vec_strs: Vec<String> = vectors
                .iter()
                .map(|v| {
                    format!(
                        "[{}]",
                        v.iter()
                            .map(|n| n.to_string())
                            .collect::<Vec<String>>()
                            .join(",")
                    )
                })
                .collect();

            sqlx::query(
                r#"UPDATE material_chunks c SET embedding = v.vec
                   FROM (SELECT UNNEST($1::uuid[]) AS id, UNNEST($2::text[])::vector AS vec) v
                   WHERE c.id = v.id"#,
            )
            .bind(&chunk_ids)
            .bind(&vec_strs)
            .execute(pool)
            .await?;

            if let Some(gen_id) = target_generation {
                sqlx::query(
                    r#"INSERT INTO material_chunk_embeddings(generation_id,chunk_id,embedding)
                       SELECT $1, UNNEST($2::uuid[]), UNNEST($3::text[])::vector
                       ON CONFLICT(generation_id,chunk_id) DO UPDATE SET embedding=EXCLUDED.embedding"#,
                )
                .bind(gen_id)
                .bind(&chunk_ids)
                .bind(&vec_strs)
                .execute(pool)
                .await?;
            }
        }
    }

    sqlx::query(
        "UPDATE materials SET rag_status='indexed',text_length=$2,metadata=metadata-'embeddingError'-'extractionError',updated_at=now() WHERE id=$1"
    )
    .bind(material_id)
    .bind(text.len() as i32)
    .execute(pool)
    .await?;

    Ok(())
}
