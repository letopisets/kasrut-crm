#!/bin/sh
set -eu

ENV_FILE="${ENV_FILE:-.env.hetzner}"
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.prod.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.hetzner.example and fill production values." >&2
  exit 1
fi

git pull --ff-only
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES build
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES up -d
docker compose --env-file "$ENV_FILE" $COMPOSE_FILES ps
