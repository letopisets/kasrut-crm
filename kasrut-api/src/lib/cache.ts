import { redis } from './redis'

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

  // ── load ──────────────────────────────────────────────────────────────────
  const data = await fn()

  // ── try write ─────────────────────────────────────────────────────────────
  try {
    await redis.setex(key, ttl, JSON.stringify(data))
  } catch {
    // ignore
  }

  return data
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
