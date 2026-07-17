#!/bin/sh
set -eu

mkdir -p "$(dirname "${OLLAMA_ENV_PATH:-/config/.env}")"
if [ ! -f "${OLLAMA_ENV_PATH:-/config/.env}" ]; then
  cat > "${OLLAMA_ENV_PATH:-/config/.env}" <<EOF
OLLAMA_URL=${OLLAMA_URL:-http://host.docker.internal:11434}
EMBEDDING_MODEL=${EMBEDDING_MODEL:-qwen3-embedding:8b}
CHAT_MODEL=${CHAT_MODEL:-qwen3:8b}
EOF
fi

exec "$@"
