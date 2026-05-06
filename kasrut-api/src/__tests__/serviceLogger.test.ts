import express from 'express'
import request from 'supertest'
import { serviceLogger } from '../middleware/serviceLogger'
import { serviceLogsRepo } from '../db/serviceLogs.repo'

jest.mock('../db/serviceLogs.repo', () => ({
  serviceLogsRepo: {
    create: jest.fn(),
  },
}))

const mockCreate = serviceLogsRepo.create as jest.MockedFunction<typeof serviceLogsRepo.create>

const crmUser = {
  sub: 'u1',
  email: 'owner@test.il',
  role: 'owner' as const,
  name: 'Owner',
  iat: 1,
  exp: 9999999999,
}

function flushServiceLog(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(serviceLogger)

  app.get('/api/restaurants', (req, res) => {
    req.user = crmUser
    res.json({ ok: true })
  })

  app.post('/api/users', (req, res) => {
    req.user = crmUser
    res.status(201).json({ id: 'u2' })
  })

  app.get('/api/public-error', (_req, res) => {
    res.status(503).json({ error: 'service unavailable' })
  })

  app.get('/api/logs', (_req, res) => {
    res.status(500).json({ error: 'recursive failure' })
  })

  app.post('/api/auth/login', (_req, res) => {
    res.status(401).json({ error: 'Invalid credentials' })
  })

  return app
}

describe('serviceLogger platform filtering', () => {
  const app = buildApp()

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(undefined)
  })

  it('does not store successful read-only requests', async () => {
    await request(app).get('/api/restaurants')
    await flushServiceLog()

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stores successful authenticated platform mutations', async () => {
    await request(app)
      .post('/api/users')
      .send({ name: 'New User' })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      service: 'API',
      action: 'POST /api/users',
      message: 'Created users',
      userId: 'u1',
      userEmail: 'owner@test.il',
      userRole: 'owner',
      entityType: 'users',
      statusCode: 201,
    }))
  })

  it('stores platform availability errors even without an actor', async () => {
    await request(app).get('/api/public-error')
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      service: 'API',
      action: 'GET /api/public-error',
      statusCode: 503,
    }))
  })

  it('does not recursively store log endpoint failures', async () => {
    await request(app).get('/api/logs')
    await flushServiceLog()

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('stores auth failures with the attempted user email', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'OWNER@TEST.IL', password: 'wrong' })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      service: 'Auth',
      action: 'POST /api/auth/login',
      userEmail: 'owner@test.il',
      userRole: 'auth_attempt',
      entityType: 'auth',
      entityId: 'login',
      statusCode: 401,
    }))
  })
})
