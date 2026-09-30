import { createHash } from 'crypto'
import type { Response } from 'express'
import { redis } from './redis'
import { logger } from './logger'

/**
 * Per-account failed-login throttling.
 *
 * The IP rate limiter alone lets a botnet spray one account from many
 * addresses; this counts failures per account identifier instead. The first
 * FREE_FAILURES failures are free, every further one locks the identifier for
 * the next step of LOCKOUT_STEPS_SEC (capped at the last step). The counter
 * lives for WINDOW_SEC after the latest failure and a successful login clears
 * it. Unknown identifiers are counted exactly like real ones, so a lockout
 * says nothing about whether an account exists.
 *
 * Callers reserve an attempt (reserveAttempt) BEFORE checking the credential:
 * the lock check and the increment are one atomic step, and the attempt counts
 * as a failure until recordSuccess clears it. Checking first and recording the
 * failure after a slow bcrypt compare would let every request already in
 * flight through, so a parallel burst would get as many guesses as requests.
 *
 * State is kept in Redis (one Lua script per attempt); while Redis is not
 * ready a bounded in-process store takes over (same approach as
 * middleware/rateLimit.ts), and failures counted there move into Redis once it
 * is back. The in-process store also mirrors the Redis counters, so a lock
 * taken while Redis was up still holds if Redis drops.
 */

export type LoginThrottleScope = 'crm' | 'crm-2fa' | 'map'

export interface LoginLockState {
  locked:        boolean
  retryAfterSec: number
}

export const LOGIN_LOCKED_ERROR = 'Too many attempts. Try again later.'

const FREE_FAILURES       = 5
const LOCKOUT_STEPS_SEC   = [60, 5 * 60, 15 * 60, 60 * 60]
const WINDOW_SEC          = 24 * 60 * 60
const WINDOW_MS           = WINDOW_SEC * 1000
const MEMORY_MAX_ENTRIES  = 10_000
const NOT_LOCKED: LoginLockState = { locked: false, retryAfterSec: 0 }

/** Lock length after the `failures`-th consecutive failure (0 = no lock). */
export function lockoutSecondsFor(failures: number): number {
  if (failures <= FREE_FAILURES) return 0
  const step = Math.min(failures - FREE_FAILURES, LOCKOUT_STEPS_SEC.length) - 1
  return LOCKOUT_STEPS_SEC[step]
}

// Only a digest of the identifier reaches the store: no raw emails in keys.
export function loginThrottleKey(scope: LoginThrottleScope, identifier: string): string {
  const digest = createHash('sha256').update(identifier.trim().toLowerCase()).digest('hex')
  return `login:fail:${scope}:${digest}`
}

// The lock is derived from the counter rather than stored, so concurrent
// failures can never overwrite a longer lock with a shorter one.
function lockState(failures: number, lastFailureAt: number, now: number): LoginLockState {
  const lockedUntil = lastFailureAt + lockoutSecondsFor(failures) * 1000
  if (!(lockedUntil > now)) return NOT_LOCKED
  return { locked: true, retryAfterSec: Math.max(1, Math.ceil((lockedUntil - now) / 1000)) }
}

interface Counter { failures: number; lastFailureAt: number }

/** Outcome of one attempt: the counter afterwards, and whether the lock refused it. */
interface Attempt extends Counter { refused: boolean }

// ── Redis store ───────────────────────────────────────────────────────────────
// One atomic step per attempt: merge failures carried over from the in-memory
// store, refuse while locked (unless forced), otherwise count the attempt and
// push the expiry to WINDOW after the latest failure. Mirrors lockState().
// KEYS[1] counter hash; ARGV: now, force, carry, carryAt, windowMs, free, steps…
const ATTEMPT_SCRIPT = `
local now, force = tonumber(ARGV[1]), ARGV[2] == '1'
local carry, carryAt = tonumber(ARGV[3]), tonumber(ARGV[4])
local windowMs, free = tonumber(ARGV[5]), tonumber(ARGV[6])
local h = redis.call('HMGET', KEYS[1], 'failures', 'lastFailureAt')
local failures = (tonumber(h[1]) or 0) + carry
local last = math.max(tonumber(h[2]) or 0, carryAt)
local locked = false
if failures > free then
  local step = math.min(failures - free, #ARGV - 6)
  locked = last + tonumber(ARGV[6 + step]) * 1000 > now
end
local refused = locked and not force
if not refused then
  failures = failures + 1
  last = now
end
if carry > 0 or not refused then
  redis.call('HSET', KEYS[1], 'failures', failures, 'lastFailureAt', last)
  redis.call('PEXPIREAT', KEYS[1], last + windowMs)
end
return { refused and 1 or 0, failures, last }
`

// ── In-memory store (single-process) ─────────────────────────────────────────
// `unsynced` counts the failures recorded here while Redis was unavailable;
// the rest of `failures` mirrors what Redis last reported.
interface MemoryEntry extends Counter { unsynced: number }
const memory = new Map<string, MemoryEntry>()
let lastRedisWarnAt = 0

function memoryEntry(key: string, now: number): MemoryEntry | undefined {
  const entry = memory.get(key)
  if (entry && entry.lastFailureAt + WINDOW_MS <= now) {
    memory.delete(key)
    return undefined
  }
  return entry
}

function memoryPut(key: string, entry: MemoryEntry, now: number): void {
  // Re-insert so Map order is by latest failure: expired entries sit at the
  // front, followed by the least recently failed ones.
  memory.delete(key)
  memory.set(key, entry)
  for (const [k, e] of memory) {
    if (e.lastFailureAt + WINDOW_MS > now) break
    memory.delete(k)
  }
  if (memory.size <= MEMORY_MAX_ENTRIES) return
  // Over the cap: drop the least recently failed entry that is not locked, so
  // a flood of fresh identifiers cannot push a locked account out.
  let victim: string | undefined
  for (const [k, e] of memory) {
    if (!lockState(e.failures, e.lastFailureAt, now).locked) { victim = k; break }
  }
  memory.delete(victim ?? memory.keys().next().value as string)
}

// Synchronous check-and-count: atomic within this process.
function memoryAttempt(key: string, now: number, force: boolean): Attempt {
  const entry = memoryEntry(key, now) ?? { failures: 0, lastFailureAt: 0, unsynced: 0 }
  if (lockState(entry.failures, entry.lastFailureAt, now).locked && !force) {
    return { refused: true, failures: entry.failures, lastFailureAt: entry.lastFailureAt }
  }
  entry.failures += 1
  entry.unsynced += 1
  entry.lastFailureAt = now
  memoryPut(key, entry, now)
  return { refused: false, failures: entry.failures, lastFailureAt: entry.lastFailureAt }
}

async function redisAttempt(key: string, now: number, force: boolean): Promise<Attempt> {
  // Taken synchronously, so two parallel requests cannot both carry the same
  // outage failures into Redis.
  const entry = memoryEntry(key, now)
  const carry = entry?.unsynced ?? 0
  if (entry) entry.unsynced = 0
  let reply: [number, number, number]
  try {
    reply = await redis.eval(
      ATTEMPT_SCRIPT, 1, key,
      now, force ? 1 : 0, carry, carry > 0 ? entry!.lastFailureAt : 0,
      WINDOW_MS, FREE_FAILURES, ...LOCKOUT_STEPS_SEC,
    ) as [number, number, number]
  } catch (err) {
    if (entry && memory.get(key) === entry) entry.unsynced += carry
    throw err
  }

  const attempt: Attempt = { refused: reply[0] === 1, failures: Number(reply[1]), lastFailureAt: Number(reply[2]) }
  // Mirror, keeping anything counted in memory while this call was in flight.
  const current = memoryEntry(key, now)
  memoryPut(key, {
    failures:      attempt.failures + (current?.unsynced ?? 0),
    lastFailureAt: Math.max(attempt.lastFailureAt, current?.lastFailureAt ?? 0),
    unsynced:      current?.unsynced ?? 0,
  }, now)
  return attempt
}

function warnRedisUnavailable(now: number): void {
  if (now - lastRedisWarnAt > 60_000) {
    logger.warn('Redis unavailable — login throttle falling back to in-memory store')
    lastRedisWarnAt = now
  }
}

async function attempt(key: string, now: number, force: boolean): Promise<Attempt> {
  if (redis.status === 'ready') {
    try {
      return await redisAttempt(key, now, force)
    } catch {
      warnRedisUnavailable(now)
    }
  } else {
    warnRedisUnavailable(now)
  }
  return memoryAttempt(key, now, force)
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Atomically checks the lock and, when not locked, counts this attempt as a
 * failure up front. Call it before the credential check; a locked result means
 * the credential must not be checked. Clear with recordSuccess on success.
 */
export async function reserveAttempt(scope: LoginThrottleScope, identifier: string): Promise<LoginLockState> {
  const now = Date.now()
  const result = await attempt(loginThrottleKey(scope, identifier), now, false)
  return result.refused ? lockState(result.failures, result.lastFailureAt, now) : NOT_LOCKED
}

/** Read-only lock state (does not count an attempt). */
export async function checkLocked(scope: LoginThrottleScope, identifier: string): Promise<LoginLockState> {
  const key = loginThrottleKey(scope, identifier)
  const now = Date.now()
  const entry = memoryEntry(key, now)
  if (redis.status === 'ready') {
    try {
      const [failures, lastFailureAt] = await redis.hmget(key, 'failures', 'lastFailureAt')
      const unsynced = entry?.unsynced ?? 0
      return lockState(
        (Number(failures) || 0) + unsynced,
        Math.max(Number(lastFailureAt) || 0, unsynced > 0 ? entry!.lastFailureAt : 0),
        now,
      )
    } catch {
      warnRedisUnavailable(now)
    }
  }
  return entry ? lockState(entry.failures, entry.lastFailureAt, now) : NOT_LOCKED
}

/**
 * Counts a failure even while locked; returns the lock state afterwards.
 * Test support only: the login paths reserve with reserveAttempt, which never
 * counts a refused attempt. Kept so the lock arithmetic can be driven
 * directly in loginThrottle(.redis).test.ts.
 */
export async function recordFailure(scope: LoginThrottleScope, identifier: string): Promise<LoginLockState> {
  const now = Date.now()
  const result = await attempt(loginThrottleKey(scope, identifier), now, true)
  return lockState(result.failures, result.lastFailureAt, now)
}

export async function recordSuccess(scope: LoginThrottleScope, identifier: string): Promise<void> {
  const key = loginThrottleKey(scope, identifier)
  memory.delete(key)
  if (redis.status !== 'ready') return
  try {
    await redis.del(key)
  } catch {
    warnRedisUnavailable(Date.now())
  }
}

/** The single 429 every locked login path sends, before any credential check. */
export function sendLoginLocked(res: Response, state: LoginLockState): void {
  res.setHeader('Retry-After', String(state.retryAfterSec))
  res.status(429).json({ error: LOGIN_LOCKED_ERROR })
}

/** Test helper: forget in-memory state between test cases. */
export function resetLoginThrottleMemory(): void {
  memory.clear()
}
