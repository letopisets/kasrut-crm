#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.hetzner}"
BACKUP_DIR="${BACKUP_DIR:-backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Run this from the project root on the server." >&2
  exit 1
fi

set -a
case "$ENV_FILE" in
  */*) . "$ENV_FILE" ;;
  *) . "./$ENV_FILE" ;;
esac
set +a

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/${POSTGRES_DB:-kashrutcrm_db}-$timestamp.sql.gz"

docker compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-kashrutcrm_db}" \
  | gzip > "$backup_file"

find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

echo "Created $backup_file"
