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

Optional, server-side geocoders (api service only): `LOCATIONIQ_API_KEY` and
`GOVMAP_API_KEY` — see [GovMap](#govmap-geocoder-server-side-israeli-addresses)
and [LocationIQ](#locationiq-geocoder-server-side) below.

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
upgrades them to real address-level points and flips `geoAccuracy` to `exact`.

It uses the same server-side provider chain as `/api/map/geocode`: rows whose
address/city look Israeli are restricted to Israel and go **GovMap → LocationIQ →
Nominatim** (each provider only if configured; see the
[GovMap](#govmap-geocoder-server-side-israeli-addresses) and
[LocationIQ](#locationiq-geocoder-server-side) sections); everything else goes
LocationIQ → Nominatim worldwide. A hit is kept only if it is not a city
centroid and, for Israeli rows, inside Israel, not in the sea and — for a
LocationIQ/Nominatim fallback hit — in the row's own city. Only a house,
building or named-place hit flips the row to `exact`; a street-level hit (a
street midpoint, e.g. for an address without a house number) moves the pin but
leaves the row `approximate`, so the prerender does not publish it as `geo`.
Suggestion approval in the CRM applies the same rule: it re-geocodes the
suggested address server-side and stores `exact` only for an address-level
point; a point proposed by the map client (it carries no accuracy) is kept
only when the server finds nothing, and then as `approximate`.

Rows are geocoded one at a time, the LocationIQ/Nominatim fallbacks are
throttled to 1 request/second (Nominatim policy), GovMap calls are paced to
≤ 8/s (see [Rate limit](#govmap-geocoder-server-side-israeli-addresses)), and
each run processes a bounded batch.

A row is **deferred** — its coordinates and accuracy are left as they are, to
be retried — when GovMap fails transiently (outage, 429, 5xx, timeout; the
LocationIQ / Nominatim fallbacks are then not asked at all, so no quota is
spent on an answer the job would discard) or when the fallbacks fail
transiently (429, 5xx, timeout) with nothing found. A deferred row gets a
back-dated `geocodeAttemptedAt`, 12 h short of the retry window (of 30 days
whenever `RG_RETRY_DAYS` is below 30): the next day's run retries it, after the
never-attempted rows (a CRM address change resets the stamp to empty), so rows
stuck on a lasting failure never fill the whole nightly batch. A definitive
answer stamps the real time.

Configuration errors are not deferred:

- **GovMap 401/403** (token revoked or expired, `GOVMAP_ORIGIN` not approved,
  CDN block) would defer every Israeli row, so the run stops at the first one
  with `ABORTED: GovMap rejected the request …`, prints an `ABORTED …` summary
  and exits with code 1. Nothing is geocoded until the key/origin is fixed —
  check `backups/regeocode.log` for `ABORTED`.
- **LocationIQ 401/403** (bad key) or a **Nominatim 403** (User-Agent or IP
  blocked) counts as "no match" from that provider: a row nothing else can
  place is stamped for the normal 30 days. The job (and the api) logs one
  warning per process (`LocationIQ geocoder: HTTP 401 …`,
  `Nominatim geocoder: HTTP 403 …`). After
  fixing the key or the block, re-run the rows that missed with a full pass
  (`RG_RETRY_DAYS=0`, below).

**In a dev / CI checkout** (Node + `node_modules` present):

```sh
# from kasrut-api/, with DATABASE_URL set
npm run regeocode -- --limit 25          # default 25 rows/run
npm run regeocode -- --limit 50 --retry-days 30
npm run regeocode -- --limit 2000 --retry-days 0 --include-exact   # one-off full pass (below)
```

**On the prod host there is no Node** — the app runs only in Docker, so
`npm run regeocode` on the host fails. Run it **inside the api container**, which
already has the compiled modules, `DATABASE_URL`, the geocoder keys
(`GOVMAP_API_KEY`, `LOCATIONIQ_API_KEY`) and network to Postgres + the
geocoders. A small runtime runner (`regeocode-runtime.cjs`) that requires the
compiled `dist/.../lib` modules (geocoder chain, `geoValidation`, `mapCache`,
`prisma`) does the same work; copy it into the running container and run with
`node`:

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

**After enabling or changing a geocoder** (e.g. adding `GOVMAP_API_KEY`), run
one full pass over **all** rows — `exact` ones included — that ignores the
30-day retry window. The 2026-09 data evaluation found `exact` rows that are
wrong, 11 of them pinned more than 2 km off, in the wrong city, by the old
Nominatim path (which took its top hit without a city check). Re-geocoding
only the ~471 `approximate` rows leaves those in place, so set
`RG_INCLUDE_EXACT=1` (`--include-exact` for the npm script) — on the recorded
data GovMap re-pins 10 of the 11 to the house:

```sh
docker cp kasrut-api/scripts/regeocode-runtime.cjs kasrut-api-1:/app/kasrut-api/regeocode-runtime.cjs
$DC exec -T -e RG_LIMIT=2000 -e RG_RETRY_DAYS=0 -e RG_INCLUDE_EXACT=1 api node regeocode-runtime.cjs
```

With `RG_INCLUDE_EXACT=1` an `exact` row is re-pinned **only** when GovMap now
returns a validated address-level point for it; it is never downgraded to a
street midpoint or to a LocationIQ/Nominatim result (it is just stamped as
checked — and LocationIQ/Nominatim are not even asked for an `exact` row, so
no fallback quota or time goes into it). So a wrong `exact` row that GovMap cannot place stays as it is — the
DONE line's `exact_repinned_by_govmap=` / `exact_kept=` counts show how many
were checked; review the kept ones in the CRM if needed. `approximate` rows are
handled as in the nightly run.

The pass does **not** fix `exact` rows that are really a street midpoint (the
old suggestion approval stored any geocoded point as `exact`): an address
without a house number only ever gets GovMap's street point, which is not
address-level, so the row is only stamped and the prerender keeps publishing
it as `geo`. Others without a house number are legitimately `exact` (a mall,
hotel or other named place pinned at the building), so they are not demoted
automatically. List them for review — `exact` rows whose address has no digit
(15 in the 2026-09 data):

```sh
$DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT id, name, address, city, lat, lng FROM restaurants
WHERE "deletedAt" IS NULL AND "geoAccuracy" = 'exact' AND address !~ '[0-9]'
ORDER BY city, name;
SQL
```

For each one that is really a street midpoint, hand it back to the job, which
then stores GovMap's street point as `approximate` (the prerender stops
publishing it as `geo`):

```sh
$DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE restaurants SET "geoAccuracy" = 'approximate', "geocodeAttemptedAt" = NULL
WHERE id IN ('<id>', '<id>');
SQL
```

GovMap hits return quickly (typically 0.1–0.5 s). A row that GovMap cannot
confirm costs up to ~1.5 s of GovMap calls (hard cap 5 s), plus ~1–2 s of
LocationIQ/Nominatim for an `approximate` row, so a full pass typically takes
~10–20 min. If GovMap
stalls, each timeout (2.5 s) switches GovMap off for 30 s; the row that timed
out and the rows that meet the switched-off GovMap are **deferred** (pin
untouched, fallbacks not asked, back-dated stamp — see above) and reported as
`deferred_govmap_unavailable=N` in the DONE line
(`deferred_fallback_unavailable=N` counts rows the fallbacks could not
answer). The next nightly run picks them up; to retry them sooner, re-run
later with `RG_RETRY_DAYS=1` instead of `0`: the rows this pass stamped are
skipped, and the deferred ones (stamped ~30 days back) are retried.
`ABORTED` instead of `DONE` means GovMap refused the token/origin (see above):
fix it and run the pass again.

## GovMap geocoder (server-side, Israeli addresses)

**GovMap** (Survey of Israel) is the authoritative Israeli address index. The
api calls its search API **server-side** —
`POST https://www.govmap.gov.il/api/search-service/api-search` with
`{apiKey, searchText, language, maxResults, isAccurate}`, exactly what the
official JS SDK's `govmap.search()` sends
([docs](https://api.govmap.gov.il/docs/search-functions/search)) — and projects
the returned Israeli TM Grid (EPSG:2039) centroid to WGS84. The browser never
talks to GovMap: no SDK in the map bundle, no map rebuild, **no CSP change**.

It is used by:

- `GET /api/map/geocode` — pins a suggested place on its address. When the
  caller sends no `country`, the API infers `il` from the address/city (Hebrew
  text or an Israeli city);
- `GET /api/map/places` — the map's "correct my location" search-as-you-type
  (GovMap search including settlements; Nominatim when GovMap has nothing, and
  listed first for Latin/Cyrillic text unless GovMap found the town itself;
  cached 24 h, empty answers 1 h);
- suggestion approval in the CRM, and the
  [re-geocode job](#coordinate-accuracy-re-geocoding).

Provider chain for Israeli addresses: **GovMap → LocationIQ → Nominatim**.
GovMap's `isAccurate` flag and `score` are not trustworthy on their own (it can
return a neighbouring house number, a street named after another city, a
neighbouring street or an alley off the road), so a GovMap hit is validated:
with a house number, only an address record with **the same house number, the
same city and the same street name** is accepted; without one, only a street
or named place whose name and city match. Anything else — or a
401/403/429/5xx/timeout — falls through to the next provider. For Israeli
addresses the LocationIQ/Nominatim fallback hit must also lie in the query's
city (Nominatim answers "הרצל 20, חיפה" with Hadera), otherwise the result is
empty rather than a wrong-city pin. Non-Israeli addresses skip GovMap. With
`GOVMAP_API_KEY` empty the provider order is as before (LocationIQ →
Nominatim).

To enable:

1. **Get a token** — in the GovMap personal area → API management, create (or
   copy) an API token and make sure its approved domains are `mykoshermap.com`
   and `www.mykoshermap.com`.
2. **Put it in `.env.hetzner` and rebuild.** The **first** deploy of this
   release must rebuild **both** the api and the map: the map's "correct my
   location" search now calls `/api/map/places` (the bundle currently in prod
   calls nominatim.openstreetmap.org from the browser, which the prod CSP
   blocks), and the old client-side GovMap code is gone from the bundle:
   ```sh
   # .env.hetzner:  GOVMAP_API_KEY=<token>
   $DC build api kasrut-map && $DC up -d --no-deps api kasrut-map
   ```
   No nginx/CSP change. After that, enabling/rotating the key is api-only:
   edit `.env.hetzner`, then `$DC up -d --no-deps api`.
3. **Upgrade existing approximate rows** — run the full re-geocode pass
   described in [Coordinate accuracy](#coordinate-accuracy-re-geocoding).

**Domain binding.** GovMap authorises by token **and** the request `Origin`:
`https://mykoshermap.com` / `https://www.mykoshermap.com` pass; any other
origin — including `https://api.mykoshermap.com` and `localhost` — gets
`401 {"message":"Invalid API token or unauthorized domain"}`, and a request
without an Origin gets a 500. The api therefore sends
`Origin: $GOVMAP_ORIGIN` (default `https://mykoshermap.com`; this is also why
the same token works from a dev machine) and a browser-compatible
`User-Agent: Mozilla/5.0 (compatible; KashrutMap/1.0; +https://mykoshermap.com)`,
because GovMap's CloudFront answers non-browser user agents (Node's default
fetch UA, axios, `KashrutCRM/1.0`) with a 403 HTML page. Only set
`GOVMAP_ORIGIN` if the approved-domain list changes.

**Rate limit.** 10 concurrent requests per IP (`x-concurrency-limit`).
Responses advertise `x-ratelimit-limit: 600`, but in practice ~100 calls
within a few seconds drew a 429 carrying `x-ratelimit-limit: 100` and
`Retry-After`, while a sustained ~8.7 req/s never did — so treat the limit as
~100 requests per 10 s per IP. The api paces GovMap calls to ≤ 8/s app-wide
(burst 8), keeps at most 8 in flight, gives each call 2.5 s and each address
5 s in total (only GovMap's share is bounded: LocationIQ/Nominatim after it
have their own 8 s timeouts and the Nominatim queue). A circuit breaker then
switches GovMap off for everyone: after a 429 for `Retry-After` (≤ 60 s,
10 s without the header); after a timeout / network error for 30 s; after
**3 accurate-search 5xx within 30 s** for 30 s — fuzzy-search 5xx never trip
it, because the fuzzy search 500s on some texts every time (and a single 5xx
only ends that one address's GovMap lookup); after a 401/403 for 10 min.
Meanwhile interactive requests fall through to the next provider at once, and
the re-geocode job defers the row (after a 401/403 it stops with `ABORTED`). `/api/map/places` uses Nominatim only as a budgeted fallback (at most
one call per 2 s app-wide; a burst gets GovMap-only answers) because
Nominatim's policy forbids autocomplete traffic.

**Verify after deploy:**

```sh
curl -sG 'https://mykoshermap.com/api/map/geocode' \
  --data-urlencode 'address=יפו 42' --data-urlencode 'city=ירושלים'
# → 200 {"lat":31.78205…,"lng":35.21984…}
curl -sG 'https://mykoshermap.com/api/map/places' --data-urlencode 'q=יפו 42 ירושלים'
# → 200 {"results":[{"id":…,"label":…,"lat":…,"lng":…}, …]}
$DC logs api --since 30m | grep -i govmap
# a 401/403 warning here = token revoked/expired, domain not approved, or CDN block
```

Nominatim also knows `יפו 42`, so the geocode coordinates alone don't prove
GovMap answered, and a quiet log doesn't either (only 401/403 are logged;
timeouts, 5xx and 429 fall through silently). The GovMap-only signal is the
`/places` result ids: GovMap ids look like `address|ADDR|…` /
`settlement|…`, Nominatim ids like `osm:…` — so an `address|…` id in the
`יפו 42 ירושלים` answer above proves GovMap is working. For batch runs, the
re-geocode DONE line's `by_provider=govmap:N` tally is the equivalent.

Notes on the previous client-side setup: the `VITE_GOVMAP_TOKEN` build arg and
the map's GovMap SDK are gone. If a map bundle built with that token was ever
deployed, the token was public in the JS — it is domain-bound, but rotating it
in the personal area is cheap. GovMap hosts that were added to the prod CSP in
`docker/nginx/production.conf` under the old instructions are no longer needed
and can be removed (the dev `docker/nginx/default.conf` no longer has them).

## LocationIQ geocoder (server-side)

Address→coordinate geocoding (`/api/map/geocode`, suggestion approval and the
re-geocode job) runs entirely in the api through a provider chain:

- **Israeli addresses** — `country=il`, sent by the client or inferred by the
  API from Hebrew text / an Israeli city: **GovMap** (if `GOVMAP_API_KEY` is
  set) → **LocationIQ** (if `LOCATIONIQ_API_KEY` is set) → **Nominatim**, all
  restricted to Israel so a street name isn't matched abroad;
- **everything else** — **LocationIQ** → **Nominatim**, worldwide (no country
  restriction).

LocationIQ is Nominatim-based but with cleaner data and a better hit rate, has a
self-serve free tier (~5k/day, key issued instantly at
[locationiq.com](https://locationiq.com/)), and is permissive to use with our
OpenStreetMap basemap. It runs server-side, so **no CSP change** is needed.

To enable, put the key in `.env.hetzner` and rebuild the api:

```sh
# .env.hetzner:  LOCATIONIQ_API_KEY=<your-key>
$DC build api && $DC up -d --no-deps api
```

Without a key nothing changes — LocationIQ is skipped and the chain goes
straight to Nominatim (after GovMap for Israeli addresses, if configured).
