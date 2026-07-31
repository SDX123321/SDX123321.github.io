use crate::PgPool;

/// Creates the material-library schema (materials/paths/chunks/index-runs/embedding generations).
/// Returns whether vector search is available so the app can fall back to keyword-only.
pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<bool> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS materials (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), content_hash TEXT NOT NULL UNIQUE,
            file_name TEXT NOT NULL, file_ext TEXT NOT NULL, mime_type TEXT NOT NULL,
            size_bytes BIGINT NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT 'other',
            subject TEXT NOT NULL DEFAULT 'other', year INTEGER, region TEXT NOT NULL DEFAULT 'other',
            kind TEXT NOT NULL DEFAULT 'other', downloadable BOOLEAN NOT NULL DEFAULT true,
            rag_status TEXT NOT NULL DEFAULT 'pending', text_length INTEGER NOT NULL DEFAULT 0,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS material_paths (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            relative_path TEXT NOT NULL UNIQUE, storage_path TEXT, is_canonical BOOLEAN NOT NULL DEFAULT false,
            size_bytes BIGINT NOT NULL, modified_at TIMESTAMPTZ, last_seen_run UUID,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS material_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL, chunk_text TEXT NOT NULL, content_hash TEXT NOT NULL,
            token_estimate INTEGER NOT NULL DEFAULT 0, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(material_id, chunk_index))"#,
        r#"CREATE TABLE IF NOT EXISTS material_index_runs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), status TEXT NOT NULL DEFAULT 'queued',
            source_root TEXT NOT NULL, discovered INTEGER NOT NULL DEFAULT 0, deduplicated INTEGER NOT NULL DEFAULT 0,
            extracted INTEGER NOT NULL DEFAULT 0, embedded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
            remaining INTEGER NOT NULL DEFAULT 0, summary JSONB NOT NULL DEFAULT '{}'::jsonb,
            started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS embedding_generations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL,
            model TEXT NOT NULL, dimensions INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'building',
            total_chunks INTEGER NOT NULL DEFAULT 0, embedded_chunks INTEGER NOT NULL DEFAULT 0, failed_chunks INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT false, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            activated_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_generation_active ON embedding_generations(domain_id) WHERE is_active",
        "ALTER TABLE material_index_runs ADD COLUMN IF NOT EXISTS generation_id UUID REFERENCES embedding_generations(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_materials_filters ON materials(subject, grade, year, region, kind)",
        "CREATE INDEX IF NOT EXISTS idx_materials_name_trgm ON materials USING gin (file_name gin_trgm_ops)",
        "CREATE INDEX IF NOT EXISTS idx_material_chunks_material ON material_chunks(material_id, chunk_index)",
        "CREATE INDEX IF NOT EXISTS idx_material_chunks_text_trgm ON material_chunks USING gin (chunk_text gin_trgm_ops)",
        "ALTER TABLE material_paths ADD COLUMN IF NOT EXISTS storage_path TEXT",
        "UPDATE material_paths p SET storage_path=COALESCE(m.metadata->>'sourceRelativePath',p.relative_path) FROM materials m WHERE p.material_id=m.id AND p.storage_path IS NULL",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }

    let vector_available: bool = sqlx::query_scalar(
        "SELECT to_regtype('vector') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'vector')",
    )
    .fetch_one(db)
    .await
    .unwrap_or(false);
    if vector_available {
        let registered: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='vector')",
        )
        .fetch_one(db)
        .await
        .unwrap_or(false);
        if registered {
            sqlx::query("CREATE EXTENSION IF NOT EXISTS vector")
                .execute(db)
                .await?;
        }
        sqlx::query("ALTER TABLE material_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024)")
            .execute(db)
            .await?;
        sqlx::query(
            r#"CREATE TABLE IF NOT EXISTS material_chunk_embeddings (
            generation_id UUID NOT NULL REFERENCES embedding_generations(id) ON DELETE CASCADE,
            chunk_id UUID NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
            embedding vector NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY(generation_id,chunk_id))"#,
        )
        .execute(db)
        .await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_generation ON material_chunk_embeddings(generation_id,chunk_id)").execute(db).await?;
        let dimensions: i32 = sqlx::query_scalar(
            "SELECT GREATEST(atttypmod,0) FROM pg_attribute WHERE attrelid='material_chunks'::regclass AND attname='embedding'",
        )
        .fetch_one(db)
        .await?;
        if dimensions <= 2_000 {
            sqlx::query("CREATE INDEX IF NOT EXISTS idx_material_chunks_embedding_hnsw ON material_chunks USING hnsw (embedding vector_cosine_ops)")
                .execute(db).await?;
        }
    }
    Ok(vector_available)
}
