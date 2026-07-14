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

Point DNS to the server:

- `mykoshermap.com` -> server IPv4
- `api.mykoshermap.com` -> server IPv4
- `crm.mykoshermap.com` -> server IPv4

Issue a Let's Encrypt certificate on the server:

```sh
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml stop nginx
sudo certbot certonly --standalone \
  -d mykoshermap.com \
  -d api.mykoshermap.com \
  -d crm.mykoshermap.com
```

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

## Production Kashrut Data Import

The export in `docs/kashrut-export/import.sql` resets and reloads the kashrut
domain tables from `docs-kashrut`. It deletes restaurants, documents,
rabbanuts, hechsherim, mashgichim, mashgiach joins, inspections, map reviews,
and map suggestions. It preserves users, map users, service logs, and lookup
tables.

```sh
sh scripts/import-kashrut-export.sh
```

## GitHub Actions CD

The `.github/workflows/cd.yml` workflow deploys production after the `CI`
workflow succeeds on `main` or `master`. It can also be started manually from
GitHub Actions.

Configure these repository secrets:

- `HETZNER_HOST` - server hostname or IP.
- `HETZNER_USER` - SSH user with access to the project directory and Docker.
- `HETZNER_SSH_KEY` - private deploy key.
- `HETZNER_KNOWN_HOSTS` - optional pinned SSH known_hosts entry.

Optional repository variables:

- `HETZNER_SSH_PORT` - defaults to `22`.
- `HETZNER_DEPLOY_PATH` - defaults to `/opt/kasrut`.
- `HETZNER_ENV_FILE` - defaults to `.env.hetzner`.
- `PRODUCTION_URL` - defaults to `https://mykoshermap.com`.
- `PRODUCTION_HEALTH_URL` - defaults to `https://mykoshermap.com/health`.
- `PRODUCTION_API_HEALTH_URL` - defaults to `https://api.mykoshermap.com/health`.

Check the stack:

```sh
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml ps
curl -f https://mykoshermap.com/health
```

Public checks:

- `https://mykoshermap.com/health`
- `https://mykoshermap.com`
- `https://api.mykoshermap.com/health`
- `https://crm.mykoshermap.com`

If OpenStreetMap tiles show `403 Access blocked`, rebuild and recreate the map
and nginx services so the latest `Referrer-Policy` and Leaflet tile settings are
deployed:

```sh
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml build kasrut-map nginx
docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml up -d kasrut-map nginx
```

## Backups

The database is the project's main asset (hundreds of hand-curated establishments
plus community reviews/suggestions). A local-only dump dies with the disk it lives
on, so the goal is: **automated + offsite + monitored + a tested restore.**

### One-off backup

```sh
sh scripts/backup-postgres.sh
```

The script dumps to `backups/postgres/`, validates the dump (non-empty + real
`pg_dump` header + `gzip -t` integrity) before keeping it, prunes local dumps
older than `RETENTION_DAYS` (14), and — if configured — uploads offsite and pings
a monitor. A failed dump now aborts loudly instead of writing an empty "backup".

### Offsite copy (required for real safety)

Set up an rclone remote once on the host (e.g. a Hetzner Storage Box or S3/B2):

```sh
apt-get install -y rclone      # if missing
rclone config                  # create a remote, e.g. named "hetzner-box"
```

Then point the backup at it via env (put these in the crontab line or a
`backups/backup.env` you source):

```sh
export BACKUP_REMOTE="hetzner-box:kashrut-db"      # offsite target
export BACKUP_PING_URL="https://hc-ping.com/<uuid>" # optional: healthchecks.io
```

With `BACKUP_REMOTE` set, the script uploads each dump and prunes remote copies
older than `RETENTION_DAYS`; if rclone is missing it aborts (offsite is treated
as required, not best-effort).

### Automated cron

```cron
15 2 * * * cd /opt/kasrut && BACKUP_REMOTE="hetzner-box:kashrut-db" BACKUP_PING_URL="https://hc-ping.com/<uuid>" sh scripts/backup-postgres.sh >> backups/postgres.log 2>&1
```

`BACKUP_PING_URL` is pinged on success and `.../fail` on failure, so a monitor
(healthchecks.io / Better Stack) alerts you when a nightly backup is missed —
otherwise a silently broken backup is only discovered when you need it.

### Tested restore

A backup you have never restored is a guess. Verify quarterly by restoring the
latest dump into a throwaway database (never prod):

```sh
sh scripts/restore-postgres.sh backups/postgres/<db>-<timestamp>.sql.gz
# → restores into <db>_restore_check and reports the table count; drop it after.
```

To restore over the live DB (real disaster recovery) the script requires an
explicit `CONFIRM=yes RESTORE_DB=<live-db>`.

### Second layer

Also enable Hetzner server backups or snapshots — a cheap second, independent
restore path for full-server disaster recovery.

## Coordinate accuracy (re-geocoding)

Imported establishments are placed at the **city centre + jitter** (the PDFs
have no coordinates), so their `geoAccuracy` is `approximate` and the map shows
them with a dashed pin plus an "approximate location" note. The re-geocode job
upgrades them to real address-level points via OSM Nominatim and flips
`geoAccuracy` to `exact`.

It is rate-limited to 1 request/second (Nominatim policy) and processes a
bounded batch per run, so it's safe to run against public Nominatim.

**In a dev / CI checkout** (Node + `node_modules` present):

```sh
# from kasrut-api/, with DATABASE_URL set
npm run regeocode -- --limit 25          # default 25 rows/run
npm run regeocode -- --limit 50 --retry-days 30
```

**On the prod host there is no Node** — the app runs only in Docker, so
`npm run regeocode` on the host fails. Run it **inside the api container**, which
already has the compiled modules, `DATABASE_URL`, and network to Postgres +
Nominatim. A small runtime runner (`regeocode-runtime.cjs`) that requires the
compiled `dist/.../lib/{nominatim,geoValidation,mapCache,prisma}` does the same
work; copy it into the running container and run with `node`:

```sh
cd /opt/kasrut
DC="docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml"
docker cp kasrut-api/scripts/regeocode-runtime.cjs kasrut-api-1:/app/kasrut-api/regeocode-runtime.cjs
$DC exec -T -e RG_LIMIT=40 api node regeocode-runtime.cjs   # RG_LIMIT rows this run
```

(The file must be re-`docker cp`'d after each image rebuild, since it isn't baked
into the runtime image — a follow-up is to COPY it in the Dockerfile so the cron
can call it directly.) `geocodeAttemptedAt` is recorded per row so an
un-geocodable address isn't retried for 30 days, and a re-import never overwrites
coordinates already upgraded to `exact`.

Nightly cron (small batch, well under the rate limit):

```cron
30 3 * * * cd /opt/kasrut && docker cp kasrut-api/scripts/regeocode-runtime.cjs kasrut-api-1:/app/kasrut-api/regeocode-runtime.cjs && docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml exec -T -e RG_LIMIT=40 api node regeocode-runtime.cjs >> backups/regeocode.log 2>&1
```

## GovMap geocoder for Israeli addresses (suggest-a-place)

New-place suggestions geocode the typed address so the pin lands on it. The
client routes by region: **Israeli addresses** (Hebrew text / Israeli city) go to
**GovMap** (Survey of Israel — the authoritative Israeli geocoder, client-side
SDK, returns Israeli TM Grid EPSG:2039 which we project to WGS84); everything
else goes to **Nominatim** via `/api/map/geocode`. Each falls back to the other,
so a missing token or a miss still resolves.

To enable GovMap (until then, Israeli addresses just fall back to Nominatim):

1. **Get a token** — register at [govmap.gov.il](https://www.govmap.gov.il/) for
   an API token.
2. **Build the map with the token** (Vite embeds it at build time):
   ```sh
   VITE_GOVMAP_TOKEN=<your-token> $DC build kasrut-map && $DC up -d --no-deps kasrut-map
   ```
   (or add `VITE_GOVMAP_TOKEN=<token>` to `.env.hetzner`).
3. **Allow GovMap in the prod CSP** — add these hosts to the `mykoshermap.com`
   server block in `docker/nginx/production.conf` (a server-local-edited file),
   then recreate nginx (`$DC up -d --force-recreate nginx`):
   - `script-src`  += `https://www.govmap.gov.il https://*.govmap.gov.il`
   - `style-src`   += `https://*.govmap.gov.il`
   - `connect-src` += `https://www.govmap.gov.il https://*.govmap.gov.il`
   - `img-src` already allows `https:` (GovMap tiles), so no change there.

The dev nginx (`docker/nginx/default.conf`) already carries these CSP entries.
