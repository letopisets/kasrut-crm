import { redis } from './redis'

// Collapse concurrent misses for the same key inside this API process. This
// prevents a burst from fanning out into identical database/upstream requests.
const inFlightLoads = new Map<string, Promise<unknown>>()

// Any invalidation advances this process-local generation. A loader captures
// the generation before reading from the database and may populate Redis only
// if no mutation invalidated caches while that read was in flight. This closes
// the read -> invalidate -> stale SETEX race without coupling callers to cache
// implementation details. A global generation is intentionally conservative:
// unrelated invalidations can cause an extra miss, never stale data.
let cacheGeneration = 0

/**
 * Read-through cache.
 * Falls back to fn() silently when Redis is unavailable.
 * @param key  Cache key
 * @param ttl  Time-to-live in seconds
 * @param fn   Data-loader called on cache miss
 */
export async function withCache<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  // ── try read ─────────────────────────────────────────────────────────────
  try {
    const hit = await redis.get(key)
    if (hit) return JSON.parse(hit) as T
  } catch {
    // Redis down → continue to DB
  }

  const existing = inFlightLoads.get(key) as Promise<T> | undefined
  if (existing) return existing

  const pending = (async () => {
    const loadGeneration = cacheGeneration
    const data = await fn()

    // ── try write ───────────────────────────────────────────────────────────
    if (loadGeneration === cacheGeneration) {
      try {
        await redis.setex(key, ttl, JSON.stringify(data))
      } catch {
        // ignore
      }
    }

    return data
  })()

  inFlightLoads.set(key, pending)
  try {
    return await pending
  } finally {
    // Do not delete a newer flight if this promise somehow finishes after a
    // replacement was installed for the same key.
    if (inFlightLoads.get(key) === pending) inFlightLoads.delete(key)
  }
}

const MAX_INVALIDATE_KEYS = 5_000

/**
 * Delete all keys matching a glob pattern, up to MAX_INVALIDATE_KEYS.
 * Used to invalidate cache after restaurant mutations.
 *
 * Uses SCAN with a cursor so it never blocks Redis on large keyspaces —
 * `KEYS` is O(N) and stalls every other client. Deletions are batched per scan
 * page, in parallel, so total wall-time stays close to the original.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  // Advance before the asynchronous Redis scan so every loader that started
  // before this mutation is prevented from writing its stale snapshot later.
  cacheGeneration += 1
  try {
    let cursor = '0'
    let total = 0
    const deletions: Promise<unknown>[] = []
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
      cursor = next
      if (batch.length) {
        deletions.push(redis.del(...batch))
        total += batch.length
        if (total >= MAX_INVALIDATE_KEYS) break
      }
    } while (cursor !== '0')
    if (deletions.length) await Promise.all(deletions)
  } catch {
    // ignore
  }
}
