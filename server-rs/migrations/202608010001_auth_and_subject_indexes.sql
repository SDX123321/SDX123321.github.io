CREATE INDEX IF NOT EXISTS idx_gaokao_questions_sorting
    ON gaokao_questions(subject_key, year, question_number, updated_at DESC, id);

CREATE INDEX IF NOT EXISTS idx_visitor_api_keys_expires ON visitor_api_keys(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
