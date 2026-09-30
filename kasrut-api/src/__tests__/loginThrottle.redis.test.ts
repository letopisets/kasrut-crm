import { randomUUID } from 'crypto'
import { redis } from '../lib/redis'
import {
  checkLocked,
  loginThrottleKey,
  recordFailure,
  recordSuccess,
  reserveAttempt,
  resetLoginThrottleMemory,
} from '../lib/loginThrottle'

// Runs the throttle's Lua script against a real Redis. Opt-in, since the
// suite has no Redis: point REDIS_TEST_URL (or its older name
// LOGIN_THROTTLE_REDIS_URL) at a throwaway server, e.g.
// `docker run -d --rm -p 6390:6379 redis:7-alpine` and
// REDIS_TEST_URL=redis://127.0.0.1:6390. Skipped otherwise. The suite pauses
// that server.
const REDIS_URL = process.env.REDIS_TEST_URL ?? process.env.LOGIN_THROTTLE_REDIS_URL

jest.mock('../lib/redis', () => {
  const ioredis = jest.requireActual('ioredis')
  const Redis = ioredis.default ?? ioredis
  return {
    // The API's client settings, including the 500 ms command timeout
    // (REDIS_COMMAND_TIMEOUT_MS in lib/redis.ts).
    redis: new Redis(process.env.REDIS_TEST_URL ?? process.env.LOGIN_THROTTLE_REDIS_URL ?? 'redis://127.0.0.1:1', {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null,
      commandTimeout: 500,
    }),
  }
})

const describeWithRedis = REDIS_URL ? describe : describe.skip
const UNLOCKED = { locked: false, retryAfterSec: 0 }

describeWithRedis('login throttle against a real Redis', () => {
  let now = 0
  let id = ''
  const advance = (seconds: number) => { now += seconds * 1000 }
  const hget = (field: string) => redis.hget(loginThrottleKey('crm', id), field)

  beforeAll(async () => { await redis.connect() })
  afterAll(async () => { await redis.quit() })

  beforeEach(() => {
    // Real server clock: the key's expiry is an absolute time.
    now = Date.now()
    jest.spyOn(Date, 'now').mockImplementation(() => now)
    id = `${randomUUID()}@throttle.test`
    resetLoginThrottleMemory()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await redis.del(loginThrottleKey('crm', id))
  })

  it('admits only the free attempts plus one from a parallel burst', async () => {
    const burst = await Promise.all(Array.from({ length: 50 }, () => reserveAttempt('crm', id)))

    expect(burst.filter(state => !state.locked)).toHaveLength(6)
    expect(await hget('failures')).toBe('6')
    expect(await hget('lastFailureAt')).toBe(String(now))
    const pttl = await redis.pttl(loginThrottleKey('crm', id))
    expect(pttl).toBeGreaterThan(24 * 60 * 60 * 1000 - 60_000)
    expect(pttl).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('escalates after each lock without counting refused attempts', async () => {
    for (let i = 0; i < 6; i += 1) expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
    expect(await reserveAttempt('crm', id)).toEqual({ locked: true, retryAfterSec: 60 })
    advance(30)
    expect(await reserveAttempt('crm', id)).toEqual({ locked: true, retryAfterSec: 30 })
    expect(await hget('failures')).toBe('6')

    advance(30)
    expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
    expect(await checkLocked('crm', id)).toEqual({ locked: true, retryAfterSec: 300 })
    expect(await recordFailure('crm', id)).toEqual({ locked: true, retryAfterSec: 900 })
    expect(await hget('failures')).toBe('8')
  })

  it('clears on success and on an operator deleting the key', async () => {
    for (let i = 0; i < 6; i += 1) await reserveAttempt('crm', id)
    await recordSuccess('crm', id)
    expect(await redis.exists(loginThrottleKey('crm', id))).toBe(0)

    for (let i = 0; i < 6; i += 1) await reserveAttempt('crm', id)
    await redis.del(loginThrottleKey('crm', id))
    expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
  })

  it('counts an attempt once when its call timed out but Redis ran it after the stall', async () => {
    await reserveAttempt('crm', id)
    const admin = redis.duplicate()
    await admin.connect()
    try {
      // The server stops answering for 1.2 s: the attempt's script call times
      // out after 500 ms and the attempt is counted in memory, but Redis runs
      // the script once the stall ends.
      await admin.call('CLIENT', 'PAUSE', '1200', 'ALL')
      expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
      await new Promise(resolve => setTimeout(resolve, 1_000))
      expect(await hget('failures')).toBe('2')

      // The next attempt carries the memory count; Redis already has it.
      expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
      expect(await hget('failures')).toBe('3')
      for (let i = 0; i < 3; i += 1) expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
      expect(await reserveAttempt('crm', id)).toEqual({ locked: true, retryAfterSec: 60 })
      expect(await hget('failures')).toBe('6')
    } finally {
      admin.disconnect()
    }
  }, 10_000)

  it('keeps the ids of counted attempts only for the window', async () => {
    const attemptIds = async () => Object.keys(await redis.hgetall(loginThrottleKey('crm', id))).filter(f => f.startsWith('a:'))
    await reserveAttempt('crm', id)
    const [first] = await attemptIds()
    advance(23 * 60 * 60)
    await reserveAttempt('crm', id)
    advance(23 * 60 * 60)
    await reserveAttempt('crm', id)

    const ids = await attemptIds()
    expect(ids).toHaveLength(2)
    expect(ids).not.toContain(first)
    expect(await hget('failures')).toBe('3')
  })

  it('adds failures counted during an outage once Redis is back', async () => {
    const ended = new Promise(resolve => redis.once('end', resolve))
    redis.disconnect()
    await ended
    for (let i = 0; i < 4; i += 1) expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
    await redis.connect()

    expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
    expect(await reserveAttempt('crm', id)).toEqual(UNLOCKED)
    expect(await reserveAttempt('crm', id)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(await hget('failures')).toBe('6')
  })
})
