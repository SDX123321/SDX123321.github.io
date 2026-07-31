-- Performance indexes for high-traffic read paths.
-- All CREATE INDEX use IF NOT EXISTS so re-runs are no-ops.

-- gaokao_rag_search filters chunks.chunk_text ILIKE and joins docs.file_name / source_path ILIKE.
-- Without trigram indexes these are sequential scans over the whole chunk table.
CREATE INDEX IF NOT EXISTS idx_gaokao_rag_chunks_text_trgm
  ON gaokao_rag_chunks USING gin (chunk_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gaokao_rag_docs_name_trgm
  ON gaokao_rag_documents USING gin (file_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_gaokao_rag_docs_path_trgm
  ON gaokao_rag_documents USING gin (source_path gin_trgm_ops);

-- material detail loads paths by FK; material_id had no index.
CREATE INDEX IF NOT EXISTS idx_material_paths_material
  ON material_paths (material_id);

-- gaokao_questions list endpoint paginates with
-- ORDER BY year NULLS LAST, subject_key, question_number NULLS LAST, updated_at DESC, id.
-- Supporting index so unfiltered/lightly-filtered browsing can avoid a sort.
-- b-tree ASC already orders NULLS LAST for year/question_number, matching the query.
CREATE INDEX IF NOT EXISTS idx_gaokao_questions_order
  ON gaokao_questions (year, subject_key, question_number, updated_at DESC);

-- gaokao_weaknesses aggregates per user over the lateral jsonb array.
-- user_id is already the leading column of idx_gaokao_attempts_user_time; nothing to add here.
