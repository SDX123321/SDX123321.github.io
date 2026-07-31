use super::*;

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_status TEXT NOT NULL DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ",
        "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        r#"CREATE TABLE IF NOT EXISTS auth_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            username TEXT, event_type TEXT NOT NULL, ip_address TEXT, user_agent TEXT,
            risk_level TEXT NOT NULL DEFAULT 'info', metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS ai_provider_configs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL,
            api_key_ciphertext TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS ai_usage_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            provider TEXT NOT NULL, model TEXT NOT NULL, input_chars INTEGER NOT NULL DEFAULT 0,
            output_chars INTEGER NOT NULL DEFAULT 0, latency_ms INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS input_tokens INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS output_tokens INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE ai_usage_events ADD COLUMN IF NOT EXISTS ttft_ms INTEGER",
        r#"CREATE TABLE IF NOT EXISTS material_uploads (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(), requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
            file_name TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE, size_bytes BIGINT NOT NULL,
            status TEXT NOT NULL DEFAULT 'queued', error TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "CREATE INDEX IF NOT EXISTS idx_auth_events_user_time ON auth_events(user_id,created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON ai_usage_events(user_id,created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_provider_configs_user ON ai_provider_configs(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_material_uploads_time ON material_uploads(created_at DESC)",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}
