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
#
# The target must have no open connections (DROP DATABASE refuses otherwise):
# to restore over the live DB, stop the api first (`... stop api`) and start
# it again afterwards (`... up -d`).

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

# DROP DATABASE fails while anyone is connected to the target, which for the
# live DB is the api (and a backup that happens to run). Say what to do rather
# than surfacing Postgres's "is being accessed by other users".
sessions="$(psql -d postgres -t -A -v ON_ERROR_STOP=1 -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = '$target';" | tr -d ' \r')"
if [ "$sessions" != "0" ]; then
  echo "Refusing: $sessions other session(s) are connected to '$target'; nothing was changed." >&2
  if [ "$target" = "$live_db" ]; then
    echo "Stop the api first, restore, then start it again:" >&2
    echo "  docker compose --env-file $ENV_FILE $COMPOSE_FILES stop api" >&2
    echo "  CONFIRM=yes RESTORE_DB=$live_db sh scripts/restore-postgres.sh $dump" >&2
    echo "  docker compose --env-file $ENV_FILE $COMPOSE_FILES up -d" >&2
  fi
  exit 1
fi

echo "Recreating target database '$target'..."
psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$target\";"
psql -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target\";"

echo "Restoring $dump into '$target'..."
gunzip -c "$dump" | docker compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  psql -U "$user" -d "$target" -v ON_ERROR_STOP=1 >/dev/null

count="$(psql -d "$target" -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ')"
echo "Restore OK — '$target' has $count public tables."
if [ "$target" = "$live_db" ]; then
  echo "Start the api again: docker compose --env-file $ENV_FILE $COMPOSE_FILES up -d"
else
  echo "This was a verification restore; drop it when done: DROP DATABASE \"$target\";"
fi
exit 0
