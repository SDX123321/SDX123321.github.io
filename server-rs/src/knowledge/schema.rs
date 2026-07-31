use super::*;

pub(crate) async fn ensure_schema(db: &PgPool) -> anyhow::Result<()> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS content_domains (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_subjects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_key TEXT NOT NULL, name TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          UNIQUE(domain_id,subject_key))"#,
        r#"CREATE TABLE IF NOT EXISTS knowledge_courses (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE SET NULL, course_key TEXT NOT NULL, name TEXT NOT NULL,
          route TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, UNIQUE(domain_id,course_key))"#,
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES content_domains(id) ON DELETE RESTRICT",
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE SET NULL",
        "ALTER TABLE materials ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES knowledge_courses(id) ON DELETE SET NULL",
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_graphs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          subject_id UUID REFERENCES knowledge_subjects(id) ON DELETE CASCADE, version INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
          node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
          created_by UUID REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_at TIMESTAMPTZ, UNIQUE(domain_id,subject_id,version))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_nodes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES canonical_knowledge_graphs(id) ON DELETE CASCADE,
          node_key TEXT NOT NULL, label TEXT NOT NULL, aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
          summary TEXT NOT NULL DEFAULT '', tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          occurrence_count INTEGER NOT NULL DEFAULT 0, document_frequency INTEGER NOT NULL DEFAULT 0,
          question_frequency INTEGER NOT NULL DEFAULT 0, source_diversity INTEGER NOT NULL DEFAULT 0,
          centrality DOUBLE PRECISION NOT NULL DEFAULT 0, importance DOUBLE PRECISION NOT NULL DEFAULT 0,
          UNIQUE(graph_id,node_key))"#,
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_level TEXT NOT NULL DEFAULT 'intermediate'",
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_score INTEGER NOT NULL DEFAULT 50",
        "ALTER TABLE canonical_knowledge_nodes ADD COLUMN IF NOT EXISTS difficulty_reason TEXT NOT NULL DEFAULT ''",
        r#"CREATE TABLE IF NOT EXISTS canonical_knowledge_edges (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), graph_id UUID NOT NULL REFERENCES canonical_knowledge_graphs(id) ON DELETE CASCADE,
          source_key TEXT NOT NULL, target_key TEXT NOT NULL, relation TEXT NOT NULL,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0.5, evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
          UNIQUE(graph_id,source_key,target_key,relation))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_node_sources (
          node_id UUID NOT NULL REFERENCES canonical_knowledge_nodes(id) ON DELETE CASCADE,
          material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
          chunk_id UUID NOT NULL REFERENCES material_chunks(id) ON DELETE CASCADE,
          excerpt TEXT NOT NULL, PRIMARY KEY(node_id,chunk_id))"#,
        r#"CREATE TABLE IF NOT EXISTS canonical_graph_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL REFERENCES content_domains(id),
          subject_id UUID REFERENCES knowledge_subjects(id), requested_by UUID REFERENCES users(id),
          graph_id UUID REFERENCES canonical_knowledge_graphs(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS user_knowledge_node_states (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          node_id UUID NOT NULL REFERENCES canonical_knowledge_nodes(id) ON DELETE CASCADE,
          mastery INTEGER NOT NULL DEFAULT 0 CHECK(mastery BETWEEN 0 AND 100), favorite BOOLEAN NOT NULL DEFAULT false,
          note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,node_id))"#,
        r#"CREATE TABLE IF NOT EXISTS user_knowledge_states (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          domain_id UUID NOT NULL REFERENCES content_domains(id) ON DELETE CASCADE,
          scope_key TEXT NOT NULL, concept_key TEXT NOT NULL,
          mastery INTEGER NOT NULL DEFAULT 0 CHECK(mastery BETWEEN 0 AND 100), favorite BOOLEAN NOT NULL DEFAULT false,
          note TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY(user_id,domain_id,scope_key,concept_key))"#,
        r#"CREATE TABLE IF NOT EXISTS suggested_questions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_key TEXT NOT NULL DEFAULT 'high-school',
          subject TEXT NOT NULL, grade TEXT, question TEXT NOT NULL, model TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active', use_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(domain_key,subject,grade,question))"#,
        r#"CREATE TABLE IF NOT EXISTS suggested_question_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subject TEXT NOT NULL, grade TEXT,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS web_research_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), domain_id UUID NOT NULL, subject TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'queued', progress INTEGER NOT NULL DEFAULT 0, query_count INTEGER NOT NULL DEFAULT 0,
          visited_count INTEGER NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0, error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())"#,
        r#"CREATE TABLE IF NOT EXISTS web_knowledge_evidence (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID NOT NULL REFERENCES web_research_runs(id) ON DELETE CASCADE,
          domain_id UUID NOT NULL, subject TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', host TEXT NOT NULL,
          excerpt TEXT NOT NULL, content_hash TEXT NOT NULL, concept TEXT, relation TEXT, target_concept TEXT,
          confidence DOUBLE PRECISION NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'candidate', fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(run_id,url,content_hash))"#,
        "CREATE INDEX IF NOT EXISTS idx_materials_domain_subject ON materials(domain_id,subject_id,updated_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_canonical_graph_current ON canonical_knowledge_graphs(domain_id,subject_id,status,published_at DESC)",
    ];
    for statement in statements {
        sqlx::query(statement).execute(db).await?;
    }
    sqlx::query("INSERT INTO content_domains(domain_key,name,description,sort_order) VALUES ('high-school','高中','高中课程、试卷与备考资料',10),('university','大学','大学课程、讲义与期末复习资料',20) ON CONFLICT(domain_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description")
        .execute(db).await?;
    sqlx::query("UPDATE materials SET domain_id=(SELECT id FROM content_domains WHERE domain_key='high-school') WHERE domain_id IS NULL")
        .execute(db).await?;
    sqlx::query(r#"INSERT INTO user_knowledge_states(user_id,domain_id,scope_key,concept_key,mastery,favorite,note,updated_at)
      SELECT s.user_id,g.domain_id,COALESCE(g.subject_id::text,'all'),
        CASE WHEN n.node_key LIKE 'concept-%' THEN n.node_key ELSE 'concept-'||substr(encode(digest(n.label,'sha256'),'hex'),1,24) END,
        s.mastery,s.favorite,s.note,s.updated_at
      FROM user_knowledge_node_states s JOIN canonical_knowledge_nodes n ON n.id=s.node_id
      JOIN canonical_knowledge_graphs g ON g.id=n.graph_id ON CONFLICT DO NOTHING"#).execute(db).await?;
    Ok(())
}
