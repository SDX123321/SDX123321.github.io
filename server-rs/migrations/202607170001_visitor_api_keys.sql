-- Migration to create visitor_api_keys table
CREATE TABLE IF NOT EXISTS visitor_api_keys (
  api_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
