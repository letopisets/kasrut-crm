import { redis } from '../lib/redis'
import {
  checkLocked,
  lockoutSecondsFor,
  loginThrottleKey,
  recordFailure,
  recordSuccess,
  reserveAttempt,
  resetLoginThrottleMemory,
} from '../lib/loginThrottle'

// Minimal in-process stand-in for the Redis commands the throttle uses. `eval`
// re-implements the throttle's Lua script (loginThrottle.redis.test.ts runs
// the real one against Redis); like Redis, each call runs without interleaving.
// `broken` makes every command reject, like a connection dropped mid-request;
// `timeOut` makes the next eval run and then reject, like a call that timed
// out on the client while the server still executed it.
jest.mock('../lib/redis', () => {
  const hashes = new Map<string, Map<string, string>>()
  const expiresAt = new Map<string, number>()
  const live = (key: string) => {
    if ((expiresAt.get(key) ?? Infinity) <= Date.now()) { hashes.delete(key); expiresAt.delete(key) }
    return hashes.get(key)
  }
  const fake = {
    status: 'end',
    broken: false,
    timeOut: false,
    hashes,
    expiresAt,
    eval: jest.fn(async (_script: string, _numKeys: number, key: string, ...args: Array<number | string>) => {
      if (fake.broken) throw new Error('connection lost')
      const [now, force, carryAt, windowMs, free, stepCount] = args.slice(0, 6).map(Number)
      const steps = args.slice(6, 6 + stepCount).map(Number)
      const [id, ...carriedIds] = args.slice(6 + stepCount).map(String)
      const hash = live(key) ?? new Map<string, string>()
      let failures = Number(hash.get('failures') ?? 0)
      let last = Number(hash.get('lastFailureAt') ?? 0)
      let carried = 0
      for (const carriedId of carriedIds) {
        if (hash.has(`a:${carriedId}`)) continue
        hash.set(`a:${carriedId}`, String(now))
        carried += 1
      }
      if (carried > 0) { failures += carried; last = Math.max(last, carryAt) }
      const locked = failures > free && last + steps[Math.min(failures - free, steps.length) - 1] * 1000 > now
      const refused = locked && force !== 1
      if (!refused) {
        failures += 1
        last = now
        hash.set(`a:${id}`, String(now))
        for (const [field, value] of hash) {
          if (field.startsWith('a:') && Number(value) + windowMs <= now) hash.delete(field)
        }
      }
      if (carried > 0 || !refused) {
        hash.set('failures', String(failures))
        hash.set('lastFailureAt', String(last))
        hashes.set(key, hash)
        expiresAt.set(key, last + windowMs)
      }
      if (fake.timeOut) { fake.timeOut = false; throw new Error('Command timed out') }
      return [refused ? 1 : 0, failures, last]
    }),
    hmget: jest.fn(async (key: string, ...fields: string[]) => {
      if (fake.broken) throw new Error('connection lost')
      return fields.map(field => live(key)?.get(field) ?? null)
    }),
    del: jest.fn(async (key: string) => {
      if (fake.broken) throw new Error('connection lost')
      expiresAt.delete(key)
      return hashes.delete(key) ? 1 : 0
    }),
  }
  return { redis: fake }
})

type FakeRedis = {
  status: string
  broken: boolean
  timeOut: boolean
  hashes: Map<string, Map<string, string>>
  expiresAt: Map<string, number>
  eval: jest.Mock
  hmget: jest.Mock
  del: jest.Mock
}
const fakeRedis = redis as unknown as FakeRedis

const T0 = Date.UTC(2026, 8, 30, 12, 0, 0)
let now = T0
const advance = (seconds: number) => { now += seconds * 1000 }

const ID = 'owner@test.il'
const UNLOCKED = { locked: false, retryAfterSec: 0 }

async function fail(times: number, scope: 'crm' | 'map' = 'crm', id = ID) {
  let last = UNLOCKED
  for (let i = 0; i < times; i += 1) last = await recordFailure(scope, id)
  return last
}

// Sequential attempts that all turn out wrong: reserve, and nothing else.
async function reserve(times: number, id = ID) {
  const states = []
  for (let i = 0; i < times; i += 1) states.push(await reserveAttempt('crm', id))
  return states
}

beforeEach(() => {
  now = T0
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  fakeRedis.status = 'end'
  fakeRedis.broken = false
  fakeRedis.timeOut = false
  fakeRedis.hashes.clear()
  fakeRedis.expiresAt.clear()
  resetLoginThrottleMemory()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('lockoutSecondsFor', () => {
  it('keeps the first five failures free, then escalates 1/5/15/60 minutes and caps at 60', () => {
    expect([1, 2, 3, 4, 5].map(lockoutSecondsFor)).toEqual([0, 0, 0, 0, 0])
    expect([6, 7, 8, 9, 10, 50].map(lockoutSecondsFor)).toEqual([60, 300, 900, 3600, 3600, 3600])
  })
})

describe('loginThrottleKey', () => {
  it('stores only a digest of the normalized identifier', () => {
    const key = loginThrottleKey('crm', ' Owner@Test.IL ')
    expect(key).toMatch(/^login:fail:crm:[0-9a-f]{64}$/)
    expect(key).not.toContain('owner')
    expect(key).toBe(loginThrottleKey('crm', 'owner@test.il'))
    expect(loginThrottleKey('map', 'owner@test.il')).not.toBe(key)
  })
})

describe.each(['memory', 'redis'] as const)('login throttle (%s store)', store => {
  beforeEach(() => {
    fakeRedis.status = store === 'redis' ? 'ready' : 'end'
  })

  it('lets six attempts through, then locks progressively', async () => {
    expect(await reserve(6)).toEqual(Array(6).fill(UNLOCKED))
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    advance(59)
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 1 })
    advance(1)

    // Each lock lifts for exactly one more attempt, which escalates it.
    const steps: number[] = []
    for (let i = 0; i < 4; i += 1) {
      expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
      const state = await reserveAttempt('crm', ID)
      steps.push(state.retryAfterSec)
      advance(state.retryAfterSec)
    }
    expect(steps).toEqual([300, 900, 3600, 3600])
  })

  it('does not count refused attempts, so hammering a lock does not extend it', async () => {
    await reserve(6)
    for (let i = 0; i < 20; i += 1) await reserveAttempt('crm', ID)
    advance(60)
    expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
    expect((await reserveAttempt('crm', ID)).retryAfterSec).toBe(300)
  })

  it('admits only the free attempts plus one from a parallel burst', async () => {
    const burst = await Promise.all(Array.from({ length: 50 }, () => reserveAttempt('crm', ID)))

    expect(burst.filter(state => !state.locked)).toHaveLength(6)
    expect(burst.filter(state => state.locked).every(state => state.retryAfterSec === 60)).toBe(true)
  })

  it('clears the counter on success', async () => {
    await reserve(5)
    await recordSuccess('crm', ID)
    expect(await reserve(6)).toEqual(Array(6).fill(UNLOCKED))
    expect((await reserveAttempt('crm', ID)).retryAfterSec).toBe(60)

    await recordSuccess('crm', ID)
    expect(await checkLocked('crm', ID)).toEqual(UNLOCKED)
    expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
  })

  it('reports the lock read-only through checkLocked', async () => {
    await reserve(6)
    expect(await checkLocked('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    advance(60)
    expect(await checkLocked('crm', ID)).toEqual(UNLOCKED)
    expect(await checkLocked('crm', ID)).toEqual(UNLOCKED)
    expect((await reserve(2))[1].retryAfterSec).toBe(300)
  })

  it('counts a forced failure even while locked', async () => {
    expect(await fail(5)).toEqual(UNLOCKED)
    expect(await fail(1)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(await fail(1)).toEqual({ locked: true, retryAfterSec: 300 })
  })

  it('keeps accounts and scopes apart', async () => {
    await fail(6, 'crm', 'a@test.il')
    expect((await checkLocked('crm', 'a@test.il')).locked).toBe(true)
    expect((await checkLocked('crm', 'b@test.il')).locked).toBe(false)
    expect((await checkLocked('map', 'a@test.il')).locked).toBe(false)
  })

  it('forgets failures 24h after the latest one', async () => {
    await reserve(5)
    advance(24 * 60 * 60)
    expect(await reserve(6)).toEqual(Array(6).fill(UNLOCKED))
  })
})

describe('login throttle storage', () => {
  it('keeps an expiry of 24h after the latest failure on the Redis key, never a raw identifier', async () => {
    fakeRedis.status = 'ready'
    await reserve(3)
    advance(10)
    await reserve(1)

    const key = loginThrottleKey('crm', ID)
    expect(fakeRedis.expiresAt.get(key)).toBe(now + 24 * 60 * 60 * 1000)
    expect(fakeRedis.hashes.get(key)?.get('failures')).toBe('4')
    expect([...fakeRedis.hashes.keys()].join()).not.toContain('owner')
  })

  it('falls back to memory when a Redis command fails, counting each attempt once', async () => {
    fakeRedis.status = 'ready'
    fakeRedis.broken = true

    expect(await reserve(6)).toEqual(Array(6).fill(UNLOCKED))
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(await checkLocked('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
  })

  it('adds failures counted during an outage to the Redis count once Redis is back', async () => {
    await reserve(3)
    fakeRedis.status = 'ready'
    expect(await reserve(3)).toEqual(Array(3).fill(UNLOCKED))
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('6')

    // Carried over exactly once: Redis keeps the sum, the next lock escalates.
    advance(60)
    await reserve(1)
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('7')
  })

  it('carries outage failures back if the Redis call fails', async () => {
    await reserve(3)
    fakeRedis.status = 'ready'
    fakeRedis.broken = true
    await reserve(1)
    fakeRedis.broken = false
    await reserve(2)
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('6')
  })

  it('counts an attempt once when its Redis call timed out but still ran', async () => {
    fakeRedis.status = 'ready'
    await reserve(2)
    fakeRedis.timeOut = true
    expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)   // counted in Redis and in memory
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('3')

    await reserve(1)   // carries the memory count: Redis already has that attempt
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('4')
    expect(await reserve(2)).toEqual([UNLOCKED, UNLOCKED])
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
  })

  it('counts each attempt once across consecutive timed-out calls', async () => {
    fakeRedis.status = 'ready'
    await reserve(1)
    for (let i = 0; i < 3; i += 1) {
      fakeRedis.timeOut = true
      expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
    }
    await reserve(1)
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('5')
  })

  it('forgets attempt ids older than the window while the counter lives on', async () => {
    fakeRedis.status = 'ready'
    const attemptIds = () => [...fakeRedis.hashes.get(loginThrottleKey('crm', ID))!.keys()].filter(f => f.startsWith('a:'))
    await reserve(1)
    const [first] = attemptIds()
    advance(23 * 60 * 60)
    await reserve(1)
    advance(23 * 60 * 60)
    await reserve(1)

    expect(attemptIds()).toHaveLength(2)
    expect(attemptIds()).not.toContain(first)
    expect(fakeRedis.hashes.get(loginThrottleKey('crm', ID))?.get('failures')).toBe('3')
  })

  it('still honours a lock taken in Redis while Redis is down', async () => {
    fakeRedis.status = 'ready'
    await reserve(6)
    fakeRedis.status = 'end'
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
  })

  it('still honours a lock recorded in memory after Redis comes back', async () => {
    await reserve(6)
    fakeRedis.status = 'ready'
    expect(await checkLocked('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })
    expect(await reserveAttempt('crm', ID)).toEqual({ locked: true, retryAfterSec: 60 })

    await recordSuccess('crm', ID)
    expect(await checkLocked('crm', ID)).toEqual(UNLOCKED)
    expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
  })

  it('lets an operator lift a lock by deleting the Redis key', async () => {
    fakeRedis.status = 'ready'
    await reserve(6)
    await redis.del(loginThrottleKey('crm', ID))
    expect(await reserveAttempt('crm', ID)).toEqual(UNLOCKED)
  })

  it('bounds the memory store, evicting unlocked identifiers before locked ones', async () => {
    await reserve(6, 'victim@test.il')
    advance(1)
    for (let i = 0; i < 9_999; i += 1) await reserveAttempt('crm', `filler-${i}@test.il`)
    await reserve(4, 'filler-0@test.il')
    expect((await reserveAttempt('crm', 'filler-0@test.il')).locked).toBe(false)

    // The store is full: the next newcomer pushes out the oldest unlocked
    // entry (filler-1), never the locked victim or the now-locked filler-0.
    await reserveAttempt('crm', 'one-too-many@test.il')
    expect((await reserveAttempt('crm', 'victim@test.il')).locked).toBe(true)
    expect((await reserveAttempt('crm', 'filler-0@test.il')).locked).toBe(true)
    // Six more free attempts: its earlier failure is gone.
    expect(await reserve(6, 'filler-1@test.il')).toEqual(Array(6).fill(UNLOCKED))
  })
})
