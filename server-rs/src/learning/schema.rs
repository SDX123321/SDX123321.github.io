use super::*;

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false",
        "ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false",
        r#"CREATE TABLE IF NOT EXISTS user_preferences (
          user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, grade TEXT,
          subjects JSONB NOT NULL DEFAULT '[]'::jsonb, default_provider_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          onboarding_completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS chat_conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL, subject TEXT, grade TEXT, provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'completed', error TEXT, provider TEXT, model TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ)"#,
        r#"CREATE TABLE IF NOT EXISTS chat_message_sources (
          message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
          material_id UUID REFERENCES materials(id) ON DELETE SET NULL, chunk_id UUID, source_order INTEGER NOT NULL,
          file_name TEXT NOT NULL, excerpt TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          PRIMARY KEY(message_id,source_order))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graphs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL, version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'ready', is_current BOOLEAN NOT NULL DEFAULT false,
          node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(user_id,subject,version))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
          node_key TEXT NOT NULL, label TEXT NOT NULL, chapter TEXT NOT NULL, description TEXT NOT NULL,
          methods JSONB NOT NULL DEFAULT '[]'::jsonb, mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
          question_types JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE(graph_id,node_key))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES knowledge_graphs(id) ON DELETE CASCADE,
          source_key TEXT NOT NULL, target_key TEXT NOT NULL, relation TEXT NOT NULL DEFAULT 'prerequisite')"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_node_sources (
          node_id UUID NOT NULL REFERENCES knowledge_graph_nodes(id) ON DELETE CASCADE,
          material_id UUID REFERENCES materials(id) ON DELETE SET NULL, chunk_id UUID, file_name TEXT NOT NULL,
          excerpt TEXT NOT NULL, PRIMARY KEY(node_id,chunk_id))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_graph_generation_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL, provider_config_id UUID REFERENCES ai_provider_configs(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, graph_id UUID REFERENCES knowledge_graphs(id) ON DELETE SET NULL,
          error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        "ALTER TABLE knowledge_graphs ADD COLUMN IF NOT EXISTS source_revision TEXT",
        "ALTER TABLE knowledge_graphs ADD COLUMN IF NOT EXISTS source_metadata JSONB NOT NULL DEFAULT '[]'::jsonb",
        "ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS formulas JSONB NOT NULL DEFAULT '[]'::jsonb",
        "ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS source_pages TEXT",
        "ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS source_locator TEXT",
        "ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'intermediate'",
        "ALTER TABLE knowledge_graph_nodes ADD COLUMN IF NOT EXISTS importance DOUBLE PRECISION NOT NULL DEFAULT 0.5",
        "ALTER TABLE knowledge_graph_node_sources ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()",
        "UPDATE knowledge_graph_node_sources SET id=gen_random_uuid() WHERE id IS NULL",
        "ALTER TABLE knowledge_graph_node_sources ALTER COLUMN id SET NOT NULL",
        "ALTER TABLE knowledge_graph_node_sources ADD COLUMN IF NOT EXISTS source_locator TEXT",
        "ALTER TABLE knowledge_graph_node_sources ADD COLUMN IF NOT EXISTS source_url TEXT",
        r#"DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='knowledge_graph_node_sources'::regclass AND contype='p' AND conname<>'knowledge_graph_node_sources_id_pkey') THEN
            EXECUTE (SELECT format('ALTER TABLE knowledge_graph_node_sources DROP CONSTRAINT %I', conname) FROM pg_constraint WHERE conrelid='knowledge_graph_node_sources'::regclass AND contype='p' LIMIT 1);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='knowledge_graph_node_sources'::regclass AND contype='p') THEN
            ALTER TABLE knowledge_graph_node_sources ADD CONSTRAINT knowledge_graph_node_sources_id_pkey PRIMARY KEY(id);
          END IF;
        END $$"#,
        "ALTER TABLE knowledge_graph_node_sources ALTER COLUMN chunk_id DROP NOT NULL",
        "CREATE INDEX IF NOT EXISTS idx_conversations_user_time ON chat_conversations(user_id,updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_graphs_user_subject ON knowledge_graphs(user_id,subject,version DESC)",
        "INSERT INTO user_preferences(user_id,onboarding_completed_at) SELECT id,now() FROM users WHERE role<>'admin' ON CONFLICT(user_id) DO NOTHING",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    Ok(())
}
