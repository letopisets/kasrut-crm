#!/bin/sh
set -eu

# Restore a Postgres dump produced by scripts/backup-postgres.sh.
#
# DESTRUCTIVE: overwrites the target database. By default it refuses to touch
# the live prod DB and restores into a throwaway verification database so you
# can prove a backup is good WITHOUT risking prod. Pass RESTORE_DB explicitly
# (and CONFIRM=yes) to restore somewhere real.
#
# Usage:
#   sh scripts/restore-postgres.sh backups/postgres/<db>-<ts>.sql.gz
#
# Env:
#   ENV_FILE     compose env file with POSTGRES_* (default .env.hetzner)
#   RESTORE_DB   database name to restore INTO (default: <POSTGRES_DB>_restore_check)
#   CONFIRM      must be "yes" when RESTORE_DB equals the live POSTGRES_DB

ENV_FILE="${ENV_FILE:-.env.hetzner}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

dump="${1:-}"
[ -n "$dump" ] || { echo "Usage: sh scripts/restore-postgres.sh <dump.sql.gz>" >&2; exit 1; }
[ -f "$dump" ] || { echo "No such file: $dump" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Run from the project root on the server." >&2; exit 1; }

gzip -t "$dump" || { echo "Corrupt gzip: $dump" >&2; exit 1; }

set -a
case "$ENV_FILE" in
  */*) . "$ENV_FILE" ;;
  *) . "./$ENV_FILE" ;;
esac
set +a

live_db="${POSTGRES_DB:-kashrutcrm_db}"
user="${POSTGRES_USER:-postgres}"
target="${RESTORE_DB:-${live_db}_restore_check}"

if [ "$target" = "$live_db" ] && [ "${CONFIRM:-no}" != "yes" ]; then
  echo "Refusing to restore into the LIVE database '$live_db'." >&2
  echo "Re-run with CONFIRM=yes RESTORE_DB=$live_db to overwrite prod, or leave" >&2
  echo "RESTORE_DB unset to restore into the safe verification DB instead." >&2
  exit 1
fi

psql() { docker compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres psql -U "$user" "$@"; }

echo "Recreating target database '$target'..."
psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$target\";"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target\";"

echo "Restoring $dump into '$target'..."
gunzip -c "$dump" | docker compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  psql -U "$user" -d "$target" -v ON_ERROR_STOP=1 >/dev/null

count="$(psql -d "$target" -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')"
echo "Restore OK — '$target' has $count public tables."
[ "$target" != "$live_db" ] && echo "This was a verification restore; drop it when done: DROP DATABASE \"$target\";"
exit 0
