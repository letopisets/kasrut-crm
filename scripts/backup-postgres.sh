#!/bin/sh
set -eu

# Automated Postgres backup for the KashrutCRM/Map prod stack.
#
# Local dump (always) + optional offsite copy + optional monitoring ping.
# Designed to be run from cron on the Hetzner host, from the repo root.
#
# Env (all optional except a valid ENV_FILE):
#   ENV_FILE        compose env file with POSTGRES_* (default .env.hetzner)
#   BACKUP_DIR      where local dumps land (default backups/postgres)
#   RETENTION_DAYS  prune dumps older than this, local + remote (default 14)
#   BACKUP_REMOTE   rclone target for offsite copy, e.g. "hetzner-box:kashrut-db"
#                   (leave unset to keep local-only). Requires rclone installed.
#   BACKUP_PING_URL healthchecks.io / Better Stack URL pinged on success
#                   (and on failure with /fail) so a missed backup alerts you.

ENV_FILE="${ENV_FILE:-.env.hetzner}"
BACKUP_DIR="${BACKUP_DIR:-backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

ping_hc() {
  # $1 = "" for success, "/fail" for failure. Never let a ping error abort us.
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 10 --retry 3 "${BACKUP_PING_URL}${1:-}" >/dev/null 2>&1 || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 10 -O /dev/null "${BACKUP_PING_URL}${1:-}" >/dev/null 2>&1 || true
  fi
}

fail() {
  echo "backup-postgres: $1" >&2
  ping_hc /fail
  exit 1
}

[ -f "$ENV_FILE" ] || fail "Missing $ENV_FILE. Run this from the project root on the server."

set -a
case "$ENV_FILE" in
  */*) . "$ENV_FILE" ;;
  *) . "./$ENV_FILE" ;;
esac
set +a

mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
db="${POSTGRES_DB:-kashrutcrm_db}"
backup_file="$BACKUP_DIR/${db}-$timestamp.sql.gz"
raw_file="$BACKUP_DIR/.${db}-$timestamp.sql.part"

cleanup() { rm -f "$raw_file"; }
trap cleanup EXIT

# Dump to a plain file first. With a `pg_dump | gzip` pipe, `set -e` only sees
# gzip's exit code, so a failed dump would still write a valid-looking (tiny)
# .gz and the backup would be reported as successful. Dumping without a pipe
# lets `set -e` catch a pg_dump failure directly, and we then validate the
# result before compressing.
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-postgres}" -d "$db" > "$raw_file" \
  || fail "pg_dump failed"

[ -s "$raw_file" ] || fail "dump is empty — refusing to overwrite backups"
# A real pg_dump carries this header; its absence means we captured an error
# message or a truncated stream, not a usable backup.
head -c 4096 "$raw_file" | grep -q "PostgreSQL database dump" \
  || fail "dump missing expected header — not a valid backup"

gzip -c "$raw_file" > "$backup_file" || fail "gzip failed"
gzip -t "$backup_file" || fail "gzip integrity check failed"

# Prune old LOCAL dumps.
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete

size="$(wc -c < "$backup_file" | tr -d ' ')"
echo "Created $backup_file ($size bytes)"

# Offsite copy — the single most important safeguard: a local-only dump dies
# with the disk/server it lives on.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$backup_file" "$BACKUP_REMOTE" || fail "rclone copy to $BACKUP_REMOTE failed"
    rclone delete --min-age "${RETENTION_DAYS}d" "$BACKUP_REMOTE" >/dev/null 2>&1 || true
    echo "Uploaded to $BACKUP_REMOTE"
  else
    fail "BACKUP_REMOTE set but rclone is not installed — offsite copy REQUIRED, aborting"
  fi
else
  echo "WARNING: BACKUP_REMOTE unset — local-only backup. Set it for offsite safety." >&2
fi

ping_hc
