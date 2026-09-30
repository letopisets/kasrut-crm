# ADR-0005: Generation-versioned keys for the public map cache

**Date:** 2026-09-30  
**Status:** Accepted (amends ADR-0002 for the `map` namespace)

## Context

CRM mutations invalidated the public map cache with `invalidatePattern('map:*')`, a SCAN sweep (ADR-0002) that stops after `MAX_INVALIDATE_KEYS` (5,000) keys. Anyone can mint `map:*` keys: every distinct viewport or filter of `GET /api/map/restaurants` is its own entry. A scraper could grow the namespace past the cap, after which a sweep might never reach the entry of a deleted or withdrawn restaurant, which then stayed public until its TTL ran out.

## Decision

The map cache is a generation-versioned namespace (`withNamespaceCache` / `invalidateNamespace` in `kasrut-api/src/lib/cache.ts`, wrapped by `lib/mapCache.ts`):

- Entries are stored as `map:v<gen>:<suffix>` (`restaurants:<hash>`, `restaurant:<id>`, `options`, `hechsherim`, `sitemap`). The generation lives in `map:gen` and is read on every request.
- Invalidation is one `INCR map:gen` (after a `GET`, which seeds a missing counter): O(1), and complete however many keys exist. Superseded entries are unreachable and expire by TTL.
- A missing counter is seeded from the clock, so a flushed or evicted counter never walks back onto older keys still inside their TTL. A value `INCR` could not advance (not 1 to 18 digits, e.g. after a hand edit) is reseeded from the clock too, by a compare-and-set script that never overwrites a concurrent repair or bump.
- Without a trustworthy generation (Redis down, or a bump this process could not deliver) requests bypass Redis and load from the database, still coalesced in-process. A failed bump is retried before the next read trusts Redis again. While a namespace is bypassed the API logs `cache namespace bypassed` at most every five minutes; a Redis that serves reads but refuses writes (MISCONF, OOM) keeps it there after the next mutation, until writes work again.
- The process-local stale-write guard and in-flight coalescing in `withCache` apply unchanged.
- Misses are never stored, and public by-id reads reject ids outside `^[A-Za-z0-9_-]{1,64}$` with a 404 before any cache or database access.

`restaurants:*` (the authenticated CRM list cache) and `hechsherim:*` keep the capped SCAN sweep: only CRM users can create their keys. *(Superseded 2026-09-30, see the amendment below.)*

Every invalidation also deletes the three fixed keys of the old unversioned layout (`map:sitemap`, `map:options`, `map:hechsherim`), which this build never reads, so a rollback to an earlier build cannot serve a snapshot taken before a mutation made under this one. The per-place and list keys of that layout live five minutes. This can go one release later.

`/sitemap.xml`, `/options` and `/hechsherim` get a per-IP rate limit of their own (`map:meta`, 120/min), so a bypassed cache cannot turn them into an unthrottled query source.

## Consequences

**Positive:**
- Invalidation cannot be defeated by flooding the namespace, and costs two round trips.
- Holds across several API processes for every bump that reaches Redis: a mutation commits before it bumps, so any load that read the new generation also reads the committed rows.

**Negative:**
- One extra Redis `GET` per cached public-map request.
- Superseded entries occupy memory until their TTL (at most one hour, the sitemap).
- A bump that fails is owed only by the process that issued it. Other API processes keep trusting the old generation until that process's next map read delivers it, and a short-lived process (`scripts/regeocode.ts`, `regeocode-runtime.cjs`) exits still owing it. Changes that never go through `invalidateMapCache` (hand-run SQL, certificate expiry) rely on the TTL as before. In those cases, bump by hand on the host: `docker compose --env-file .env.hetzner -f docker-compose.yml -f docker-compose.prod.yml exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli INCR map:gen'` (Redis requires a password; see the deployment guide).

## Amendment (2026-09-30): the CRM list caches are namespaces too

Once every Redis command gives up after 500 ms (`REDIS_COMMAND_TIMEOUT_MS`), a stall could cut the `restaurants:*` and `hechsherim:*` sweeps short: the mutation returned, nothing recorded that the sweep was still owed, and readers got the pre-mutation list (a mashgiach's own list included) until the 300 s TTL ran out. Both caches are now generation-versioned namespaces (`lib/crmCache.ts`: `restaurants:v<gen>:list:…` and `hechsherim:v<gen>:list:…`, counters `restaurants:gen` and `hechsherim:gen`). A failed bump leaves this process bypassing the namespace until one lands, and a bump that lands late only makes the entries written meanwhile unreachable. `invalidateMapCache` bumps `restaurants` alongside `map`. `invalidatePattern` and its SCAN sweep are gone.

A rollback to a build from before this change reads `restaurants:list:…` and `hechsherim:list:…`, which this build never writes: only entries from before the deploy exist, and they expire within five minutes of it.
