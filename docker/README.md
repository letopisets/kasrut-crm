# Docker Stack

Run the full stack through nginx:

```sh
docker compose up --build
```

Compose refuses to start until `.env` (next to `docker-compose.yml`) sets
`POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY` and `REDIS_PASSWORD` — see
the Docker Compose block of `.env.example`. Redis runs with `--requirepass`, and
the api receives the password inside `REDIS_URL` (`redis://:<password>@redis:6379`),
so it must be URL-safe. Set the `REDIS_PASSWORD=` line (empty in `.env.example`)
to the output of:

```sh
openssl rand -hex 32
```

`redis-cli` in the container needs the password too. Pass it through
`REDISCLI_AUTH`, taken from the container's own environment, so it stays out of
the command line and shell history:

```sh
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
```

Default URLs:

- Map: http://localhost:8080 or http://map.localhost:8080
- CRM: http://crm.localhost:8080
- API health: http://localhost:8080/health
- API routes: http://localhost:8080/api

Useful environment overrides:

```sh
NGINX_PORT=80 docker compose up --build
SEED_DB=true docker compose up --build
```

`SEED_DB=true` runs the API seed script on container start and resets domain data to the seed contents. Leave it off for persistent database data.
