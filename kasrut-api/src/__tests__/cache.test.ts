import {
  withCache, invalidateKeys, withNamespaceCache, invalidateNamespace,
} from '../lib/cache'
import {
  invalidateHechsherimCache, invalidateRestaurantsCache, withHechsherimCache, withRestaurantsCache,
} from '../lib/crmCache'
import { invalidateMapCache, withMapCache } from '../lib/mapCache'
import { redis } from '../lib/redis'
import { logger } from '../lib/logger'

jest.mock('../lib/redis', () => ({
  redis: {
    get:    jest.fn(),
    set:    jest.fn(),
    setex:  jest.fn(),
    incr:   jest.fn(),
    eval:   jest.fn(),
    scan:   jest.fn(),
    del:    jest.fn(),
  },
}))

const mockedRedis = redis as unknown as {
  get:   jest.Mock
  set:   jest.Mock
  setex: jest.Mock
  incr:  jest.Mock
  eval:  jest.Mock
  scan:  jest.Mock
  del:   jest.Mock
}

// In-memory stand-in for the handful of commands the cache uses, so the
// generation tests exercise real key layouts rather than scripted replies.
function useFakeRedis(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  mockedRedis.get.mockImplementation(async (key: string) => store.get(key) ?? null)
  mockedRedis.set.mockImplementation(async (key: string, value: string, mode?: string) => {
    if (mode === 'NX' && store.has(key)) return null
    store.set(key, value)
    return 'OK'
  })
  mockedRedis.setex.mockImplementation(async (key: string, _ttl: number, value: string) => {
    store.set(key, value)
    return 'OK'
  })
  mockedRedis.incr.mockImplementation(async (key: string) => {
    const next = Number(store.get(key) ?? 0) + 1
    store.set(key, String(next))
    return next
  })
  // The generation reseed script: compare-and-set.
  mockedRedis.eval.mockImplementation(async (_script: string, _keys: number, key: string, expected: string, next: string) => {
    if (store.get(key) !== expected) return 0
    store.set(key, next)
    return 1
  })
  mockedRedis.del.mockImplementation(async (...keys: string[]) => keys.filter(k => store.delete(k)).length)
  return store
}

describe('withCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns cached value on hit (does not call loader)', async () => {
    mockedRedis.get.mockResolvedValueOnce(JSON.stringify({ a: 1 }))
    const loader = jest.fn().mockResolvedValue({ a: 999 })

    const data = await withCache('k', 60, loader)

    expect(data).toEqual({ a: 1 })
    expect(loader).not.toHaveBeenCalled()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('falls back to loader on miss and writes through to redis', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    mockedRedis.setex.mockResolvedValueOnce('OK')
    const loader = jest.fn().mockResolvedValue({ a: 2 })

    const data = await withCache('k', 60, loader)

    expect(data).toEqual({ a: 2 })
    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('k', 60, JSON.stringify({ a: 2 }))
  })

  it('returns loader result when redis read throws', async () => {
    mockedRedis.get.mockRejectedValueOnce(new Error('redis down'))
    const loader = jest.fn().mockResolvedValue('fresh')

    const data = await withCache('k', 60, loader)

    expect(data).toBe('fresh')
  })

  it('returns loader result when redis write throws', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    mockedRedis.setex.mockRejectedValueOnce(new Error('write fail'))
    const loader = jest.fn().mockResolvedValue('fresh')

    const data = await withCache('k', 60, loader)

    expect(data).toBe('fresh')
  })

  it('coalesces concurrent misses for the same key', async () => {
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')

    let resolveLoader!: (value: { a: number }) => void
    const loader = jest.fn(() => new Promise<{ a: number }>(resolve => {
      resolveLoader = resolve
    }))

    const first = withCache('shared', 60, loader)
    const second = withCache('shared', 60, loader)

    await Promise.resolve()
    resolveLoader({ a: 3 })

    await expect(Promise.all([first, second])).resolves.toEqual([{ a: 3 }, { a: 3 }])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledTimes(1)
  })

  it('removes a rejected load so a later request can retry', async () => {
    mockedRedis.get.mockResolvedValue(null)
    const loader = jest.fn()
      .mockRejectedValueOnce(new Error('loader failed'))
      .mockResolvedValueOnce('recovered')

    await expect(withCache('retry', 60, loader)).rejects.toThrow('loader failed')
    await expect(withCache('retry', 60, loader)).resolves.toBe('recovered')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('does not repopulate stale data when invalidated during a load', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)

    let resolveLoader!: (value: string) => void
    const loader = jest.fn(() => new Promise<string>(resolve => {
      resolveLoader = resolve
    }))

    const pending = withCache('restaurants:list', 300, loader)
    await Promise.resolve()
    await invalidateKeys('restaurants:list')
    resolveLoader('stale snapshot')

    await expect(pending).resolves.toBe('stale snapshot')
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('does not let a post-invalidation caller join a pre-invalidation load', async () => {
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')

    let resolveStale!: (value: string) => void
    const loader = jest.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveStale = resolve }))
      .mockResolvedValueOnce('fresh')

    const before = withCache('map:options', 600, loader)
    await Promise.resolve()
    await invalidateKeys('map:options')
    const after = withCache('map:options', 600, loader)
    resolveStale('stale')

    await expect(before).resolves.toBe('stale')
    await expect(after).resolves.toBe('fresh')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:options', 600, JSON.stringify('fresh'))
  })

  it('returns but never stores a null result (unknown ids must not mint keys)', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    const loader = jest.fn().mockResolvedValue(null)

    await expect(withCache('map:restaurant:nope', 300, loader)).resolves.toBeNull()
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })
})

describe('invalidateKeys', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes the named keys in one call', async () => {
    await invalidateKeys('map:sitemap', 'map:options')
    expect(mockedRedis.del).toHaveBeenCalledWith('map:sitemap', 'map:options')
  })

  it('blocks a load that started before it from writing back', async () => {
    mockedRedis.get.mockResolvedValueOnce(null)
    let resolveLoader!: (value: string) => void
    const loader = jest.fn(() => new Promise<string>(resolve => { resolveLoader = resolve }))

    const pending = withCache('map:sitemap', 3600, loader)
    await Promise.resolve()
    await invalidateKeys('map:sitemap')
    resolveLoader('<urlset/>')

    await expect(pending).resolves.toBe('<urlset/>')
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('swallows redis errors silently', async () => {
    mockedRedis.del.mockRejectedValueOnce(new Error('down'))
    await expect(invalidateKeys('map:options')).resolves.toBeUndefined()
  })
})

describe('withNamespaceCache / invalidateNamespace', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    // clearMocks keeps implementations; the other describes expect bare mocks.
    Object.values(mockedRedis).forEach(m => m.mockReset())
    jest.restoreAllMocks()
  })

  it('keys every entry by the current generation', async () => {
    const store = useFakeRedis({ 'map:gen': '7' })
    const loader = jest.fn().mockResolvedValue({ a: 1 })

    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toEqual({ a: 1 })
    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toEqual({ a: 1 })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v7:options', 600, JSON.stringify({ a: 1 }))
    expect(store.has('map:options')).toBe(false)
  })

  it('seeds a missing generation from the clock, never from zero', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    useFakeRedis({ 'map:v1:options': JSON.stringify('left over by an older counter') })
    const loader = jest.fn().mockResolvedValue('fresh')

    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toBe('fresh')

    expect(mockedRedis.set).toHaveBeenCalledWith('map:gen', '1790000000000', 'NX')
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v1790000000000:options', 600, JSON.stringify('fresh'))
  })

  it('invalidates with one INCR, without visiting or deleting any entry', async () => {
    const store = useFakeRedis({ 'map:gen': '3', 'map:v3:restaurant:r1': JSON.stringify({ id: 'r1' }) })

    await expect(withNamespaceCache('map', 'restaurant:r1', 300, jest.fn())).resolves.toEqual({ id: 'r1' })
    await invalidateNamespace('map')

    expect(mockedRedis.scan).not.toHaveBeenCalled()
    expect(mockedRedis.del).not.toHaveBeenCalled()
    expect(store.get('map:gen')).toBe('4')
    // The place was withdrawn: the reader now misses, and the miss is not stored.
    const loader = jest.fn().mockResolvedValue(null)
    await expect(withNamespaceCache('map', 'restaurant:r1', 300, loader)).resolves.toBeNull()
    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('bumps from a clock seed when the counter is missing', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const store = useFakeRedis()

    await invalidateNamespace('map')

    expect(store.get('map:gen')).toBe('1790000000001')
  })

  it('does not repopulate stale data when invalidated during a load', async () => {
    useFakeRedis({ 'map:gen': '1' })
    let resolveLoader!: (value: string) => void
    const loader = jest.fn(() => new Promise<string>(resolve => { resolveLoader = resolve }))

    const pending = withNamespaceCache('map', 'sitemap', 3600, loader)
    await new Promise(setImmediate)
    expect(loader).toHaveBeenCalledTimes(1)
    await invalidateNamespace('map')
    resolveLoader('<urlset/>')

    await expect(pending).resolves.toBe('<urlset/>')
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('does not let a post-invalidation caller join a pre-invalidation load', async () => {
    useFakeRedis({ 'map:gen': '1' })
    let resolveStale!: (value: string) => void
    const loader = jest.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveStale = resolve }))
      .mockResolvedValueOnce('fresh')

    const before = withNamespaceCache('map', 'options', 600, loader)
    await new Promise(setImmediate)
    await invalidateNamespace('map')
    const after = withNamespaceCache('map', 'options', 600, loader)
    await new Promise(setImmediate)
    resolveStale('stale')

    await expect(before).resolves.toBe('stale')
    await expect(after).resolves.toBe('fresh')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).toHaveBeenCalledTimes(1)
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v2:options', 600, JSON.stringify('fresh'))
  })

  it('loads from the source when Redis is down, still coalescing callers', async () => {
    mockedRedis.get.mockRejectedValue(new Error('redis down'))
    let resolveLoader!: (value: string) => void
    const loader = jest.fn(() => new Promise<string>(resolve => { resolveLoader = resolve }))

    const first = withNamespaceCache('map', 'options', 600, loader)
    const second = withNamespaceCache('map', 'options', 600, loader)
    await new Promise(setImmediate)
    resolveLoader('fresh')

    await expect(Promise.all([first, second])).resolves.toEqual(['fresh', 'fresh'])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(mockedRedis.get).not.toHaveBeenCalledWith(expect.stringMatching(/^map:v/))
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('bypasses the namespace after a failed bump until a later bump lands', async () => {
    const store = useFakeRedis({ 'map:gen': '3', 'map:v3:options': JSON.stringify('stale') })
    mockedRedis.incr
      .mockRejectedValueOnce(new Error('redis down'))   // the mutation's bump
      .mockRejectedValueOnce(new Error('redis down'))   // its retry on the next read

    await expect(invalidateNamespace('map')).resolves.toBeUndefined()
    const loader = jest.fn().mockResolvedValue('fresh')

    // Still owed a bump: the stale entry is not served and nothing is written.
    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toBe('fresh')
    expect(mockedRedis.setex).not.toHaveBeenCalled()

    // Redis accepts the retried bump: caching resumes under the new generation.
    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toBe('fresh')
    expect(store.get('map:gen')).toBe('4')
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v4:options', 600, JSON.stringify('fresh'))
    expect(loader).toHaveBeenCalledTimes(2)

    // Caught up: reads stop bumping and hit the cache.
    await withNamespaceCache('map', 'options', 600, loader)
    expect(store.get('map:gen')).toBe('4')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it.each(['garbage', '-4', '1'.repeat(19)])('reseeds a stored generation %s that INCR could not advance', async value => {
    jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const store = useFakeRedis({ 'map:gen': value })
    const loader = jest.fn().mockResolvedValue('fresh')

    await expect(withNamespaceCache('map', 'options', 600, loader)).resolves.toBe('fresh')

    expect(store.get('map:gen')).toBe('1790000000000')
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v1790000000000:options', 600, JSON.stringify('fresh'))
  })

  it('lets a bump reseed a generation that is not a counter instead of failing on it', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const store = useFakeRedis({ 'map:gen': 'garbage' })

    await invalidateNamespace('map')

    expect(store.get('map:gen')).toBe('1790000000001')
    // Nothing owed: the next read caches again.
    const loader = jest.fn().mockResolvedValue('fresh')
    await withNamespaceCache('map', 'options', 600, loader)
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v1790000000001:options', 600, JSON.stringify('fresh'))
  })

  it('never overwrites a generation another process repaired meanwhile', async () => {
    const store = useFakeRedis({ 'map:gen': 'garbage' })
    const fakeGet = mockedRedis.get.getMockImplementation()!
    // Another process reseeds (and bumps) between this read and the reseed.
    mockedRedis.get.mockImplementationOnce(async (key: string) => {
      const value = await fakeGet(key)
      store.set(key, '55')
      return value
    })

    await withNamespaceCache('map', 'options', 600, jest.fn().mockResolvedValue('fresh'))

    expect(store.get('map:gen')).toBe('55')
    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v55:options', 600, JSON.stringify('fresh'))
  })

  it('keeps a namespace Redis will not let it bump bypassed, and says so every few minutes', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const warn = jest.spyOn(logger, 'warn')
    // Reads work, writes are refused (MISCONF after a failed save, OOM).
    const store = useFakeRedis({ 'ns-ro:gen': '9', 'ns-ro:v9:options': JSON.stringify('stale') })
    const refused = new Error('MISCONF')
    mockedRedis.incr.mockRejectedValue(refused)
    mockedRedis.setex.mockRejectedValue(refused)

    await invalidateNamespace('ns-ro')
    const loader = jest.fn().mockResolvedValue('fresh')
    for (let i = 0; i < 3; i++) {
      await expect(withNamespaceCache('ns-ro', 'options', 600, loader)).resolves.toBe('fresh')
    }

    expect(loader).toHaveBeenCalledTimes(3)
    expect(store.get('ns-ro:gen')).toBe('9')
    const bypassWarnings = () => warn.mock.calls.filter(([, msg]) => String(msg).startsWith('cache namespace bypassed'))
    expect(bypassWarnings()).toHaveLength(1)
    expect(bypassWarnings()[0][0]).toEqual({ namespace: 'ns-ro', bumpOwed: true })

    now.mockReturnValue(1_790_000_000_000 + 5 * 60_000)
    await withNamespaceCache('ns-ro', 'options', 600, loader)
    expect(bypassWarnings()).toHaveLength(2)
  })
})

describe('mapCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    Object.values(mockedRedis).forEach(m => m.mockReset())
  })

  it('invalidateMapCache bumps the map and CRM restaurant generations without sweeping', async () => {
    const store = useFakeRedis({ 'map:gen': '41', 'restaurants:gen': '7', 'hechsherim:gen': '3' })

    await invalidateMapCache()

    expect(store.get('map:gen')).toBe('42')
    expect(store.get('restaurants:gen')).toBe('8')
    expect(store.get('hechsherim:gen')).toBe('3')
    expect(mockedRedis.scan).not.toHaveBeenCalled()
  })

  it('invalidateMapCache drops the unversioned keys an older build would read after a rollback', async () => {
    const store = useFakeRedis({
      'map:gen': '41', 'map:sitemap': '"<urlset/>"', 'map:options': '{}', 'map:hechsherim': '[]',
    })

    await invalidateMapCache()

    expect(mockedRedis.del).toHaveBeenCalledWith('map:sitemap', 'map:options', 'map:hechsherim')
    expect([...store.keys()].filter(key => !key.endsWith(':gen'))).toEqual([])
  })

  it('withMapCache reads and writes the map namespace', async () => {
    useFakeRedis({ 'map:gen': '42' })
    const loader = jest.fn().mockResolvedValue(['h1'])

    await expect(withMapCache('hechsherim', 600, loader)).resolves.toEqual(['h1'])

    expect(mockedRedis.setex).toHaveBeenCalledWith('map:v42:hechsherim', 600, JSON.stringify(['h1']))
  })
})

describe('crmCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    Object.values(mockedRedis).forEach(m => m.mockReset())
  })

  it('keeps the CRM lists in their own generation-versioned namespaces', async () => {
    useFakeRedis({ 'restaurants:gen': '5', 'hechsherim:gen': '9' })

    await withRestaurantsCache('list:{"mashgiachId":"m1"}', 300, async () => ['r1'])
    await withHechsherimCache('list:all:all', 300, async () => ['h1'])

    expect(mockedRedis.setex).toHaveBeenCalledWith('restaurants:v5:list:{"mashgiachId":"m1"}', 300, JSON.stringify(['r1']))
    expect(mockedRedis.setex).toHaveBeenCalledWith('hechsherim:v9:list:all:all', 300, JSON.stringify(['h1']))
  })

  it('invalidates each with one INCR', async () => {
    const store = useFakeRedis({ 'restaurants:gen': '5', 'hechsherim:gen': '9' })

    await invalidateRestaurantsCache()
    await invalidateHechsherimCache()

    expect(store.get('restaurants:gen')).toBe('6')
    expect(store.get('hechsherim:gen')).toBe('10')
    expect(mockedRedis.scan).not.toHaveBeenCalled()
    expect(mockedRedis.del).not.toHaveBeenCalled()
  })

  // A Redis stall used to cut the SCAN sweep short with nothing owed: the
  // mutation returned and readers got the pre-mutation list, a mashgiach's
  // included, for up to the 300 s TTL.
  it('never serves a list from before a mutation whose invalidation timed out', async () => {
    const store = useFakeRedis({
      'restaurants:gen': '5',
      'restaurants:v5:list:{"mashgiachId":"m1"}': JSON.stringify(['r1', 'r2']),
    })
    mockedRedis.incr.mockRejectedValueOnce(new Error('Command timed out'))

    await invalidateRestaurantsCache()   // r2 was just reassigned away from m1
    const loader = jest.fn().mockResolvedValue(['r1'])

    await expect(withRestaurantsCache('list:{"mashgiachId":"m1"}', 300, loader)).resolves.toEqual(['r1'])
    expect(loader).toHaveBeenCalledTimes(1)
    expect(store.get('restaurants:gen')).toBe('6')   // the owed bump, delivered by the read
  })
})
