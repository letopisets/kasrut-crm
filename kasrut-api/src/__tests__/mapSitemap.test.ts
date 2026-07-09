import request from 'supertest'
import { createApp } from '../app'
import { mapRepo } from '../db/map.repo'

jest.mock('../lib/prisma')
jest.mock('../db/map.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockMap = mapRepo as jest.Mocked<typeof mapRepo>
const app = createApp()

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
})
