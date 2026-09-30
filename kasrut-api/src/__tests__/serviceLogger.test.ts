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

describe('serviceLogger x-request-id', () => {
  const app = buildApp()
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(undefined)
  })

  async function storedRequestId(header?: string): Promise<{ echoed: string; stored: unknown }> {
    const req = request(app).post('/api/users').send({ name: 'New User' })
    const res = await (header === undefined ? req : req.set('x-request-id', header))
    await flushServiceLog()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    return { echoed: res.headers['x-request-id'], stored: mockCreate.mock.calls[0][0].requestId }
  }

  it.each([
    '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e',
    '01HZX3K7Q9M2V5N8P4R6T0W1Y3',
    'trace.abc_123:span-9',
    'a'.repeat(8),
    'Z'.repeat(64),
  ])('keeps a well-formed client id %s', async (id) => {
    const { echoed, stored } = await storedRequestId(id)
    expect(echoed).toBe(id)
    expect(stored).toBe(id)
  })

  it.each([
    ['too short', 'abc1234'],
    ['too long', 'a'.repeat(65)],
    ['markup', '<script>alert(1)</script>'],
    ['spaces', 'request id 12345'],
    ['a repeated header joined by Node', 'aaaaaaaa, bbbbbbbb'],
    ['path characters', '../../etc/passwd'],
    ['non-ASCII', 'requête-12345678'],
    ['empty', ''],
  ])('replaces a malformed client id (%s) with a UUID', async (_label, id) => {
    const { echoed, stored } = await storedRequestId(id)
    expect(echoed).toMatch(UUID_RE)
    expect(echoed).not.toBe(id)
    expect(stored).toBe(echoed)
  })

  it('generates a UUID when no id is supplied', async () => {
    const { echoed, stored } = await storedRequestId()
    expect(echoed).toMatch(UUID_RE)
    expect(stored).toBe(echoed)
  })

  it('echoes the effective id on requests that are not logged', async () => {
    const res = await request(app).get('/api/restaurants').set('x-request-id', 'bad id')
    expect(res.headers['x-request-id']).toMatch(UUID_RE)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('serviceLogger behind mounted routers', () => {
  // The real app mounts every route two routers deep (/api, then /map etc.).
  // A handler that ends the response itself leaves req.path router-relative.
  function buildRoutedApp() {
    const app = express()
    app.use(express.json())
    app.use(serviceLogger)

    const map = express.Router()
    map.delete('/reviews/:id', (req, res) => {
      req.user = crmUser
      res.locals.serviceLogMessage = `Deleted map review ${req.params.id}`
      res.status(204).end()
    })
    map.get('/reviews', (req, res) => {
      req.user = crmUser
      res.status(403).json({ error: 'Forbidden' })
    })
    map.post('/restaurants/:restaurantId/reviews', (req, res) => {
      req.user = crmUser
      res.status(201).json({ id: 'rv9' })
    })
    const auth = express.Router()
    auth.post('/login', (_req, res) => { res.status(401).json({ error: 'Invalid credentials' }) })
    // Stands in for the rate limiter answering before the handler runs.
    const mapAuth = express.Router()
    mapAuth.post('/login', (_req, res) => { res.status(429).json({ error: 'Too many requests' }) })

    const api = express.Router()
    api.use('/map', map)
    api.use('/auth', auth)
    api.use('/map-auth', mapAuth)
    app.use('/api', api)
    return app
  }

  const app = buildRoutedApp()

  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(undefined)
  })

  it('stores a mutation answered inside a nested router under its full path', async () => {
    await request(app).delete('/api/map/reviews/rv1')
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      service: 'Map',
      action: 'DELETE /api/map/reviews/rv1',
      path: '/api/map/reviews/rv1',
      message: 'Deleted map review rv1',
      entityType: 'map_reviews',
      entityId: 'rv1',
      statusCode: 204,
    }))
  })

  it('stores a refusal sent by a nested route handler', async () => {
    await request(app).get('/api/map/reviews')
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      action: 'GET /api/map/reviews',
      message: 'GET /api/map/reviews returned 403',
      statusCode: 403,
    }))
  })

  it('recognises auth actions behind a router', async () => {
    await request(app).post('/api/auth/login').send({ email: 'someone@test.il', password: 'x' })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      service: 'Auth',
      action: 'POST /api/auth/login',
      userEmail: 'someone@test.il',
      userRole: 'auth_attempt',
      statusCode: 401,
    }))
  })

  // Express routes case-insensitively and ignores a trailing slash, so the
  // logger must classify those spellings exactly like the canonical path.
  it.each([
    '/API/map/reviews/rv1',
    '/Api/Map/Reviews/rv1',
    '/api/map/reviews/rv1/',
  ])('stores a mutation requested as %s under the path as sent', async (url) => {
    await request(app).delete(url)
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      service: 'Map',
      action: `DELETE ${url}`,
      path: url,
      message: 'Deleted map review rv1',
      entityType: 'map_reviews',
      entityId: 'rv1',
      statusCode: 204,
    }))
  })

  it.each(['/API/AUTH/LOGIN', '/api/auth/login/'])('recognises a failed login requested as %s', async (url) => {
    await request(app).post(url).send({ email: 'Someone@Test.il', password: 'x' })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      service: 'Auth',
      userEmail: 'someone@test.il',
      userRole: 'auth_attempt',
      entityType: 'auth',
      entityId: 'login',
      statusCode: 401,
    }))
  })

  it('keys public review writes by restaurant under their own entity type', async () => {
    await request(app).post('/api/map/restaurants/r1/reviews').send({ rating: 5 })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'map_restaurant_reviews',
      entityId: 'r1',
      statusCode: 201,
    }))
  })

  it('clips client-controlled values before storing them', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('x-request-id', 'r'.repeat(5000))
      .send({ email: `${'a'.repeat(100_000)}@test.il`, password: 'x' })
    await flushServiceLog()

    const row = mockCreate.mock.calls[0][0]
    expect(row.userEmail).toHaveLength(254)
    // An oversized x-request-id is not clipped but replaced (resolveRequestId).
    expect(row.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('stores a rate-limited auth attempt without reading its body', async () => {
    await request(app).post('/api/map-auth/login').send({ email: 'victim@test.il', password: 'x' })
    await flushServiceLog()

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const row = mockCreate.mock.calls[0][0]
    expect(row).toMatchObject({ level: 'warn', service: 'Map', path: '/api/map-auth/login', statusCode: 429 })
    expect(row.userEmail).toBeUndefined()
  })
})
