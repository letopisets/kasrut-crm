#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.hetzner}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

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

docker compose --env-file "$ENV_FILE" $COMPOSE_FILES build
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES up -d
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES ps
