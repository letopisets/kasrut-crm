# Hetzner Deployment

This project is prepared for a single-server Hetzner CX32 deployment with Docker Compose.

## Server Setup

Use Ubuntu LTS, then install Docker Engine and the Docker Compose plugin. Open only SSH and web traffic in the firewall:

```sh
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Point DNS through Cloudflare:

- `map.your-domain.com` -> server IPv4
- `crm.your-domain.com` -> server IPv4

For the first release, Cloudflare SSL mode can be `Full` while Nginx listens on port 80 on the origin.

## Production Config

On the server:

```sh
cp .env.hetzner.example .env.hetzner
```

Fill strong values for:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `CORS_ORIGINS`
- `GOOGLE_CLIENT_ID`
- `APPLE_CLIENT_ID`
- `VITE_APPLE_REDIRECT_URI`

Then replace the placeholder domains in `docker/nginx/production.conf`:

- `map.your-domain.com`
- `crm.your-domain.com`

Keep `SEED_DB=false` in production unless you intentionally want to reset seed data.

## Deploy

```sh
sh scripts/hetzner-deploy.sh
```

Equivalent manual commands:

```sh
git pull --ff-only
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml build
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Check the stack:

```sh
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml ps
curl -f http://127.0.0.1/health
```

Public checks:

- `https://map.your-domain.com/health`
- `https://map.your-domain.com`
- `https://crm.your-domain.com`

## Backups

Create a Postgres backup:

```sh
sh scripts/backup-postgres.sh
```

Recommended cron:

```cron
15 2 * * * cd /opt/kasrut && mkdir -p backups && sh scripts/backup-postgres.sh >> backups/postgres.log 2>&1
```

Also enable Hetzner server backups or snapshots for disaster recovery.
