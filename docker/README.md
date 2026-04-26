# Docker Stack

Run the full stack through nginx:

```sh
docker compose up --build
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
