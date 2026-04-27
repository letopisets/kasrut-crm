#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Running database migrations..."
  npx prisma migrate deploy
fi

if [ "${SEED_DB:-false}" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  node dist/prisma/seed.js
fi

exec "$@"
