#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.hetzner}"
IMPORT_SQL="${IMPORT_SQL:-docs/kashrut-export/import.sql}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
    return
  fi
  echo "Docker Compose is not installed." >&2
  exit 1
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

if [ ! -f "$IMPORT_SQL" ]; then
  echo "Missing $IMPORT_SQL. Generate it with npm run export:pdf from kasrut-api." >&2
  exit 1
fi

# Exports generated before per-rabbanut mashgiach ids (migrations
# 20260714095000/20260714100000) link one mashgiach profile to restaurants of
# several rabbanuts; the tenant triggers reject them, or they would undo the
# split. Only replay an export that carries the marker line.
if ! grep -q '^-- mashgiach-ids: per-rabbanut' "$IMPORT_SQL"; then
  echo "$IMPORT_SQL predates per-rabbanut mashgiach ids. Regenerate it with npm run export:pdf from kasrut-api, or use npm run import:pdf." >&2
  exit 1
fi

set -a
. "./$ENV_FILE"
set +a

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-kashrutcrm_db}"

echo "Importing $IMPORT_SQL into $POSTGRES_DB as $POSTGRES_USER..."
compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$IMPORT_SQL"

compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "select 'restaurants' as table_name, count(*) from restaurants union all select 'documents', count(*) from documents union all select 'hechsherim', count(*) from hechsherim union all select 'rabbanuts', count(*) from rabbanuts;"
