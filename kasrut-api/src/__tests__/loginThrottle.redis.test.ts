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
// suite has no Redis: point LOGIN_THROTTLE_REDIS_URL at a throwaway server,
// e.g. `docker run -d --rm -p 6390:6379 redis:7-alpine` and
// LOGIN_THROTTLE_REDIS_URL=redis://127.0.0.1:6390. Skipped otherwise.
const REDIS_URL = process.env.LOGIN_THROTTLE_REDIS_URL

jest.mock('../lib/redis', () => {
  const ioredis = jest.requireActual('ioredis')
  const Redis = ioredis.default ?? ioredis
  return {
    redis: new Redis(process.env.LOGIN_THROTTLE_REDIS_URL ?? 'redis://127.0.0.1:1', {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null,
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
