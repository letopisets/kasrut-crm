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
