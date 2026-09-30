#!/bin/sh
set -eu

# Production deploy (docs/deployment/hetzner.md#deploy). Run it from the repo
# root on the server after `git pull --ff-only`: sh keeps running the copy of
# this script it started with, so changes a pull brings to this file take
# effect on the next run.
#
# Env (all optional):
#   ENV_FILE        compose env file (default .env.hetzner)
#   DEPLOY_BRANCH   check out and pull this branch instead of the current one
#   DEPLOY_SHA      refuse to deploy unless HEAD is this commit
#   SKIP_BACKUP     "yes" skips the pre-deploy backup, and so the rehearsal
#   SKIP_REHEARSAL  "yes" skips the migration rehearsal on that backup

ENV_FILE="${ENV_FILE:-.env.hetzner}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"
ROLLBACK_TAG="rollback"
APP_SERVICES="api kasrut-map kasrut-crm"

# stdin is closed for every compose call that does not need it: `exec` and
# `run` would otherwise swallow the rest of a script piped in over ssh.
dc() { docker compose --env-file "$ENV_FILE" $COMPOSE_FILES "$@" </dev/null; }

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.hetzner.example and fill production values." >&2
  exit 1
fi

if [ -n "${DEPLOY_BRANCH:-}" ]; then
  git fetch --prune origin "$DEPLOY_BRANCH"
  if git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH"; then
    git checkout "$DEPLOY_BRANCH"
  else
    git checkout -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
  fi
  git pull --ff-only origin "$DEPLOY_BRANCH"
else
  git pull --ff-only
fi

if [ -n "${DEPLOY_SHA:-}" ]; then
  current_sha="$(git rev-parse HEAD)"
  if [ "$current_sha" != "$DEPLOY_SHA" ]; then
    echo "Refusing to deploy $current_sha; expected $DEPLOY_SHA." >&2
    exit 1
  fi
fi

# ── Rollback images ───────────────────────────────────────────────────────────
# `build` moves <project>-<service>:latest to the new images and leaves the
# ones the running containers use untagged (and prunable). Tag those first, so
# that a code rollback re-tags them instead of rebuilding the old commit.
for service in $APP_SERVICES; do
  container="$(dc ps -q "$service")"
  [ -n "$container" ] || continue
  image_name="$(docker inspect -f '{{.Config.Image}}' "$container")"
  image_id="$(docker inspect -f '{{.Image}}' "$container")"
  docker tag "$image_id" "${image_name%:*}:$ROLLBACK_TAG"
  echo "Rollback image: ${image_name%:*}:$ROLLBACK_TAG (what $service runs now)"
done

dc build

# The API refuses to start with a placeholder or low-entropy JWT_SECRET /
# MAP_JWT_SECRET / ENCRYPTION_KEY, or a MAP_JWT_SECRET that repeats JWT_SECRET.
# Check the new image against the env before replacing the running containers,
# so a bad secret aborts the deploy instead of crash-looping.
if ! dc run --rm --no-deps -T --entrypoint node api -e "require('./dist/kasrut-api/src/config/env')"; then
  echo "API env validation failed; fix $ENV_FILE (see docs/deployment/hetzner.md). Nothing was restarted." >&2
  exit 1
fi

# A local docker-compose.prod.yml that replaced the redis command and its
# healthcheck could start redis without a password, and the api would still
# connect (ioredis only warns). Both must survive the merge.
merged="$(dc config)"
if ! printf '%s\n' "$merged" | grep -Eq -- '--requirepass "\$\$?REDIS_PASSWORD"' \
  || ! printf '%s\n' "$merged" | grep -q 'grep -q NOAUTH'; then
  echo "The merged compose config starts redis without --requirepass or without its NOAUTH" >&2
  echo "healthcheck (a local override?); see docs/deployment/hetzner.md#redis-password." >&2
  echo "Nothing was restarted." >&2
  exit 1
fi
unset merged

# ── Backup and migration rehearsal ────────────────────────────────────────────
# `up -d` applies new migrations through the api entrypoint, and some of them
# change data for good. Back up right before, then apply the migrations to a
# copy of that backup, so a migration that fails on production data stops the
# deploy while the old containers still run.
if [ "${SKIP_BACKUP:-no}" != "yes" ]; then
  backup_log="$(mktemp)"
  if ! ENV_FILE="$ENV_FILE" sh scripts/backup-postgres.sh > "$backup_log" 2>&1 </dev/null; then
    cat "$backup_log" >&2
    rm -f "$backup_log"
    echo "Pre-deploy backup failed. Nothing was restarted." >&2
    exit 1
  fi
  cat "$backup_log"
  dump="$(sed -n 's/^Created \(.*\) ([0-9]* bytes)$/\1/p' "$backup_log")"
  rm -f "$backup_log"
  if [ -z "$dump" ] || [ ! -f "$dump" ]; then
    echo "Could not find the file the backup wrote. Nothing was restarted." >&2
    exit 1
  fi
  echo "Pre-deploy backup: $dump"

  if [ "${SKIP_REHEARSAL:-no}" != "yes" ]; then
    live_db="$(dc exec -T postgres sh -c 'printf %s "$POSTGRES_DB"')"
    rehearsal_db="${live_db}_deploy_rehearsal"
    ENV_FILE="$ENV_FILE" RESTORE_DB="$rehearsal_db" sh scripts/restore-postgres.sh "$dump" </dev/null
    # The new image migrates the copy, through the api's own DATABASE_URL with
    # the database name swapped: no credentials pass through this script.
    if ! dc run --rm --no-deps -T -e REHEARSAL_DB="$rehearsal_db" --entrypoint sh api -c '
      base="${DATABASE_URL%%\?*}"
      query="${DATABASE_URL#"$base"}"
      DATABASE_URL="${base%/*}/$REHEARSAL_DB$query" npx prisma migrate deploy'; then
      echo "The migrations failed on a copy of the production data (database '$rehearsal_db'," >&2
      echo "kept for inspection; drop it when done). Nothing was restarted." >&2
      exit 1
    fi
    dc exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' sh "$rehearsal_db"
    echo "Migration rehearsal passed on a copy of $dump."
  fi
else
  echo "SKIP_BACKUP=yes: no pre-deploy backup and no migration rehearsal." >&2
fi

dc up -d

# ── After the switch ──────────────────────────────────────────────────────────
warnings=0
api_container="$(dc ps -q api)"
tries=0
until [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$api_container")" = "healthy" ]; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    echo "The api is not healthy after 5 minutes. Check \`logs api\`; see Rollback in docs/deployment/hetzner.md." >&2
    exit 1
  fi
  sleep 5
done

# nginx resolves `upstream kasrut_api { server api:3000; }` once, when it
# starts, so a recreated api container on a new address would get 502s until
# a reload. The reload is graceful, and `nginx -t` keeps a broken file out.
if [ -n "$(dc ps -q nginx)" ] && ! dc exec -T nginx sh -c 'nginx -t -q && nginx -s reload'; then
  echo "WARNING: nginx was not reloaded; if /health answers 502, reload it by hand." >&2
  warnings=1
fi

# The running redis must refuse anonymous clients (see the config check).
if ! dc exec -T redis redis-cli ping 2>&1 | grep -q NOAUTH; then
  echo "WARNING: redis answers without a password; see docs/deployment/hetzner.md#redis-password." >&2
  warnings=1
fi

dc ps
exit "$warnings"
