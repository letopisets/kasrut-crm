import request from 'supertest'
import { createApp } from '../app'

// pino-http used to number requests itself (req-1, req-2, …), so a console
// warning could not be matched to its service_logs row or to the
// x-request-id the client saw. It now reuses serviceLogger's id.
jest.mock('../lib/logger', () => {
  const pino = jest.requireActual('pino')
  const lines: string[] = []
  return { logger: pino({ level: 'info' }, { write: (line: string) => { lines.push(line) } }), lines }
})
jest.mock('../lib/prisma')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../db/serviceLogs.repo', () => ({
  serviceLogsRepo: { create: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))

const { lines } = jest.requireMock<{ lines: string[] }>('../lib/logger')
const app = createApp()

function loggedRequestIds(): unknown[] {
  return lines
    .map(line => JSON.parse(line) as { req?: { id?: unknown }; res?: { statusCode?: number } })
    .filter(entry => entry.res?.statusCode === 404)
    .map(entry => entry.req?.id)
}

beforeEach(() => { lines.length = 0 })

describe('pino-http request id', () => {
  it('logs the client-supplied x-request-id that serviceLogger accepted', async () => {
    const res = await request(app).get('/api/no-such-route').set('x-request-id', 'trace-abc-12345')

    expect(res.status).toBe(404)
    expect(res.headers['x-request-id']).toBe('trace-abc-12345')
    expect(loggedRequestIds()).toEqual(['trace-abc-12345'])
  })

  it('logs the id serviceLogger generated when the header is missing or malformed', async () => {
    const res = await request(app).get('/api/no-such-route').set('x-request-id', '<bad id>')

    expect(res.headers['x-request-id']).not.toBe('<bad id>')
    expect(loggedRequestIds()).toEqual([res.headers['x-request-id']])
  })
})

// express.json used to run before pino-http, so a body it rejected went
// straight to errorHandler and never reached the console: the client saw an
// x-request-id that no log line carried.
describe('pino-http and body-parser rejections', () => {
  it.each([
    ['malformed JSON', '{bad json', 400],
    ['an oversized body', JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024 + 1) }), 413],
  ])('logs a request refused for %s under its request id', async (_label, body, status) => {
    const res = await request(app)
      .post('/api/map-auth/login')
      .set('Content-Type', 'application/json')
      .set('x-request-id', 'e2e-badjson-1')
      .send(body)

    expect(res.status).toBe(status)
    expect(res.headers['x-request-id']).toBe('e2e-badjson-1')
    const entries = lines.map(line => JSON.parse(line) as { level?: number; req?: { id?: unknown }; res?: { statusCode?: number } })
    expect(entries).toContainEqual(expect.objectContaining({
      level: 40,
      req: expect.objectContaining({ id: 'e2e-badjson-1' }),
      res: { statusCode: status },
    }))
  })
})
