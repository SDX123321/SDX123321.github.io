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

    CREATE TABLE IF NOT EXISTS gaokao_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      detail TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source_type TEXT NOT NULL DEFAULT 'local',
      relative_path TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gaokao_papers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      paper_key TEXT NOT NULL UNIQUE,
      year INTEGER,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      paper_name TEXT NOT NULL,
      paper_kind TEXT NOT NULL DEFAULT 'exam',
      status TEXT NOT NULL DEFAULT 'indexed',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gaokao_questions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      question_key TEXT NOT NULL UNIQUE,
      paper_id UUID REFERENCES gaokao_papers(id) ON DELETE SET NULL,
      year INTEGER,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      question_number INTEGER,
      question_type TEXT,
      difficulty TEXT,
      quality TEXT NOT NULL DEFAULT 'indexed',
      prompt TEXT NOT NULL,
      answer TEXT,
      solution JSONB NOT NULL DEFAULT '[]'::jsonb,
      flags JSONB NOT NULL DEFAULT '[]'::jsonb,
      source_type TEXT NOT NULL DEFAULT 'real',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gaokao_question_tags (
      question_id UUID NOT NULL REFERENCES gaokao_questions(id) ON DELETE CASCADE,
      tag_type TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (question_id, tag_type, tag)
    );

    CREATE TABLE IF NOT EXISTS gaokao_subject_profiles (
      subject_key TEXT PRIMARY KEY,
      subject_name TEXT NOT NULL,
      accent TEXT,
      icon TEXT,
      route TEXT,
      trend TEXT,
      advice TEXT,
      high_frequency JSONB NOT NULL DEFAULT '[]'::jsonb,
      easy_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gaokao_trend_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_key TEXT,
      year INTEGER,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source_name TEXT,
      source_url TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS gaokao_import_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      import_key TEXT NOT NULL UNIQUE,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_study_events_user_time ON study_events(user_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_gaokao_papers_subject_year ON gaokao_papers(subject_key, year);
    CREATE INDEX IF NOT EXISTS idx_gaokao_questions_subject_year ON gaokao_questions(subject_key, year);
    CREATE INDEX IF NOT EXISTS idx_gaokao_questions_quality ON gaokao_questions(quality);
    CREATE INDEX IF NOT EXISTS idx_gaokao_questions_source_type ON gaokao_questions(source_type);
  `)
}
