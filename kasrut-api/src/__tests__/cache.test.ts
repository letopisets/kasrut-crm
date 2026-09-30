import { withCache, invalidateKeys, invalidatePattern } from '../lib/cache'
import { invalidateMapCache, MAP_CACHE_KEYS } from '../lib/mapCache'
import { redis } from '../lib/redis'

jest.mock('../lib/redis', () => ({
  redis: {
    get:    jest.fn(),
    setex:  jest.fn(),
    scan:   jest.fn(),
    del:    jest.fn(),
  },
}))

const mockedRedis = redis as unknown as {
  get:   jest.Mock
  setex: jest.Mock
  scan:  jest.Mock
  del:   jest.Mock
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
    mockedRedis.scan.mockResolvedValueOnce(['0', []])

    let resolveLoader!: (value: string) => void
    const loader = jest.fn(() => new Promise<string>(resolve => {
      resolveLoader = resolve
    }))

    const pending = withCache('restaurants:list', 300, loader)
    await Promise.resolve()
    await invalidatePattern('restaurants:*')
    resolveLoader('stale snapshot')

    await expect(pending).resolves.toBe('stale snapshot')
    expect(mockedRedis.setex).not.toHaveBeenCalled()
  })

  it('does not let a post-invalidation caller join a pre-invalidation load', async () => {
    mockedRedis.get.mockResolvedValue(null)
    mockedRedis.setex.mockResolvedValue('OK')
    mockedRedis.scan.mockResolvedValueOnce(['0', []])

    let resolveStale!: (value: string) => void
    const loader = jest.fn()
      .mockImplementationOnce(() => new Promise<string>(resolve => { resolveStale = resolve }))
      .mockResolvedValueOnce('fresh')

    const before = withCache('map:options', 600, loader)
    await Promise.resolve()
    await invalidatePattern('map:*')
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

describe('invalidatePattern', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes all matching keys across multiple scan pages', async () => {
    mockedRedis.scan
      .mockResolvedValueOnce(['10', ['a:1', 'a:2']])
      .mockResolvedValueOnce(['0',  ['a:3']])
    await invalidatePattern('a:*')
    expect(mockedRedis.scan).toHaveBeenNthCalledWith(1, '0', 'MATCH', 'a:*', 'COUNT', 200)
    expect(mockedRedis.scan).toHaveBeenNthCalledWith(2, '10', 'MATCH', 'a:*', 'COUNT', 200)
    expect(mockedRedis.del).toHaveBeenCalledWith('a:1', 'a:2')
    expect(mockedRedis.del).toHaveBeenCalledWith('a:3')
  })

  it('does nothing when no keys match', async () => {
    mockedRedis.scan.mockResolvedValueOnce(['0', []])
    await invalidatePattern('z:*')
    expect(mockedRedis.del).not.toHaveBeenCalled()
  })

  it('swallows redis errors silently', async () => {
    mockedRedis.scan.mockRejectedValueOnce(new Error('down'))
    await expect(invalidatePattern('a:*')).resolves.toBeUndefined()
  })

  it('stops at the key cap', async () => {
    const page = Array.from({ length: 200 }, (_, i) => `a:${i}`)
    mockedRedis.scan.mockResolvedValue(['1', page])
    await invalidatePattern('a:*')
    // 25 pages x 200 keys = the 5,000-key cap; the cursor is then abandoned.
    expect(mockedRedis.scan).toHaveBeenCalledTimes(25)
    expect(mockedRedis.del).toHaveBeenCalledTimes(25)
    mockedRedis.scan.mockReset()
  })
})

describe('invalidateMapCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('drops the fixed public-map keys by name, then sweeps both namespaces', async () => {
    mockedRedis.scan.mockResolvedValue(['0', []])
    await invalidateMapCache()
    expect(mockedRedis.del).toHaveBeenCalledWith('map:sitemap', 'map:options', 'map:hechsherim')
    expect(Object.values(MAP_CACHE_KEYS).sort()).toEqual(['map:hechsherim', 'map:options', 'map:sitemap'])
    const patterns = mockedRedis.scan.mock.calls.map(call => call[2])
    expect(patterns.sort()).toEqual(['map:*', 'restaurants:*'])
    mockedRedis.scan.mockReset()
  })
})
