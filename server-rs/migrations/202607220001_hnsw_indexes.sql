-- Add HNSW vector indexes for fast vector similarity search if pgvector extension exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_gaokao_embedding_hnsw ON gaokao_question_embeddings USING hnsw (embedding vector_cosine_ops)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_material_embedding_hnsw ON material_chunk_embeddings USING hnsw (embedding vector_cosine_ops)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping HNSW index creation as vector table or column was missing';
END
$$;
