import type { Request, Response, NextFunction } from 'express'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

interface RateLimitOptions {
  windowMs: number
  max:      number
  keyPrefix:string
}

// ── In-memory fallback (single-process) ──────────────────────────────────────
interface Bucket { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let lastRedisWarnAt = 0
let cleanupCursor = 0

function inMemoryCheck(key: string, windowMs: number, now: number): {
  count: number; resetAt: number
} {
  cleanupCursor += 1
  if (cleanupCursor % 100 === 0) {
    for (const [k, b] of buckets.entries()) {
      if (b.resetAt <= now) buckets.delete(k)
    }
  }
  const existing = buckets.get(key)
  const bucket   = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + windowMs }
  bucket.count += 1
  buckets.set(key, bucket)
  return bucket
}

// ── Redis check ───────────────────────────────────────────────────────────────
async function redisCheck(key: string, windowMs: number): Promise<number> {
  const windowSec = Math.ceil(windowMs / 1000)
  // INCR + EXPIRE is atomic enough for rate limiting (GETSET/Lua overkill here)
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, windowSec)
  return count
}

// ── Middleware factory ────────────────────────────────────────────────────────
export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const now = Date.now()
    const ip  = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const key = `rl:${options.keyPrefix}:${ip}`

    let count:    number
    let resetAt:  number

    try {
      if (redis.status === 'ready') {
        count   = await redisCheck(key, options.windowMs)
        // Approximate resetAt from TTL
        const ttl = await redis.ttl(key)
        resetAt = now + (ttl > 0 ? ttl * 1000 : options.windowMs)
      } else {
        throw new Error('not ready')
      }
    } catch {
      if (now - lastRedisWarnAt > 60_000) {
        logger.warn('Redis unavailable — rate limiter falling back to in-memory store')
        lastRedisWarnAt = now
      }
      const b = inMemoryCheck(key, options.windowMs, now)
      count   = b.count
      resetAt = b.resetAt
    }

    const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000))
    res.setHeader('RateLimit-Limit',     String(options.max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - count)))
    res.setHeader('RateLimit-Reset',     String(retryAfter))

    if (count > options.max) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'Too many requests. Please try again later.' })
      return
    }

    next()
  }
}
