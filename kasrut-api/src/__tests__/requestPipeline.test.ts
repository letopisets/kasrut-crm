import request from 'supertest'
import { createApp } from '../app'
import { serviceLogsRepo } from '../db/serviceLogs.repo'
import { logger } from '../lib/logger'

// Responses produced before routing (CORS preflights, body-parser rejections)
// used to skip serviceLogger, so they had no x-request-id, and a malformed or
// oversized body fell through errorHandler as a 500 + error-level log.
jest.mock('../lib/prisma')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../db/serviceLogs.repo', () => ({
  serviceLogsRepo: { create: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))

const mockCreate = serviceLogsRepo.create as jest.MockedFunction<typeof serviceLogsRepo.create>
const app = createApp()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const flushServiceLog = () => new Promise<void>(resolve => setImmediate(resolve))

let errorSpy: jest.SpyInstance
beforeEach(() => {
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
})
afterEach(() => errorSpy.mockRestore())

describe('body-parser rejections', () => {
  it('answers 400 for malformed JSON, with a request id and no error log', async () => {
    const res = await request(app)
      .post('/api/kashrut-levels')
      .set('Content-Type', 'application/json')
      .send('{"name": ')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid request body' })
    expect(res.headers['x-request-id']).toMatch(UUID_RE)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('does not echo the parser message', async () => {
    const res = await request(app)
      .post('/api/kashrut-levels')
      .set('Content-Type', 'application/json')
      .send('{"name": tru}')

    expect(JSON.stringify(res.body)).not.toMatch(/Unexpected|token|position/i)
  })

  it('answers 413 for a body over the 2 MB limit, with a request id', async () => {
    const res = await request(app)
      .post('/api/map/suggestions')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ note: 'a'.repeat(3 * 1024 * 1024) }))

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: 'Request body too large' })
    expect(res.headers['x-request-id']).toMatch(UUID_RE)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('answers 415 for an unsupported charset', async () => {
    const res = await request(app)
      .post('/api/kashrut-levels')
      .set('Content-Type', 'application/json; charset=koi8-r')
      .send('{}')

    expect(res.status).toBe(415)
    expect(res.body).toEqual({ error: 'Invalid request body' })
  })

  it('records a rejected auth attempt under the effective request id', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'trace-12345678')
      .send('{"email":')
    await flushServiceLog()

    expect(res.status).toBe(400)
    expect(res.headers['x-request-id']).toBe('trace-12345678')
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      path: '/api/auth/login',
      statusCode: 400,
      requestId: 'trace-12345678',
      message: 'Request body rejected (entity.parse.failed) on POST /api/auth/login',
    }))
  })
})

describe('responses from middleware ahead of the routes', () => {
  it('a CORS preflight carries a request id and is not audited', async () => {
    const res = await request(app)
      .options('/api/restaurants')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
    await flushServiceLog()

    expect(res.status).toBe(204)
    expect(res.headers['x-request-id']).toMatch(UUID_RE)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('an unknown route still gets a request id', async () => {
    const res = await request(app).get('/nope').set('x-request-id', '<bad>')
    expect(res.status).toBe(404)
    expect(res.headers['x-request-id']).toMatch(UUID_RE)
  })
})
