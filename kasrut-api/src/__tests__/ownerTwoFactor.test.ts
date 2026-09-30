import express, { type RequestHandler } from 'express'
import request from 'supertest'
import { createApp } from '../app'
import { env } from '../config/env'
import routes from '../routes'
import { usersRepo } from '../db/users.repo'
import { mashgichimRepo } from '../db/mashgichim.repo'
import { authenticateJWT, TWO_FACTOR_SETUP_ALLOWLIST } from '../middleware/auth'
import { serviceLogger } from '../middleware/serviceLogger'
import { signCrmAccessToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { resetLoginThrottleMemory } from '../lib/loginThrottle'
import { serviceLogsRepo } from '../db/serviceLogs.repo'
import type { User } from '../models/types'

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/twoFactorAttempts')
jest.mock('../lib/twoFactorChallenges')
jest.mock('../lib/tokenBlacklist')
jest.mock('../db/serviceLogs.repo', () => ({ serviceLogsRepo: { create: jest.fn() } }))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockUsers = usersRepo as jest.Mocked<typeof usersRepo>
const mockMashgichim = mashgichimRepo as jest.Mocked<typeof mashgichimRepo>
const mockServiceLog = jest.mocked(serviceLogsRepo.create)

const SETUP_REQUIRED = { error: 'Two-factor authentication setup required', code: 'TWO_FACTOR_SETUP_REQUIRED' }

const owner: User = {
  id: 'u1', name: 'Owner', email: 'owner@test.il', passwordHash: 'hash',
  role: 'owner', twoFactorEnabled: false, twoFactorBackupCodes: [],
}
const ownerWith2fa: User = { ...owner, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
const rabbanut: User = { ...owner, role: 'rabbanut', rabbanutId: 'rb1' }
const mashgiach: User = { ...owner, role: 'mashgiach', rabbanutId: 'rb1', mashgiachId: 'm1' }

function tokenFor(user: User): string {
  return signCrmAccessToken({
    sub: user.id, role: user.role, name: user.name, email: user.email,
    ver: user.sessionVersion ?? 0,
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
    ...(user.mashgiachId ? { mashgiachId: user.mashgiachId } : {}),
  })
}

// A fresh address per request keeps the per-IP limiters out of the way.
let ipSeq = 0
const nextIp = () => `203.0.113.${(ipSeq++ % 250) + 1}`

function call(method: string, path: string, user: User) {
  mockUsers.findAuthById.mockResolvedValue(user)
  const agent = request(app) as unknown as Record<string, (url: string) => request.Test>
  return agent[method.toLowerCase()](path)
    .set('X-Forwarded-For', nextIp())
    .set('Authorization', `Bearer ${tokenFor(user)}`)
}

function login(user: User) {
  mockUsers.findAuthByEmail.mockResolvedValue(user)
  return request(app).post('/api/auth/login').set('X-Forwarded-For', nextIp())
    .send({ email: user.email, password: 'password' })
}

// ── Route table ────────────────────────────────────────────────────────────
// Walks the mounted routers (Express 4 internals) so a route added later is
// checked too, without keeping a list of it here.
interface Layer {
  regexp: RegExp
  handle: RequestHandler & { stack?: Layer[] }
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RequestHandler }> }
}
interface ApiRoute { method: string; path: string; crmJwt: boolean }

// '/auth' is mounted as /^\/auth\/?(?=\/|$)/i.
function mountPath(layer: Layer): string {
  const path = layer.regexp.source.replace(/^\^/, '').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/')
  if (!/^(\/[a-z0-9-]+)+$/.test(path)) throw new Error(`Unexpected mount pattern: ${layer.regexp}`)
  return path
}

function collectRoutes(stack: Layer[], prefix: string): ApiRoute[] {
  const found: ApiRoute[] = []
  let routerJwt = false
  for (const layer of stack) {
    if (layer.route) {
      const crmJwt = routerJwt || layer.route.stack.some(step => step.handle === authenticateJWT)
      for (const method of Object.keys(layer.route.methods).filter(m => m !== '_all')) {
        found.push({ method: method.toUpperCase(), path: prefix + layer.route.path, crmJwt })
      }
    } else if (layer.handle.stack) {
      found.push(...collectRoutes(layer.handle.stack, prefix + mountPath(layer)))
    } else if (layer.handle === authenticateJWT) {
      routerJwt = true
    }
  }
  return found
}

const API_ROUTES = collectRoutes((routes as unknown as { stack: Layer[] }).stack, '/api')
const key = (route: ApiRoute) => `${route.method} ${route.path}`

// CRM routes that are reachable without a session: the login steps.
const PUBLIC_AUTH_ROUTES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/2fa/verify',
  'POST /api/auth/2fa/verify-backup',
])
const isMapRoute = (path: string) => path === '/api/map' || path.startsWith('/api/map/') || path.startsWith('/api/map-auth/')

const app = createApp()

// Pinned per block, so a local .env cannot change what a test means.
function withOwnerPolicy(on: boolean) {
  let policy: jest.ReplaceProperty<boolean>
  beforeEach(() => { policy = jest.replaceProperty(env, 'REQUIRE_OWNER_2FA', on) })
  afterEach(() => { policy.restore() })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetLoginThrottleMemory()
  jest.mocked(isTokenBlacklisted).mockResolvedValue(false)
  mockUsers.verifyPassword.mockResolvedValue(true)
  mockUsers.revokeSessions.mockResolvedValue(true)
  mockMashgichim.findAll.mockResolvedValue([])
  mockServiceLog.mockResolvedValue(undefined)
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('CRM route table', () => {
  it('finds the mounted routes', () => {
    expect(API_ROUTES.length).toBeGreaterThan(50)
    expect(API_ROUTES.map(key)).toEqual(expect.arrayContaining([
      'GET /api/auth/me', 'GET /api/dashboard/summary', 'GET /api/logs/', 'GET /api/map/restaurants',
    ]))
  })

  it('puts every CRM route outside the login steps behind authenticateJWT', () => {
    const unauthenticated = API_ROUTES
      .filter(route => !route.crmJwt && !isMapRoute(route.path) && !PUBLIC_AUTH_ROUTES.has(key(route)))
      .map(key)
    expect(unauthenticated).toEqual([])
  })

  it('puts the CRM moderation of map suggestions behind authenticateJWT', () => {
    const moderation = API_ROUTES.filter(route => route.path.startsWith('/api/map/suggestions') && route.crmJwt)
    expect(moderation.map(key).sort()).toEqual([
      'GET /api/map/suggestions',
      'POST /api/map/suggestions/:id/review',
    ])
  })

  // Pinned on purpose: widening the allowlist must fail this test.
  it('allowlists exactly the session, sign-out and setup calls', () => {
    expect([...TWO_FACTOR_SETUP_ALLOWLIST].sort()).toEqual([
      'GET /api/auth/me',
      'POST /api/auth/2fa/enable',
      'POST /api/auth/2fa/setup',
      'POST /api/auth/logout',
    ])
  })

  it('allowlists only real authenticated routes', () => {
    const authenticated = new Set(API_ROUTES.filter(route => route.crmJwt).map(key))
    for (const entry of TWO_FACTOR_SETUP_ALLOWLIST) expect(authenticated).toContain(entry)
  })
})

describe('owner without 2FA while REQUIRE_OWNER_2FA is on', () => {
  withOwnerPolicy(true)
  const gated = API_ROUTES.filter(route => route.crmJwt && !TWO_FACTOR_SETUP_ALLOWLIST.has(key(route)))

  it.each(gated.map(route => [route.method, route.path]))('refuses %s %s', async (method, path) => {
    const res = await call(method, path.replace(/:\w+/g, 'x'), owner)

    expect(res.status).toBe(403)
    expect(res.body).toEqual(SETUP_REQUIRED)
  })

  it.each([
    ['POST', '/api/auth/2fa/disable'],
    ['GET', '/api/users'],
    ['GET', '/api/logs'],
    ['GET', '/api/dashboard/summary'],
    ['GET', '/api/map/suggestions'],
  ])('refuses the sensitive route %s %s', async (method, path) => {
    const res = await call(method, path, owner)

    expect(res.status).toBe(403)
    expect(res.body).toEqual(SETUP_REQUIRED)
  })

  it('names the account for the service log when it refuses a call', async () => {
    // Mounted at the app level, where serviceLogger sees the full path.
    const audited = express()
    audited.use(serviceLogger)
    audited.get('/api/users', authenticateJWT, (_req, res) => { res.json([]) })
    mockUsers.findAuthById.mockResolvedValue(owner)

    const res = await request(audited).get('/api/users')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
    await new Promise(resolve => setImmediate(resolve))

    expect(res.status).toBe(403)
    expect(mockServiceLog).toHaveBeenCalledWith(expect.objectContaining({
      level:      'warn',
      path:       '/api/users',
      statusCode: 403,
      userId:     'u1',
      userEmail:  'owner@test.il',
      userRole:   'owner',
      message:    'Blocked: 2FA setup required',
    }))
  })

  it('refuses before any handler touches data', async () => {
    const res = await call('GET', '/api/mashgichim', owner)

    expect(res.status).toBe(403)
    expect(mockMashgichim.findAll).not.toHaveBeenCalled()
  })

  it('matches the path without its query string', async () => {
    expect((await call('GET', '/api/auth/me?next=/api/users', owner)).status).toBe(200)
    expect((await call('GET', '/api/mashgichim?next=/api/auth/me', owner)).body).toEqual(SETUP_REQUIRED)
  })

  it('reports setup as required from /auth/me', async () => {
    const res = await call('GET', '/api/auth/me', owner)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: 'u1', role: 'owner', twoFactorEnabled: false, twoFactorSetupRequired: true })
  })

  it('still signs in, and says setup is required', async () => {
    const res = await login(owner)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.twoFactorSetupRequired).toBe(true)
  })

  it('may sign out', async () => {
    const res = await call('POST', '/api/auth/logout', owner)

    expect(res.status).toBe(204)
    expect(mockUsers.revokeSessions).toHaveBeenCalledWith('u1')
  })

  it('may set 2FA up, and the enabled session is no longer gated', async () => {
    mockUsers.setTwoFactorSecret.mockResolvedValue({ ...owner, twoFactorSecret: 'MOCKSECRET32' })
    const setup = await call('POST', '/api/auth/2fa/setup', owner).send({ password: 'password' })
    expect(setup.status).toBe(200)
    expect(setup.body.secret).toBe('MOCKSECRET32')

    const enrolled: User = { ...ownerWith2fa, sessionVersion: 1 }
    mockUsers.enableTwoFactor.mockResolvedValue(enrolled)
    const enable = await call('POST', '/api/auth/2fa/enable', { ...owner, twoFactorSecret: 'MOCKSECRET32' })
      .send({ code: '123456' })
    expect(enable.status).toBe(200)
    expect(enable.body.user.twoFactorEnabled).toBe(true)
    expect(enable.body.backupCodes).toHaveLength(8)

    mockUsers.findAuthById.mockResolvedValue(enrolled)
    const after = await request(app).get('/api/mashgichim')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${enable.body.token}`)
    expect(after.status).toBe(200)
  })
})

describe('owner with 2FA while REQUIRE_OWNER_2FA is on', () => {
  withOwnerPolicy(true)

  it('is not gated', async () => {
    const res = await call('GET', '/api/mashgichim', ownerWith2fa)

    expect(res.status).toBe(200)
    expect(mockMashgichim.findAll).toHaveBeenCalled()
  })

  it('reports no setup required from /auth/me and login', async () => {
    expect((await call('GET', '/api/auth/me', ownerWith2fa)).body.twoFactorSetupRequired).toBe(false)

    const res = await login(ownerWith2fa)
    expect(res.body).toMatchObject({ requiresTwoFactor: true, twoFactorSetupRequired: false })
  })

  it('cannot switch 2FA off, and the refusal costs no code check', async () => {
    const res = await call('POST', '/api/auth/2fa/disable', ownerWith2fa).send({ code: '123456' })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({
      error: 'Two-factor authentication is required for this role',
      code:  'TWO_FACTOR_REQUIRED_FOR_ROLE',
    })
    expect(mockUsers.disableTwoFactor).not.toHaveBeenCalled()
  })
})

describe.each([
  ['rabbanut', rabbanut],
  ['mashgiach', mashgiach],
])('%s without 2FA while REQUIRE_OWNER_2FA is on', (_role, user) => {
  withOwnerPolicy(true)

  it('is not gated', async () => {
    const res = await call('GET', '/api/mashgichim', user)

    // A mashgiach reaches requireRole, which refuses it on its own terms.
    if (user.role === 'mashgiach') expect(res.body).toEqual({ error: 'Forbidden' })
    else expect(res.status).toBe(200)
  })

  it('reports no setup required from /auth/me and login', async () => {
    expect((await call('GET', '/api/auth/me', user)).body.twoFactorSetupRequired).toBe(false)

    const res = await login(user)
    expect(res.status).toBe(200)
    expect(res.body.twoFactorSetupRequired).toBe(false)
  })

  it('may switch its own 2FA off', async () => {
    const enrolled: User = { ...user, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockUsers.disableTwoFactor.mockResolvedValue({ ...user, sessionVersion: 1 })

    const res = await call('POST', '/api/auth/2fa/disable', enrolled).send({ code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.user.twoFactorEnabled).toBe(false)
  })
})

describe('REQUIRE_OWNER_2FA off', () => {
  withOwnerPolicy(false)

  it('does not gate an owner without 2FA', async () => {
    const res = await call('GET', '/api/mashgichim', owner)

    expect(res.status).toBe(200)
  })

  it('reports no setup required from /auth/me and login', async () => {
    expect((await call('GET', '/api/auth/me', owner)).body.twoFactorSetupRequired).toBe(false)

    const res = await login(owner)
    expect(res.status).toBe(200)
    expect(res.body.twoFactorSetupRequired).toBe(false)
  })

  it('lets an owner switch 2FA off', async () => {
    mockUsers.disableTwoFactor.mockResolvedValue({ ...owner, sessionVersion: 1 })

    const res = await call('POST', '/api/auth/2fa/disable', ownerWith2fa).send({ code: '123456' })

    expect(res.status).toBe(200)
    expect(mockUsers.disableTwoFactor).toHaveBeenCalledWith('u1')
  })
})
