import request from 'supertest'
import { createApp } from '../app'

jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))

const app = createApp()

describe('OpenAPI spec', () => {
  it('serves /api/openapi.json with valid OpenAPI 3 spec', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toMatch(/^3\./)
    expect(res.body.info.title).toBe('KashrutCRM API')
  })

  it('uses the production API as the primary Swagger server', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.body.servers[0]).toMatchObject({
      url: 'https://api.mykoshermap.com/api',
      description: 'Production',
    })
  })

  it('documents the /restaurants endpoint with pagination params', async () => {
    const res = await request(app).get('/api/openapi.json')
    const params = res.body.paths['/restaurants'].get.parameters.map((p: { name: string }) => p.name)
    expect(params).toContain('limit')
    expect(params).toContain('cursor')
  })

  it('documents the /inspections endpoint with pagination params', async () => {
    const res = await request(app).get('/api/openapi.json')
    const params = res.body.paths['/inspections'].get.parameters.map((p: { name: string }) => p.name)
    expect(params).toContain('limit')
    expect(params).toContain('cursor')
  })

  it('declares bearerAuth security scheme', async () => {
    const res = await request(app).get('/api/openapi.json')
    expect(res.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer')
  })

  it('serves Swagger UI at /api/docs', async () => {
    const res = await request(app).get('/api/docs/').redirects(1)
    expect([200, 301, 302]).toContain(res.status)
  })
})
