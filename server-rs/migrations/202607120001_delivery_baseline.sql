CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector is unavailable; semantic search will use its configured fallback';
END
$$;

CREATE TABLE IF NOT EXISTS app_schema_metadata (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_schema_metadata(key,value)
VALUES ('migration_system', jsonb_build_object('runner','sqlx','baseline','2026-07-12'))
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();

ALTER TABLE IF EXISTS gaokao_questions ADD COLUMN IF NOT EXISTS display_complete BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE IF EXISTS gaokao_questions ADD COLUMN IF NOT EXISTS incomplete_reason TEXT;
ALTER TABLE IF EXISTS material_index_runs ADD COLUMN IF NOT EXISTS generation_id UUID;
