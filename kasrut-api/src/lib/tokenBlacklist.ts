import { redis } from './redis'

const PREFIX = 'jwt:bl:'

/**
 * Add a token JTI to the blacklist until it expires.
 * ttlSeconds = remaining lifetime of the token.
 */
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return
  try {
    await redis.setex(`${PREFIX}${jti}`, ttlSeconds, '1')
  } catch {
    // Redis unavailable — log but do not block logout
    console.warn('[tokenBlacklist] Redis unavailable, token not blacklisted:', jti)
  }
}

/** Returns true if the token JTI has been revoked. */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  try {
    const val = await redis.get(`${PREFIX}${jti}`)
    return val !== null
  } catch {
    // Redis unavailable — fail open (allow token) to avoid locking users out
    return false
  }
}
