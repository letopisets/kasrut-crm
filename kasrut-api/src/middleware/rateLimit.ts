import type { Request, Response, NextFunction } from 'express'

interface RateLimitOptions {
  windowMs: number
  max: number
  keyPrefix: string
}

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
let cleanupCursor = 0

function cleanupExpiredBuckets(now: number): void {
  cleanupCursor += 1
  if (cleanupCursor % 100 !== 0) return

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export function rateLimit(options: RateLimitOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    cleanupExpiredBuckets(now)

    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = `${options.keyPrefix}:${ip}`
    const existing = buckets.get(key)
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + options.windowMs }

    bucket.count += 1
    buckets.set(key, bucket)

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    res.setHeader('RateLimit-Limit', String(options.max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)))
    res.setHeader('RateLimit-Reset', String(retryAfter))

    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(retryAfter))
      res.status(429).json({ error: 'Too many requests. Please try again later.' })
      return
    }

    next()
  }
}
