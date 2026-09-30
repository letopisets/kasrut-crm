import { redis } from './redis'
import { logger } from './logger'

// Collapse concurrent misses for the same key inside this API process. This
// prevents a burst from fanning out into identical database/upstream requests.
// Each flight remembers the generation it started in (see below): a caller
// arriving after an invalidation must not join a load that may have read the
// pre-mutation rows, so it starts a fresh one instead.
interface InFlightLoad { generation: number; promise: Promise<unknown> }
const inFlightLoads = new Map<string, InFlightLoad>()

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
 * A null/undefined result is returned but never stored: misses (e.g. an
 * unknown id) cost one indexed lookup, while caching them would let any
 * client mint keys at will and bloat the namespaces invalidatePattern sweeps.
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

  const existing = inFlightLoads.get(key)
  if (existing && existing.generation === cacheGeneration) return existing.promise as Promise<T>

  const loadGeneration = cacheGeneration
  const pending = (async () => {
    const data = await fn()

    // ── try write ───────────────────────────────────────────────────────────
    if (data != null && loadGeneration === cacheGeneration) {
      try {
        await redis.setex(key, ttl, JSON.stringify(data))
      } catch {
        // ignore
      }
    }

    return data
  })()

  inFlightLoads.set(key, { generation: loadGeneration, promise: pending })
  try {
    return await pending
  } finally {
    // Do not delete a newer flight if this promise finishes after a
    // replacement was installed for the same key.
    if (inFlightLoads.get(key)?.promise === pending) inFlightLoads.delete(key)
  }
}

/**
 * Delete specific keys. For fixed keys that must go on every invalidation
 * regardless of how large the surrounding namespace has grown.
 */
export async function invalidateKeys(...keys: string[]): Promise<void> {
  cacheGeneration += 1
  if (!keys.length) return
  try {
    await redis.del(...keys)
  } catch {
    // ignore
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
        if (total >= MAX_INVALIDATE_KEYS) {
          // Keys the sweep did not reach live on until their TTL expires.
          logger.warn({ pattern, deleted: total }, 'cache invalidation hit the key cap; remaining keys expire by TTL')
          break
        }
      }
    } while (cursor !== '0')
    if (deletions.length) await Promise.all(deletions)
  } catch {
    // ignore
  }
}
