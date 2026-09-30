import request from 'supertest'
import { createApp } from '../app'
import { env } from '../config/env'
import { mapRepo } from '../db/map.repo'

jest.mock('../lib/prisma')
jest.mock('../db/map.repo')
// Redis unreachable: every command fails, so each request reads the repo mock.
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockMap = mapRepo as jest.Mocked<typeof mapRepo>
const app = createApp()

// Pinned: a developer's .env points MAP_PUBLIC_URL at a local map.
let publicUrl: jest.ReplaceProperty<string>
beforeEach(() => { publicUrl = jest.replaceProperty(env, 'MAP_PUBLIC_URL', 'https://mykoshermap.com') })
afterEach(() => { publicUrl.restore() })

describe('GET /api/map/sitemap.xml', () => {
  it('serves XML with the home page and one URL per establishment', async () => {
    mockMap.findSitemapEntries.mockResolvedValue([
      { id: 'r_abc', updatedAt: new Date('2026-07-01T00:00:00Z') },
      { id: 'r_def', updatedAt: new Date('2026-06-15T00:00:00Z') },
    ])

    const res = await request(app).get('/api/map/sitemap.xml')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('xml')
    expect(res.text).toContain('<loc>https://mykoshermap.com/</loc>')
    expect(res.text).toContain('<loc>https://mykoshermap.com/r/r_abc</loc>')
    expect(res.text).toContain('<loc>https://mykoshermap.com/r/r_def</loc>')
    expect(res.text).toContain('<lastmod>2026-07-01</lastmod>')
  })

  // One setting for the map's public address: the verification mails and the
  // crawlable URLs (sitemap, prerender canonical) must agree.
  it('builds its URLs from MAP_PUBLIC_URL', async () => {
    publicUrl.replaceValue('https://staging.example.org')
    mockMap.findSitemapEntries.mockResolvedValue([{ id: 'r_abc', updatedAt: new Date('2026-07-01T00:00:00Z') }])

    const res = await request(app).get('/api/map/sitemap.xml')

    expect(res.text).toContain('<loc>https://staging.example.org/r/r_abc</loc>')
    expect(res.text).not.toContain('mykoshermap.com')
  })
})

const sampleRow = (over: Record<string, unknown> = {}) => ({
  id: 'r_abc', name: 'Pizza Test', address: 'Herzl 1', city: 'Netanya',
  lat: 32.3, lng: 34.85, foodType: 'dairy', category: null,
  kashrutLevel: 'badatz', hechsher: 'Badatz X', phone: undefined, hours: undefined,
  geoAccuracy: 'exact', ...over,
}) as never

describe('GET /api/map/prerender/:id', () => {
  it('renders per-place HTML with title, canonical and Restaurant JSON-LD', async () => {
    mockMap.findById.mockResolvedValue(sampleRow())
    const res = await request(app).get('/api/map/prerender/r_abc')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.text).toContain('<title>Pizza Test — Netanya | KashrutMap</title>')
    expect(res.text).toContain('<link rel="canonical" href="https://mykoshermap.com/r/r_abc">')
    expect(res.text).toContain('"@type":"Restaurant"')
    expect(res.text).toContain('"latitude":32.3')   // exact → geo advertised
  })

  it('omits geo coordinates when the location is only approximate', async () => {
    mockMap.findById.mockResolvedValue(sampleRow({ geoAccuracy: 'approximate' }))
    const res = await request(app).get('/api/map/prerender/r_abc')
    expect(res.status).toBe(200)
    expect(res.text).not.toContain('GeoCoordinates')
  })

  it('404s (noindex, not publicly cacheable) for a missing or hidden establishment', async () => {
    mockMap.findById.mockResolvedValue(null)
    const res = await request(app).get('/api/map/prerender/nope')
    expect(res.status).toBe(404)
    expect(res.text).toContain('noindex')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(mockMap.findById).toHaveBeenCalledWith('nope')
  })

  it('404s an id no establishment can have without querying', async () => {
    const res = await request(app).get('/api/map/prerender/%3Cscript%3E')
    expect(res.status).toBe(404)
    expect(res.text).toContain('noindex')
    expect(mockMap.findById).not.toHaveBeenCalled()
  })

  it('still serves from the database while Redis is unreachable', async () => {
    mockMap.findById.mockResolvedValue(sampleRow())
    await request(app).get('/api/map/prerender/r_abc').expect(200)
    await request(app).get('/api/map/prerender/r_abc').expect(200)
    // No generation to trust, so nothing is cached: every request reads the DB.
    expect(mockMap.findById).toHaveBeenCalledTimes(2)
  })
})
