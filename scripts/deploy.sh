#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_ENV="deploy/env/compose.env"
APP_ENV="deploy/env/app.env"

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

mkdir -p deploy/env deploy/data/backups

if [ ! -f "$COMPOSE_ENV" ]; then
  cat > "$COMPOSE_ENV" <<EOF
LABELHUB_HTTP_PORT=18080
PUBLIC_HOST=121.196.209.131
LABELHUB_MYSQL_DATABASE=labelhub
LABELHUB_MYSQL_USER=labelhub
LABELHUB_MYSQL_PASSWORD=$(generate_secret)
LABELHUB_MYSQL_ROOT_PASSWORD=$(generate_secret)
EOF
  echo "Created $COMPOSE_ENV"
fi

if [ ! -f "$APP_ENV" ]; then
  cat > "$APP_ENV" <<EOF
SESSION_COOKIE_NAME=labelhub_session
SESSION_SECRET=$(generate_secret)
SESSION_COOKIE_SECURE=false
SESSION_MAX_AGE_SECONDS=28800
SYSTEM_AGENT_TOKEN=$(generate_secret)
AGENT_WORKER_ID=labelhub-agent-production
AGENT_POLL_INTERVAL_SECONDS=5
API_TIMEOUT_SECONDS=30
REVIEW_JOB_LOCK_TIMEOUT_SECONDS=300
OPENAI_API_KEY=
BASE_URL=https://your-openai-compatible-provider/v1
MODEL_NAME=your-model-name
OPENAI_TIMEOUT_SECONDS=120
LLM_TEMPERATURE=0.2
LLM_EXTRA_BODY_JSON=
EOF
  echo "Created $APP_ENV"
  echo "Fill OPENAI_API_KEY, BASE_URL and MODEL_NAME in $APP_ENV before using AI review features."
fi

docker compose --env-file "$COMPOSE_ENV" -f deploy/compose.yaml up -d --build
docker compose --env-file "$COMPOSE_ENV" -f deploy/compose.yaml ps

# shellcheck disable=SC1090
set -a
. "$COMPOSE_ENV"
set +a

echo
echo "LabelHub is deploying at: http://${PUBLIC_HOST:-127.0.0.1}:${LABELHUB_HTTP_PORT:-18080}"
echo "Health check:          http://${PUBLIC_HOST:-127.0.0.1}:${LABELHUB_HTTP_PORT:-18080}/health"
