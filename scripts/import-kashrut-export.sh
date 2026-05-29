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
