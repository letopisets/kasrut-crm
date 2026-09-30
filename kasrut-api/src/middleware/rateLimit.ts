import { isIPv4, isIPv6 } from 'net'
import type { Request, Response, NextFunction } from 'express'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

export interface RateLimitWindow {
  windowMs: number
  max:      number
  keyPrefix:string
}

interface RateLimitOptions extends RateLimitWindow {
  /** Bucket id other than the client address, e.g. the signed-in account.
   *  Falls back to the address when it returns undefined. */
  keyBy?:   (req: Request) => string | undefined
}

// ── Client IP → bucket id ─────────────────────────────────────────────────────
/** Expands a valid IPv6 address (no zone id) into its eight 16-bit groups. */
function expandIpv6(address: string): number[] | null {
  let head = address
  const tail: number[] = []
  const lastColon = address.lastIndexOf(':')
  const last = address.slice(lastColon + 1)
  if (last.includes('.')) {
    // Embedded dotted IPv4 fills the last two groups.
    const [a, b, c, d] = last.split('.').map(Number)
    tail.push((a << 8) | b, (c << 8) | d)
    head = address.slice(0, lastColon + 1)
    if (!head.endsWith('::')) head = head.slice(0, -1)
  }

  const parse = (part: string) => part === '' ? [] : part.split(':').map(h => parseInt(h, 16))
  const halves = head.split('::')
  const left   = parse(halves[0])
  const right  = halves.length > 1 ? parse(halves[1]) : []
  const zeros  = halves.length > 1 ? Math.max(0, 8 - tail.length - left.length - right.length) : 0
  const groups = [...left, ...new Array<number>(zeros).fill(0), ...right, ...tail]
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff)
    ? groups
    : null
}

/**
 * Bucket id for a client address. IPv4 and IPv4-mapped IPv6 (::ffff:a.b.c.d,
 * in any spelling) collapse to the IPv4 address; any other IPv6 address to its
 * /64 prefix, since a single subscriber normally owns a whole /64 and could
 * otherwise rotate through 2^64 fresh buckets. Unparseable input is returned
 * unchanged.
 */
export function normalizeClientIp(ip: string): string {
  const address = ip.trim().split('%')[0]
  if (isIPv4(address)) return address
  if (!isIPv6(address)) return ip

  const groups = expandIpv6(address)
  if (!groups) return ip
  if (groups.slice(0, 5).every(g => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.')
  }
  const prefix = groups.slice(0, 4).map(g => g.toString(16).padStart(4, '0')).join(':')
  return `${prefix}::/64`
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
// Counts one use and gives the window an expiry whenever the key has none, in
// one atomic step. INCR followed by a separate EXPIRE sent only when INCR
// returned 1 could leave a key without any expiry, blocking its bucket for
// good once it reached `max`: a command that times out on the client (see
// REDIS_COMMAND_TIMEOUT_MS) still runs on the server after a stall, so the
// INCR that created the key could land with nobody left to send the EXPIRE.
// Checking the TTL on every call also repairs a key left like that earlier.
// KEYS[1] counter; ARGV[1] window in ms. Returns { count, ms until reset }.
const WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`

async function redisCheck(key: string, windowMs: number): Promise<{ count: number; resetInMs: number }> {
  const [count, resetInMs] = await redis.eval(WINDOW_SCRIPT, 1, key, windowMs) as [number, number]
  return { count: Number(count), resetInMs: Number(resetInMs) }
}

/** Bucket id of the request's client address (see normalizeClientIp). */
export function clientAddressBucket(req: Request): string {
  return normalizeClientIp(req.ip ?? req.socket.remoteAddress ?? 'unknown')
}

export interface RateLimitResult {
  allowed:    boolean
  remaining:  number
  /** Seconds until the window resets. */
  retryAfter: number
}

/**
 * Counts one use of `bucket` and says whether it is still within the window's
 * `max`. The middleware below counts every request; a controller calls this
 * directly when only some outcomes should count (an email actually sent).
 */
export async function consumeRateLimit(options: RateLimitWindow, bucket: string): Promise<RateLimitResult> {
  const now = Date.now()
  const key = `rl:${options.keyPrefix}:${bucket}`

  let count:    number
  let resetAt:  number

  try {
    if (redis.status === 'ready') {
      const window = await redisCheck(key, options.windowMs)
      count   = window.count
      resetAt = now + window.resetInMs
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

  return {
    allowed:    count <= options.max,
    remaining:  Math.max(0, options.max - count),
    retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  }
}

/** Test helper: forgets the in-memory buckets (Redis keys are untouched). */
export function resetRateLimitMemory(): void {
  buckets.clear()
}

// ── Middleware factory ────────────────────────────────────────────────────────
export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const bucket = options.keyBy?.(req) ?? clientAddressBucket(req)
    const result = await consumeRateLimit(options, bucket)

    res.setHeader('RateLimit-Limit',     String(options.max))
    res.setHeader('RateLimit-Remaining', String(result.remaining))
    res.setHeader('RateLimit-Reset',     String(result.retryAfter))

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter))
      res.status(429).json({ error: 'Too many requests. Please try again later.' })
      return
    }

    next()
  }
}
