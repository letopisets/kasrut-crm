#!/bin/sh
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi

if [ "${SEED_DB:-false}" = "true" ]; then
  npx ts-node --transpile-only prisma/seed.ts
fi

exec "$@"
