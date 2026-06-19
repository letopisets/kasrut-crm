import { redis } from './redis'

const PREFIX    = '2fa:attempts:'
const MAX_TRIES = 5

/**
 * Increment the per-tempToken attempt counter.
 * Returns false when the caller is rate-limited (≥ MAX_TRIES previous attempts).
 * If Redis is unavailable the check fails open (returns true) to avoid locking
 * out users during a Redis outage; the IP-level rate limiter still applies.
 */
export async function checkTotpAttempt(jti: string, ttlSeconds: number): Promise<boolean> {
  if (!jti || ttlSeconds <= 0) return true
  const key = `${PREFIX}${jti}`
  try {
    const count = await redis.incr(key)
    // Set TTL only on the first increment so it naturally expires with the token.
    if (count === 1) await redis.expire(key, ttlSeconds)
    return count <= MAX_TRIES
  } catch {
    // Redis unavailable — fail open, IP-level limiter provides backstop
    console.warn('[twoFactorAttempts] Redis unavailable, skipping per-token counter')
    return true
  }
}
