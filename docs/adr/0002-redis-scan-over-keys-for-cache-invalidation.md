# ADR-0002: SCAN instead of KEYS for Redis cache invalidation

**Date:** 2025-11-15  
**Status:** Accepted

## Context

The `invalidatePattern(pattern)` helper in `kasrut-api` originally used `REDIS KEYS pattern` to find all matching cache keys before deleting them. `KEYS` is a blocking O(N) command — on a large keyspace it blocks the entire Redis server for the duration of the scan, stalling every other client.

## Decision

Replace `KEYS` with cursor-based `SCAN` in `src/lib/cache.ts`:

```ts
async function invalidatePattern(pattern: string): Promise<void> {
  let cursor = 0
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
    cursor = Number(next)
    if (keys.length) await redis.del(...keys)
  } while (cursor !== 0)
}
```

`SCAN` is non-blocking and iterates in small batches, making it safe to run against a shared Redis instance even under load.

## Consequences

**Positive:**
- No Redis stalls during cache invalidation
- Safe to run during peak traffic

**Negative:**
- Invalidation is not instantaneous — stale keys may be served for the duration of the scan (typically < 100 ms for our keyspace)
- Slightly more complex code than a single `KEYS` call
