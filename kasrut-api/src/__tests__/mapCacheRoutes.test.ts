import request from 'supertest'
import { createApp } from '../app'
import { mapRepo } from '../db/map.repo'
import { invalidateMapCache } from '../lib/mapCache'
import { redis } from '../lib/redis'

// Public map reads against an in-memory Redis: which keys they mint, what they
// never cache, and that one invalidation reaches every entry however many a
// scraper has created.
jest.mock('../lib/prisma')
jest.mock('../db/map.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))
jest.mock('../lib/redis', () => {
  const store = new Map<string, string>()
  const write = (key: string, value: string) => { store.set(key, value) }
  return {
    __store: store,
    __write: write,
    __reset: () => { store.clear() },
    redis: {
      status: 'end', // the rate limiter falls back to its in-memory buckets
      get:    jest.fn(async (key: string) => store.get(key) ?? null),
      set:    jest.fn(async (key: string, value: string, mode?: string) => {
        if (mode === 'NX' && store.has(key)) return null
        write(key, value)
        return 'OK'
      }),
      setex:  jest.fn(async (key: string, _ttl: number, value: string) => { write(key, value); return 'OK' }),
      incr:   jest.fn(async (key: string) => {
        const next = Number(store.get(key) ?? 0) + 1
        write(key, String(next))
        return next
      }),
      eval:   jest.fn(async (_script: string, _keys: number, key: string, expected: string, next: string) => {
        if (store.get(key) !== expected) return 0
        write(key, next)
        return 1
      }),
      del:    jest.fn(async (...keys: string[]) => keys.filter(k => store.delete(k)).length),
      // No cache namespace is swept any more; any call is a regression.
      scan:   jest.fn(async () => ['0', []]),
    },
  }
})

const redisFake = jest.requireMock('../lib/redis') as {
  __store: Map<string, string>
  __write: (key: string, value: string) => void
  __reset: () => void
}
const store = redisFake.__store
const mockedRedis = redis as unknown as Record<'get' | 'setex' | 'scan', jest.Mock>
const mockMap = mapRepo as jest.Mocked<typeof mapRepo>
const app = createApp()

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r_abc', name: 'Pizza Test', address: 'Herzl 1', city: 'Netanya',
  lat: 32.3, lng: 34.85, foodType: 'dairy', category: null,
  kashrutLevel: 'badatz', hechsher: 'Badatz X', phone: undefined, hours: undefined,
  hoursJson: null, geoAccuracy: 'exact', ...over,
}) as never

const cachedKeys = (pattern: RegExp) => [...store.keys()].filter(k => pattern.test(k))

beforeEach(() => {
  redisFake.__reset()
})

describe('public by-id reads', () => {
  const badIds = [
    'a'.repeat(65),
    'r1%20x',
    "r1'%3B--",
    'r1:*',
    'a%2Fb',
    'r1.json',
    '%E2%98%83',
  ]

  it.each(badIds)('404s id %s before touching the cache or the database', async id => {
    const json = await request(app).get(`/api/map/restaurants/${id}`)
    const html = await request(app).get(`/api/map/prerender/${id}`)

    // The routes matched (their rate limiter ran): these are the handlers' 404s.
    expect(json.status).toBe(404)
    expect(json.headers['ratelimit-limit']).toBeDefined()
    expect(json.body).toEqual({ error: 'Not found' })
    expect(html.status).toBe(404)
    expect(html.text).toContain('noindex')
    expect(html.headers['cache-control']).toBe('no-store')
    expect(mockMap.findById).not.toHaveBeenCalled()
    expect(mockedRedis.get).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
  })

  it('accepts every id shape the data has', async () => {
    mockMap.findById.mockResolvedValue(null)
    for (const id of ['r1', 'r_0123456789abcd', 'r_mach_0123456789ab', 'cmf3k2x9a0000abcdxyz12345', 'a'.repeat(64)]) {
      await request(app).get(`/api/map/restaurants/${id}`).expect(404)
      expect(mockMap.findById).toHaveBeenLastCalledWith(id)
    }
  })

  it('never caches a miss', async () => {
    mockMap.findById.mockResolvedValue(null)

    await request(app).get('/api/map/restaurants/r_missing').expect(404)
    await request(app).get('/api/map/prerender/r_missing').expect(404)

    expect(mockMap.findById).toHaveBeenCalledTimes(2)
    expect(mockedRedis.setex).not.toHaveBeenCalled()
    expect(cachedKeys(/restaurant/)).toEqual([])
  })

  it('caches a found row once, under the current generation, for JSON and prerender alike', async () => {
    mockMap.findById.mockResolvedValue(row())

    const json = await request(app).get('/api/map/restaurants/r_abc')
    const html = await request(app).get('/api/map/prerender/r_abc')

    expect(json.status).toBe(200)
    expect(json.body.name).toBe('Pizza Test')
    expect(html.status).toBe(200)
    expect(html.text).toContain('<title>Pizza Test — Netanya | KashrutMap</title>')
    expect(mockMap.findById).toHaveBeenCalledTimes(1)
    expect(cachedKeys(/restaurant:/)).toEqual([expect.stringMatching(/^map:v\d+:restaurant:r_abc$/)])
  })
})

describe('map cache invalidation', () => {
  // 6,000 is past the 5,000 keys at which a capped SCAN sweep of the namespace
  // gives up; 100 is a control such a sweep still gets through.
  it.each([100, 6_000])('reaches a place cached after %i junk entries', async junk => {
    // A scraper minted list entries (distinct viewports) before anyone opened
    // the place, so a sweep in key order meets all of them first. Each is
    // written in both the versioned and the old unversioned layout.
    const generation = '1790000000000'
    redisFake.__write('map:gen', generation)
    for (let i = 0; i < junk; i++) {
      redisFake.__write(`map:v${generation}:restaurants:junk${i}`, '{}')
      redisFake.__write(`map:restaurants:junk${i}`, '{}')
    }
    mockMap.findById.mockResolvedValue(row())
    await request(app).get('/api/map/restaurants/r_abc').expect(200)
    await request(app).get('/api/map/restaurants/r_abc').expect(200)
    expect(mockMap.findById).toHaveBeenCalledTimes(1)

    // The CRM withdraws the place.
    mockMap.findById.mockResolvedValue(null)
    await invalidateMapCache()

    await request(app).get('/api/map/restaurants/r_abc').expect(404)
    await request(app).get('/api/map/prerender/r_abc').expect(404)
  })

  it('invalidates by bumping generations, without sweeping any namespace', async () => {
    mockMap.findById.mockResolvedValue(row())
    await request(app).get('/api/map/restaurants/r_abc').expect(200)
    const generation = Number(store.get('map:gen'))
    redisFake.__write('restaurants:gen', '1790000000000')

    await invalidateMapCache()

    expect(Number(store.get('map:gen'))).toBe(generation + 1)
    // The CRM restaurant lists hold the same rows.
    expect(store.get('restaurants:gen')).toBe('1790000000001')
    expect(mockedRedis.scan).not.toHaveBeenCalled()
  })

  it('drops cached list pages and the sitemap', async () => {
    mockMap.findForMap.mockResolvedValue({ restaurants: [row()], total: 1, limit: 750, limited: false })
    mockMap.findSitemapEntries.mockResolvedValue([{ id: 'r_abc', updatedAt: new Date('2026-07-01T00:00:00Z') }])

    await request(app).get('/api/map/restaurants?city=Netanya').expect(200)
    await request(app).get('/api/map/restaurants?city=Netanya').expect(200)
    await request(app).get('/api/map/sitemap.xml').expect(200)
    await request(app).get('/api/map/sitemap.xml').expect(200)
    expect(mockMap.findForMap).toHaveBeenCalledTimes(1)
    expect(mockMap.findSitemapEntries).toHaveBeenCalledTimes(1)
    expect(cachedKeys(/^map:v\d+:(restaurants:[0-9a-f]{16}|sitemap)$/)).toHaveLength(2)

    mockMap.findForMap.mockResolvedValue({ restaurants: [], total: 0, limit: 750, limited: false })
    mockMap.findSitemapEntries.mockResolvedValue([])
    await invalidateMapCache()

    const list = await request(app).get('/api/map/restaurants?city=Netanya').expect(200)
    const sitemap = await request(app).get('/api/map/sitemap.xml').expect(200)
    expect(list.body.restaurants).toEqual([])
    expect(sitemap.text).not.toContain('/r/r_abc')
    expect(mockMap.findForMap).toHaveBeenCalledTimes(2)
    expect(mockMap.findSitemapEntries).toHaveBeenCalledTimes(2)
  })
})
