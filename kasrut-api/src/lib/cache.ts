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

/**
 * Delete all keys matching a glob pattern.
 * Used to invalidate cache after restaurant mutations.
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern)
    if (keys.length) await redis.del(...keys)
  } catch {
    // ignore
  }
}
