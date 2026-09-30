# Tests

The check commands each package's CI job runs are in
`.github/workflows/ci.yml`. This page covers what needs more than `npx jest`.

## API suites against a real Postgres and Redis

Most API suites mock Prisma and Redis. Three opt-in suites run the real Prisma
client (with the pg adapter) and the real Lua script instead, because the
mocks cannot see what the driver returns, the tenant triggers or the
2FA single-use writes. They skip themselves unless their variable is set:

| Suite | Variable | Covers |
| --- | --- | --- |
| `mapCommunity.postgres.test.ts` | `POSTGRES_TEST_DATABASE_URL` | suggestion quota lock, suggestion approval, token purge |
| `security.postgres.test.ts` | `POSTGRES_TEST_DATABASE_URL` | 2FA single use, tenant triggers, restaurant moves |
| `loginThrottle.redis.test.ts` | `LOGIN_THROTTLE_REDIS_URL` | login lockout arithmetic in the Lua script |

Point them at **throwaway** servers only: the suites insert and delete rows
and keys. From `kasrut-api/` (Git Bash; the containers go away on `stop`):

```sh
docker run -d --rm --name kwt-test-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16-alpine
docker run -d --rm --name kwt-test-redis -p 56379:6379 redis:7-alpine
export PG=postgresql://postgres:pw@127.0.0.1:55432/postgres

DATABASE_URL=$PG npx prisma migrate deploy
POSTGRES_TEST_DATABASE_URL=$PG LOGIN_THROTTLE_REDIS_URL=redis://127.0.0.1:56379 \
  npx jest --runInBand mapCommunity.postgres security.postgres loginThrottle.redis

docker stop kwt-test-pg kwt-test-redis
```

`DATABASE_URL` must be set on the command line: `prisma.config.ts` loads
`kasrut-api/.env` through dotenv, which does not override a variable that is
already set, so the migration goes to the throwaway database and never to the
one in `.env`.

## Migration drift check

CI applies every migration to an empty database and fails when the result
differs from `prisma/schema.prisma` (a migration missing from a schema change,
or the reverse). Locally, against the throwaway Postgres above after
`migrate deploy`:

```sh
DATABASE_URL=$PG npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Exit code 0 prints "No difference detected."; 2 means drift, and the printed
SQL is what is missing. `--from-config-datasource` compares the live database
itself, so no shadow database is needed.
