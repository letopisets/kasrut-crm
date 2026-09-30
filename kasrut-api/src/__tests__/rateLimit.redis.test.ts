import { randomUUID } from 'crypto'
import IORedis from 'ioredis'
import { redis } from '../lib/redis'
import { consumeRateLimit, resetRateLimitMemory } from '../middleware/rateLimit'

// Runs the rate limiter's window script against a real Redis. Opt-in, like
// loginThrottle.redis.test.ts: point REDIS_TEST_URL at a throwaway server
// (docs/testing.md). Skipped otherwise. The suite pauses that server.
const REDIS_URL = process.env.REDIS_TEST_URL ?? process.env.LOGIN_THROTTLE_REDIS_URL

// The API's client settings, including the 500 ms command timeout
// (REDIS_COMMAND_TIMEOUT_MS in lib/redis.ts).
jest.mock('../lib/redis', () => {
  const ioredis = jest.requireActual('ioredis')
  const Redis = ioredis.default ?? ioredis
  return {
    redis: new Redis(process.env.REDIS_TEST_URL ?? process.env.LOGIN_THROTTLE_REDIS_URL ?? 'redis://127.0.0.1:1', {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null,
      commandTimeout: 500,
    }),
  }
})

const describeWithRedis = REDIS_URL ? describe : describe.skip
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describeWithRedis('rate limiter against a real Redis', () => {
  let admin: IORedis
  let prefix = ''
  const bucketKey = (bucket: string) => `rl:${prefix}:${bucket}`

  beforeAll(async () => {
    await redis.connect()
    admin = new IORedis(REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 0 })
    await admin.connect()
  })

  afterAll(async () => {
    await redis.quit()
    await admin.quit()
  })

  beforeEach(() => {
    prefix = `test-${randomUUID()}`
    resetRateLimitMemory()
  })

  afterEach(async () => {
    const keys = await admin.keys(`rl:${prefix}:*`)
    if (keys.length) await admin.del(...keys)
  })

  it('counts in Redis and gives the window its expiry', async () => {
    const window = { keyPrefix: prefix, windowMs: 60_000, max: 2 }
    const results = [
      await consumeRateLimit(window, 'a'),
      await consumeRateLimit(window, 'a'),
      await consumeRateLimit(window, 'a'),
    ]

    expect(results.map(r => r.allowed)).toEqual([true, true, false])
    expect(results[2].retryAfter).toBeGreaterThanOrEqual(59)
    expect(results[2].retryAfter).toBeLessThanOrEqual(60)
    expect(await admin.get(bucketKey('a'))).toBe('3')
    const pttl = await admin.pttl(bucketKey('a'))
    expect(pttl).toBeGreaterThan(55_000)
    expect(pttl).toBeLessThanOrEqual(60_000)
  })

  it('gives a counter left without an expiry one, so its bucket opens again', async () => {
    await admin.set(bucketKey('stuck'), '40')   // no TTL, e.g. left by a stalled INCR
    const window = { keyPrefix: prefix, windowMs: 1_000, max: 3 }

    expect((await consumeRateLimit(window, 'stuck')).allowed).toBe(false)
    const pttl = await admin.pttl(bucketKey('stuck'))
    expect(pttl).toBeGreaterThan(0)
    expect(pttl).toBeLessThanOrEqual(1_000)

    await sleep(1_200)
    expect((await consumeRateLimit(window, 'stuck')).allowed).toBe(true)
  })

  it('never leaves a key without an expiry when a stalled call runs after the client gave up', async () => {
    const window = { keyPrefix: prefix, windowMs: 2_000, max: 3 }
    // The server stops answering for 1.2 s: the first call times out after
    // 500 ms and falls back to memory, but Redis still runs it afterwards.
    await admin.call('CLIENT', 'PAUSE', '1200', 'ALL')
    const started = Date.now()
    expect((await consumeRateLimit(window, 'victim')).allowed).toBe(true)
    expect(Date.now() - started).toBeLessThan(1_100)
    await sleep(1_000)

    expect(await admin.get(bucketKey('victim'))).toBe('1')
    const pttl = await admin.pttl(bucketKey('victim'))
    expect(pttl).toBeGreaterThan(0)
    expect(pttl).toBeLessThanOrEqual(2_000)

    // Fill the bucket, then wait out the window: it opens again.
    for (let i = 0; i < 3; i += 1) await consumeRateLimit(window, 'victim')
    expect((await consumeRateLimit(window, 'victim')).allowed).toBe(false)
    await sleep(2_200)
    expect((await consumeRateLimit(window, 'victim')).allowed).toBe(true)
  }, 15_000)
})
