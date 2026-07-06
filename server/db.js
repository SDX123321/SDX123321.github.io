import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@127.0.0.1:5432/exam_review',
})

export async function query(text, params) {
  return pool.query(text, params)
}

export async function ensureSchema() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS study_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      course TEXT,
      subject TEXT,
      page_path TEXT,
      object_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS study_snapshots (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      total_study_seconds INTEGER NOT NULL DEFAULT 0,
      chapter_done_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      practice_done_count INTEGER NOT NULL DEFAULT 0,
      mastery_item_count INTEGER NOT NULL DEFAULT 0,
      scroll_position_count INTEGER NOT NULL DEFAULT 0,
      recent_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
      current_streak_days INTEGER NOT NULL DEFAULT 0,
      last_activity_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS local_imports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      import_hash TEXT NOT NULL,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE (user_id, import_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_study_events_user_time ON study_events(user_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  `)
}
