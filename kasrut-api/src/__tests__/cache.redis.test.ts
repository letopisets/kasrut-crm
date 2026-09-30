import { randomUUID } from 'crypto'
import IORedis from 'ioredis'
import { redis } from '../lib/redis'
import { invalidateRestaurantsCache, withRestaurantsCache } from '../lib/crmCache'

// The CRM list cache against a real Redis that stalls. Opt-in, like
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

describeWithRedis('CRM list cache against a real Redis', () => {
  let admin: IORedis

  beforeAll(async () => {
    await redis.connect()
    admin = new IORedis(REDIS_URL!, { lazyConnect: true, maxRetriesPerRequest: 0 })
    await admin.connect()
  })

  afterAll(async () => {
    const keys = await admin.keys('restaurants:*')
    if (keys.length) await admin.del(...keys)
    await redis.quit()
    await admin.quit()
  })

  it('does not serve the pre-mutation list after an invalidation that timed out', async () => {
    const suffix = `list:${JSON.stringify({ mashgiachId: randomUUID() })}`
    await withRestaurantsCache(suffix, 300, async () => ['r1 (assigned)', 'r2 (assigned)'])
    // Cached: the next read does not reach the loader.
    const loader = jest.fn(async () => ['r1 (assigned)'])
    expect(await withRestaurantsCache(suffix, 300, loader)).toEqual(['r1 (assigned)', 'r2 (assigned)'])
    expect(loader).not.toHaveBeenCalled()

    // r2 moves to another mashgiach while Redis stalls for 1.2 s: the
    // invalidation's commands time out after 500 ms.
    await admin.call('CLIENT', 'PAUSE', '1200', 'ALL')
    const started = Date.now()
    await invalidateRestaurantsCache()
    expect(Date.now() - started).toBeLessThan(1_100)
    await sleep(1_000)

    expect(await withRestaurantsCache(suffix, 300, loader)).toEqual(['r1 (assigned)'])
    expect(await withRestaurantsCache(suffix, 300, loader)).toEqual(['r1 (assigned)'])
    expect(loader).toHaveBeenCalledTimes(1)   // cached again under the new generation
  }, 10_000)
})
