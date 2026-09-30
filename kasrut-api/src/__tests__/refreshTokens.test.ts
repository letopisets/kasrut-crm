/// <reference types="jest" />
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../app'
import { env } from '../config/env'
import { usersRepo } from '../db/users.repo'
import { mapCommunityRepo, type MapAuthUserRow } from '../db/mapCommunity.repo'
import { verifyCrmAccessToken, verifyMapAccessToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { resetLoginThrottleMemory } from '../lib/loginThrottle'
import { logger } from '../lib/logger'
import {
  REUSE_GRACE_MS,
  issueRefreshToken,
  purgeExpiredRefreshTokens,
  readCookie,
  revokeRefreshFamily,
  rotateRefreshToken,
} from '../lib/refreshTokens'
import { verifyOAuthIdToken } from '../services/mapOAuth.service'
import { hashPassword } from '../services/mapPassword.service'
import type { User } from '../models/types'
import type { Request } from 'express'
import { fakeDb, type FakeRefreshTokenRow } from './refreshTokenFakePrisma'

// ── Mocks ──────────────────────────────────────────────────────────────────
// The real refresh-token repository runs against an in-memory Prisma fake;
// accounts come from mocked repositories that read their sessionVersion from
// the same fake, so a bump by reuse detection is visible to authentication.
jest.mock('../lib/prisma', () => ({
  prisma: jest.requireActual<typeof import('./refreshTokenFakePrisma')>('./refreshTokenFakePrisma').fakeDb.prisma,
}))
jest.mock('../db/users.repo')
jest.mock('../db/mapCommunity.repo')
jest.mock('../db/serviceLogs.repo', () => ({ serviceLogsRepo: { create: jest.fn() } }))
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/tokenBlacklist')
jest.mock('../lib/twoFactorAttempts', () => ({ checkTotpAttempt: jest.fn(async () => true) }))
jest.mock('../lib/twoFactorChallenges', () => ({ consumeTwoFactorChallenge: jest.fn(async () => 'consumed') }))
jest.mock('../services/mapOAuth.service', () => ({
  ...jest.requireActual('../services/mapOAuth.service'),
  verifyOAuthIdToken: jest.fn(),
}))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockUsers = jest.mocked(usersRepo)
const mockMapUsers = jest.mocked(mapCommunityRepo)

const CRM_COOKIE = 'kashrut_crm_rt'
const MAP_COOKIE = 'kashrut_map_rt'
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60
const PASSWORD = 'Passw0rd123'

const crmUser: User = {
  id: 'u1', name: 'Rabbanut Admin', email: 'admin@test.il', passwordHash: 'hash',
  role: 'rabbanut', rabbanutId: 'rb1', twoFactorEnabled: false, twoFactorBackupCodes: [],
}
let mapUser: MapAuthUserRow

const app = createApp()

// A fresh address per request keeps the per-IP limiters out of the way.
let ipSeq = 0
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`

function crmVersion(): number {
  return fakeDb.sessionVersions.user.get(crmUser.id) ?? -1
}

function mapVersion(): number {
  return fakeDb.sessionVersions.mapUser.get(mapUser.id) ?? -1
}

function currentCrmUser(overrides: Partial<User> = {}): User {
  return { ...crmUser, sessionVersion: crmVersion(), ...overrides }
}

function currentMapUser(): MapAuthUserRow {
  return { ...mapUser, sessionVersion: mapVersion() }
}

function rows(): FakeRefreshTokenRow[] {
  return [...fakeDb.refreshTokens.values()]
}

function rowFor(token: string): FakeRefreshTokenRow | undefined {
  const hash = createHash('sha256').update(token).digest('hex')
  return rows().find(row => row.tokenHash === hash)
}

interface SetCookie { value: string; attributes: string[]; raw: string }

function setCookie(res: request.Response, name: string): SetCookie | null {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined
  const raw = header?.find(line => line.startsWith(`${name}=`))
  if (!raw) return null
  const [pair, ...attributes] = raw.split(';').map(part => part.trim())
  return { value: decodeURIComponent(pair.slice(name.length + 1)), attributes, raw }
}

function crmLogin() {
  return request(app).post('/api/auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email: crmUser.email, password: 'password' })
}

async function crmSession(): Promise<{ access: string; refresh: string }> {
  const res = await crmLogin()
  expect(res.status).toBe(200)
  return { access: res.body.token, refresh: setCookie(res, CRM_COOKIE)!.value }
}

function crmRefresh(refresh: string | null, { header = true }: { header?: boolean } = {}) {
  const req = request(app).post('/api/auth/refresh').set('X-Forwarded-For', nextIp())
  if (header) req.set('X-Requested-With', 'kashrut')
  if (refresh !== null) req.set('Cookie', `${CRM_COOKIE}=${refresh}`)
  return req
}

function mapLogin() {
  return request(app).post('/api/map-auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email: mapUser.email, password: PASSWORD })
}

async function mapSession(): Promise<{ access: string; refresh: string }> {
  const res = await mapLogin()
  expect(res.status).toBe(200)
  return { access: res.body.token, refresh: setCookie(res, MAP_COOKIE)!.value }
}

function mapRefresh(refresh: string | null, { header = true }: { header?: boolean } = {}) {
  const req = request(app).post('/api/map-auth/refresh').set('X-Forwarded-For', nextIp())
  if (header) req.set('X-Requested-With', 'kashrut')
  if (refresh !== null) req.set('Cookie', `${MAP_COOKIE}=${refresh}`)
  return req
}

function crmMe(access: string) {
  return request(app).get('/api/auth/me').set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${access}`)
}

function mapMe(access: string) {
  return request(app).get('/api/map-auth/me').set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${access}`)
}

// Moves a token's rotation out of the grace window, so presenting it again
// counts as a stolen copy rather than a lost response.
function ageRotation(token: string) {
  rowFor(token)!.usedAt = new Date(Date.now() - REUSE_GRACE_MS - 1000)
}

function maxAgeOf(cookie: SetCookie): number {
  const attribute = cookie.attributes.find(entry => entry.startsWith('Max-Age='))
  return Number(attribute?.slice('Max-Age='.length))
}

function expectCleared(res: request.Response, name: string, path: string) {
  const cookie = setCookie(res, name)
  expect(cookie).not.toBeNull()
  expect(cookie!.value).toBe('')
  expect(cookie!.attributes).toEqual(expect.arrayContaining([
    `Path=${path}`, 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'HttpOnly', 'SameSite=Strict',
  ]))
}

beforeAll(async () => {
  mapUser = {
    id: 'map-user-1', email: 'user@example.com', phone: '+972500000000',
    firstName: 'Map', lastName: 'User', name: 'Map User', avatarUrl: null,
    sessionVersion: 0, passwordHash: await hashPassword(PASSWORD),
  }
})

beforeEach(() => {
  jest.clearAllMocks()
  resetLoginThrottleMemory()
  fakeDb.reset()
  fakeDb.sessionVersions.user.set(crmUser.id, 0)
  fakeDb.sessionVersions.mapUser.set(mapUser.id, 0)
  jest.mocked(isTokenBlacklisted).mockResolvedValue(false)

  const bumpCrm = async (id: string) => {
    const version = fakeDb.sessionVersions.user.get(id)
    if (version === undefined) return false
    fakeDb.sessionVersions.user.set(id, version + 1)
    return true
  }
  mockUsers.findAuthById.mockImplementation(async id => (id === crmUser.id ? currentCrmUser() : null))
  mockUsers.findAuthByEmail.mockImplementation(async email => (email === crmUser.email ? currentCrmUser() : null))
  mockUsers.verifyPassword.mockResolvedValue(true)
  mockUsers.revokeSessions.mockImplementation(bumpCrm)

  mockMapUsers.findUserById.mockImplementation(async id => (id === mapUser.id ? currentMapUser() : null))
  mockMapUsers.findAuthUserByEmail.mockImplementation(async email => (email === mapUser.email ? currentMapUser() : null))
  mockMapUsers.revokeUserSessions.mockImplementation(async id => {
    const version = fakeDb.sessionVersions.mapUser.get(id)
    if (version === undefined) return false
    fakeDb.sessionVersions.mapUser.set(id, version + 1)
    return true
  })
})

// ── Cookies ────────────────────────────────────────────────────────────────
describe('refresh cookie', () => {
  it('is set on CRM login as HttpOnly, SameSite=Strict, scoped to /api/auth for the refresh TTL', async () => {
    const res = await crmLogin()

    expect(res.status).toBe(200)
    const cookie = setCookie(res, CRM_COOKIE)!
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookie.attributes).toEqual(expect.arrayContaining([
      `Max-Age=${THIRTY_DAYS_SEC}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Strict',
    ]))
    expect(cookie.attributes.some(attribute => attribute.startsWith('Expires='))).toBe(true)
    expect(cookie.attributes.some(attribute => attribute.startsWith('Domain='))).toBe(false)
    // COOKIE_SECURE defaults to false under NODE_ENV=test.
    expect(cookie.attributes).not.toContain('Secure')
  })

  it('is set on map login scoped to /api/map-auth', async () => {
    const res = await mapLogin()

    const cookie = setCookie(res, MAP_COOKIE)!
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookie.attributes).toEqual(expect.arrayContaining([
      `Max-Age=${THIRTY_DAYS_SEC}`, 'Path=/api/map-auth', 'HttpOnly', 'SameSite=Strict',
    ]))
    expect(setCookie(res, CRM_COOKIE)).toBeNull()
  })

  it('carries Secure when COOKIE_SECURE is on, and Max-Age follows REFRESH_TOKEN_TTL_DAYS', async () => {
    const secure = jest.replaceProperty(env, 'COOKIE_SECURE', true)
    const days = jest.replaceProperty(env, 'REFRESH_TOKEN_TTL_DAYS', 7)
    try {
      const res = await crmLogin()
      const cookie = setCookie(res, CRM_COOKIE)!
      expect(cookie.attributes).toEqual(expect.arrayContaining(['Secure', `Max-Age=${7 * 86_400}`]))

      const row = rowFor(cookie.value)!
      const lifetimeMs = row.expiresAt.getTime() - Date.now()
      expect(lifetimeMs).toBeGreaterThan(7 * 86_400_000 - 60_000)
      expect(lifetimeMs).toBeLessThanOrEqual(7 * 86_400_000)
    } finally {
      secure.restore()
      days.restore()
    }
  })

  it('stores only the SHA-256 of the token, with the owner, audience and session version', async () => {
    const res = await crmLogin()
    const token = setCookie(res, CRM_COOKIE)!.value

    expect(rows()).toHaveLength(1)
    const [row] = rows()
    expect(row).toMatchObject({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      audience: 'crm', userId: crmUser.id, mapUserId: null, sessionVersion: 0, usedAt: null, revokedAt: null,
    })
    expect(JSON.stringify(row)).not.toContain(token)
  })

  it('truncates the stored user agent to 200 characters', async () => {
    const res = await request(app).post('/api/auth/login')
      .set('X-Forwarded-For', nextIp())
      .set('User-Agent', 'x'.repeat(300))
      .send({ email: crmUser.email, password: 'password' })

    expect(rowFor(setCookie(res, CRM_COOKIE)!.value)!.userAgent).toBe('x'.repeat(200))
  })

  it('is not set when the password is wrong', async () => {
    mockUsers.verifyPassword.mockResolvedValue(false)
    const res = await crmLogin()

    expect(res.status).toBe(401)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(rows()).toHaveLength(0)
  })

  it('is not set when login still needs the second factor', async () => {
    mockUsers.findAuthByEmail.mockResolvedValue({ ...currentCrmUser(), twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' })
    const res = await crmLogin()

    expect(res.body.requiresTwoFactor).toBe(true)
    expect(res.headers['set-cookie']).toBeUndefined()
  })
})

describe('readCookie', () => {
  it.each([
    ['a=1; kashrut_crm_rt=abc; b=2', 'abc'],
    ['kashrut_crm_rt=abc', 'abc'],
    ['  kashrut_crm_rt = abc ;b=2', 'abc'],
    ['kashrut_crm_rt="abc"', 'abc'],
    ['kashrut_crm_rt=a%2Fb', 'a/b'],
    ['x_kashrut_crm_rt=abc', null],
    ['kashrut_crm_rt_x=abc', null],
    ['kashrut_crm_rt=%E0%A4%A', null],
    ['', null],
    [undefined, null],
  ])('%p → %p', (header, expected) => {
    expect(readCookie(header, 'kashrut_crm_rt')).toBe(expected)
  })
})

// ── CRM refresh ────────────────────────────────────────────────────────────
describe('POST /api/auth/refresh', () => {
  it('rotates: new access token and cookie, old token marked used, successor in the same family', async () => {
    const { refresh } = await crmSession()

    const res = await crmRefresh(refresh)

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: crmUser.id, email: crmUser.email, role: 'rabbanut' })
    expect(res.body.twoFactorSetupRequired).toBe(false)
    expect(verifyCrmAccessToken(res.body.token)).toMatchObject({ sub: crmUser.id, role: 'rabbanut', rabbanutId: 'rb1', ver: 0 })
    expect((await crmMe(res.body.token)).status).toBe(200)

    const next = setCookie(res, CRM_COOKIE)!
    expect(next.value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(next.value).not.toBe(refresh)
    expect(next.attributes).toEqual(expect.arrayContaining(['Path=/api/auth', 'HttpOnly', 'SameSite=Strict']))
    expect(maxAgeOf(next)).toBeGreaterThan(THIRTY_DAYS_SEC - 60)
    expect(maxAgeOf(next)).toBeLessThanOrEqual(THIRTY_DAYS_SEC)

    const old = rowFor(refresh)!
    const successor = rowFor(next.value)!
    expect(old.usedAt).toBeInstanceOf(Date)
    expect(old.revokedAt).toBeNull()
    expect(successor).toMatchObject({ familyId: old.familyId, audience: 'crm', userId: crmUser.id, sessionVersion: 0, usedAt: null })
    expect(successor.expiresAt).toEqual(old.expiresAt)

    // The successor rotates in turn.
    const again = await crmRefresh(next.value)
    expect(again.status).toBe(200)
    expect(rows()).toHaveLength(3)
  })

  it('keeps the expiry of the sign-in: rotation never extends a session', async () => {
    const { refresh } = await crmSession()
    const signInExpiry = new Date(Date.now() + 3_600_000)
    rowFor(refresh)!.expiresAt = signInExpiry

    const first = await crmRefresh(refresh)
    const second = await crmRefresh(setCookie(first, CRM_COOKIE)!.value)

    const cookie = setCookie(second, CRM_COOKIE)!
    expect(rowFor(cookie.value)!.expiresAt).toEqual(signInExpiry)
    expect(maxAgeOf(cookie)).toBeGreaterThan(3600 - 60)
    expect(maxAgeOf(cookie)).toBeLessThanOrEqual(3600)
  })

  it('refuses a request without X-Requested-With: kashrut, before touching the token', async () => {
    const { refresh } = await crmSession()

    const missing = await crmRefresh(refresh, { header: false })
    const wrong = await crmRefresh(refresh, { header: false }).set('X-Requested-With', 'XMLHttpRequest')

    expect(missing.status).toBe(403)
    expect(wrong.status).toBe(403)
    expect(rowFor(refresh)!.usedAt).toBeNull()
    expect((await crmRefresh(refresh)).status).toBe(200)
  })

  it.each([
    ['no cookie', null],
    ['a malformed cookie', 'not-a-token'],
    ['an unknown token', 'A'.repeat(43)],
  ])('answers 401 to %s', async (_label, cookie) => {
    const res = await crmRefresh(cookie)

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Session expired; sign in again' })
    expect(res.body).not.toHaveProperty('token')
  })

  it('treats a used token as reuse: the family is revoked and sessionVersion bumped', async () => {
    const { refresh } = await crmSession()
    const rotated = await crmRefresh(refresh)
    const liveAccess = rotated.body.token
    const successor = setCookie(rotated, CRM_COOKIE)!.value
    expect((await crmMe(liveAccess)).status).toBe(200)
    ageRotation(refresh)

    const replay = await crmRefresh(refresh)

    expect(replay.status).toBe(401)
    expectCleared(replay, CRM_COOKIE, '/api/auth')
    expect(rows().every(row => row.revokedAt instanceof Date)).toBe(true)
    expect(crmVersion()).toBe(1)
    // Access tokens issued from the family stop working at once.
    expect((await crmMe(liveAccess)).status).toBe(401)
    // So does the legitimate holder's successor, without a second bump.
    expect((await crmRefresh(successor)).status).toBe(401)
    expect(crmVersion()).toBe(1)
    // A fresh sign-in works again.
    expect((await crmRefresh((await crmSession()).refresh)).status).toBe(200)
  })

  it('logs a reuse with the family and the account', async () => {
    const warn = jest.spyOn(logger, 'warn')
    try {
      const { refresh } = await crmSession()
      await crmRefresh(refresh)
      ageRotation(refresh)
      await crmRefresh(refresh)

      expect(warn).toHaveBeenCalledWith(
        { audience: 'crm', familyId: rowFor(refresh)!.familyId, ownerId: crmUser.id },
        'Refresh token reuse detected; family revoked and sessions ended',
      )
    } finally {
      warn.mockRestore()
    }
  })

  it('treats a token presented again right after its rotation as a lost response: family revoked, other sessions kept', async () => {
    const info = jest.spyOn(logger, 'info')
    try {
      const otherDevice = await crmSession()
      const { refresh } = await crmSession()
      const rotated = await crmRefresh(refresh)
      const family = rowFor(refresh)!.familyId

      // The rotation's response never arrived; the browser still sends the old cookie.
      const replay = await crmRefresh(refresh)

      expect(replay.status).toBe(401)
      expectCleared(replay, CRM_COOKIE, '/api/auth')
      expect(rows().filter(row => row.familyId === family).every(row => row.revokedAt instanceof Date)).toBe(true)
      expect(crmVersion()).toBe(0)
      // Nothing else of the account ends: not the other device, not live access tokens.
      expect((await crmMe(rotated.body.token)).status).toBe(200)
      expect((await crmRefresh(otherDevice.refresh)).status).toBe(200)
      // Sent once more while still in the window, it is still no theft.
      expect((await crmRefresh(refresh)).status).toBe(401)
      expect(crmVersion()).toBe(0)
      expect(info).toHaveBeenCalledWith(
        { audience: 'crm', familyId: family, ownerId: crmUser.id },
        'Refresh token presented again within the grace window; family revoked',
      )
    } finally {
      info.mockRestore()
    }
  })

  it('lets exactly one of two concurrent rotations of the same token through and revokes the family', async () => {
    const { refresh } = await crmSession()
    const req = { headers: { cookie: `${CRM_COOKIE}=${refresh}` }, get: () => undefined } as unknown as Request
    const load = async (id: string) => (id === crmUser.id ? currentCrmUser() : null)

    const outcomes = await Promise.all([rotateRefreshToken(req, 'crm', load), rotateRefreshToken(req, 'crm', load)])

    expect(outcomes.filter(outcome => outcome.ok)).toHaveLength(1)
    // The loser was claimed a moment ago: a duplicate request, not a stolen copy.
    expect(outcomes.filter(outcome => !outcome.ok && outcome.reason === 'replayed')).toHaveLength(1)
    expect(rows().every(row => row.revokedAt instanceof Date)).toBe(true)
    expect(crmVersion()).toBe(0)
  })

  it('treats a revoked token as reuse', async () => {
    const { refresh, access } = await crmSession()
    await revokeRefreshFamily(rowFor(refresh)!.familyId)
    rowFor(refresh)!.revokedAt = new Date(Date.now() - REUSE_GRACE_MS - 1000)

    const res = await crmRefresh(refresh)

    expect(res.status).toBe(401)
    expect(crmVersion()).toBe(1)
    expect((await crmMe(access)).status).toBe(401)
  })

  it('refuses an expired token without revoking anything', async () => {
    const { refresh, access } = await crmSession()
    rowFor(refresh)!.expiresAt = new Date(Date.now() - 1000)

    const res = await crmRefresh(refresh)

    expect(res.status).toBe(401)
    expectCleared(res, CRM_COOKIE, '/api/auth')
    expect(rowFor(refresh)).toMatchObject({ usedAt: null, revokedAt: null })
    expect(crmVersion()).toBe(0)
    expect((await crmMe(access)).status).toBe(200)
  })

  it('refuses a map token presented to the CRM without side effects', async () => {
    const { refresh } = await mapSession()

    const res = await crmRefresh(refresh)

    expect(res.status).toBe(401)
    expect(rowFor(refresh)).toMatchObject({ usedAt: null, revokedAt: null })
    expect(mapVersion()).toBe(0)
    expect((await mapRefresh(refresh)).status).toBe(200)
  })

  it('refuses a token whose session version is out of date (signed out elsewhere, password or role changed)', async () => {
    const { refresh } = await crmSession()
    fakeDb.sessionVersions.user.set(crmUser.id, 1)

    const res = await crmRefresh(refresh)

    expect(res.status).toBe(401)
    expect(rowFor(refresh)).toMatchObject({ usedAt: null, revokedAt: null })
    expect(crmVersion()).toBe(1)
  })

  it('refuses a token of an account that can no longer sign in', async () => {
    const { refresh } = await crmSession()
    mockUsers.findAuthById.mockResolvedValue(null)

    expect((await crmRefresh(refresh)).status).toBe(401)
    expect(rowFor(refresh)!.usedAt).toBeNull()
  })

  it('keeps a setup-only owner session confined to 2FA setup', async () => {
    const policy = jest.replaceProperty(env, 'REQUIRE_OWNER_2FA', true)
    try {
      const owner: User = { ...crmUser, role: 'owner', rabbanutId: undefined }
      mockUsers.findAuthByEmail.mockImplementation(async () => ({ ...owner, sessionVersion: crmVersion() }))
      mockUsers.findAuthById.mockImplementation(async () => ({ ...owner, sessionVersion: crmVersion() }))
      const { refresh } = await crmSession()

      const res = await crmRefresh(refresh)

      expect(res.status).toBe(200)
      expect(res.body.twoFactorSetupRequired).toBe(true)
      const gated = await request(app).get('/api/users').set('X-Forwarded-For', nextIp())
        .set('Authorization', `Bearer ${res.body.token}`)
      expect(gated.status).toBe(403)
      expect(gated.body.code).toBe('TWO_FACTOR_SETUP_REQUIRED')
    } finally {
      policy.restore()
    }
  })

  it('is rate limited per address', async () => {
    const ip = '192.0.2.77'
    const send = () => request(app).post('/api/auth/refresh').set('X-Forwarded-For', ip)
    for (let i = 0; i < 120; i += 1) expect((await send()).status).toBe(403)

    const limited = await send()
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBeDefined()
  })
})

// ── CRM sign-in paths and logout ───────────────────────────────────────────
describe('CRM sessions', () => {
  const tfUser = (): User => ({ ...currentCrmUser(), twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' })

  async function pendingToken(): Promise<string> {
    mockUsers.findAuthByEmail.mockImplementation(async () => tfUser())
    const res = await crmLogin()
    return res.body.tempToken
  }

  it('starts one on 2FA verification', async () => {
    const tempToken = await pendingToken()
    mockUsers.findAuthById.mockImplementation(async () => tfUser())

    const res = await request(app).post('/api/auth/2fa/verify').set('X-Forwarded-For', nextIp())
      .send({ tempToken, code: '123456' })

    expect(res.status).toBe(200)
    const cookie = setCookie(res, CRM_COOKIE)!
    expect(rowFor(cookie.value)).toMatchObject({ audience: 'crm', userId: crmUser.id })
    expect((await crmRefresh(cookie.value)).status).toBe(200)
  })

  it('starts one on backup-code verification', async () => {
    const tempToken = await pendingToken()
    const withCodes = { ...tfUser(), twoFactorBackupCodes: [bcrypt.hashSync('AAAAAAAAAA', 4)] }
    mockUsers.findAuthById.mockResolvedValue(withCodes)
    mockUsers.consumeBackupCode.mockResolvedValue(true)

    const res = await request(app).post('/api/auth/2fa/verify-backup').set('X-Forwarded-For', nextIp())
      .send({ tempToken, backupCode: 'aaaaaaaaaa' })

    expect(res.status).toBe(200)
    expect(rowFor(setCookie(res, CRM_COOKIE)!.value)).toMatchObject({ audience: 'crm', userId: crmUser.id })
  })

  it.each(['enable', 'disable'] as const)('starts a new family on 2FA %s, bound to the new session version', async action => {
    const { access, refresh } = await crmSession()
    const oldFamily = rowFor(refresh)!.familyId
    const before = action === 'enable'
      ? { ...currentCrmUser(), twoFactorSecret: 'MOCKSECRET32' }
      : tfUser()
    mockUsers.findAuthById.mockResolvedValue(before)
    const bumped = async (): Promise<User> => {
      fakeDb.sessionVersions.user.set(crmUser.id, 1)
      return { ...currentCrmUser(), twoFactorEnabled: action === 'enable' }
    }
    if (action === 'enable') mockUsers.enableTwoFactor.mockImplementation(bumped)
    else mockUsers.disableTwoFactor.mockImplementation(bumped)

    const res = await request(app).post(`/api/auth/2fa/${action}`).set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${access}`).send({ code: '123456' })

    expect(res.status).toBe(200)
    const cookie = setCookie(res, CRM_COOKIE)!
    expect(rowFor(cookie.value)).toMatchObject({ sessionVersion: 1 })
    expect(rowFor(cookie.value)!.familyId).not.toBe(oldFamily)

    mockUsers.findAuthById.mockImplementation(async () => currentCrmUser())
    expect((await crmRefresh(refresh)).status).toBe(401)
    expect((await crmRefresh(cookie.value)).status).toBe(200)
    expect(crmVersion()).toBe(1)
  })

  it('logout clears the cookie, revokes the family and bumps the session version', async () => {
    const { access, refresh } = await crmSession()

    const res = await request(app).post('/api/auth/logout').set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${access}`).set('Cookie', `${CRM_COOKIE}=${refresh}`)

    expect(res.status).toBe(204)
    expectCleared(res, CRM_COOKIE, '/api/auth')
    expect(rowFor(refresh)!.revokedAt).toBeInstanceOf(Date)
    expect(crmVersion()).toBe(1)
    expect((await crmRefresh(refresh)).status).toBe(401)
    expect((await crmMe(access)).status).toBe(401)
  })

  it('logout leaves another account\'s refresh session alone, but clears the cookie', async () => {
    const { access } = await crmSession()
    fakeDb.sessionVersions.user.set('u2', 0)
    const others = await issueRefreshToken({ audience: 'crm', ownerId: 'u2', sessionVersion: 0, userAgent: null })

    const res = await request(app).post('/api/auth/logout').set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${access}`).set('Cookie', `${CRM_COOKIE}=${others}`)

    expect(res.status).toBe(204)
    expectCleared(res, CRM_COOKIE, '/api/auth')
    expect(rowFor(others)!.revokedAt).toBeNull()
    expect(crmVersion()).toBe(1)
  })

  it('a new sign-in revokes the refresh session it replaces, without ending others', async () => {
    const otherDevice = await crmSession()
    const { refresh } = await crmSession()

    const res = await crmLogin().set('Cookie', `${CRM_COOKIE}=${refresh}`)

    expect(res.status).toBe(200)
    expect(rowFor(setCookie(res, CRM_COOKIE)!.value)!.familyId).not.toBe(rowFor(refresh)!.familyId)
    expect(rowFor(refresh)!.revokedAt).toBeInstanceOf(Date)
    expect(rowFor(otherDevice.refresh)!.revokedAt).toBeNull()
    expect(crmVersion()).toBe(0)
  })

  it('a refresh under way when a new sign-in replaced its cookie does not end the new session', async () => {
    const { refresh } = await crmSession()
    const login = await crmLogin().set('Cookie', `${CRM_COOKIE}=${refresh}`)

    const late = await crmRefresh(refresh)

    expect(late.status).toBe(401)
    expect(crmVersion()).toBe(0)
    expect((await crmMe(login.body.token)).status).toBe(200)
    expect((await crmRefresh(setCookie(login, CRM_COOKIE)!.value)).status).toBe(200)
  })

  it('logout without a cookie still signs out and clears it', async () => {
    const { access, refresh } = await crmSession()

    const res = await request(app).post('/api/auth/logout').set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${access}`)

    expect(res.status).toBe(204)
    expectCleared(res, CRM_COOKIE, '/api/auth')
    // Not revoked, but dead: the session version moved on.
    expect(rowFor(refresh)!.revokedAt).toBeNull()
    expect((await crmRefresh(refresh)).status).toBe(401)
  })
})

// ── Map ────────────────────────────────────────────────────────────────────
describe('POST /api/map-auth/refresh', () => {
  it('rotates and returns the map user with a map access token', async () => {
    const { refresh } = await mapSession()

    const res = await mapRefresh(refresh)

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ id: mapUser.id, email: mapUser.email })
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(verifyMapAccessToken(res.body.token)).toMatchObject({ sub: mapUser.id, ver: 0 })
    expect((await mapMe(res.body.token)).status).toBe(200)
    const next = setCookie(res, MAP_COOKIE)!
    expect(next.attributes).toEqual(expect.arrayContaining(['Path=/api/map-auth', 'HttpOnly', 'SameSite=Strict']))
    expect(rowFor(refresh)!.usedAt).toBeInstanceOf(Date)
    expect(rowFor(next.value)).toMatchObject({ audience: 'map', mapUserId: mapUser.id, userId: null })
  })

  it('requires X-Requested-With: kashrut', async () => {
    const { refresh } = await mapSession()

    expect((await mapRefresh(refresh, { header: false })).status).toBe(403)
    expect(rowFor(refresh)!.usedAt).toBeNull()
  })

  it('treats reuse like the CRM does', async () => {
    const { refresh } = await mapSession()
    const rotated = await mapRefresh(refresh)
    ageRotation(refresh)

    const replay = await mapRefresh(refresh)

    expect(replay.status).toBe(401)
    expectCleared(replay, MAP_COOKIE, '/api/map-auth')
    expect(rows().every(row => row.revokedAt instanceof Date)).toBe(true)
    expect(mapVersion()).toBe(1)
    expect((await mapMe(rotated.body.token)).status).toBe(401)
  })

  it('refuses a CRM token', async () => {
    const { refresh } = await crmSession()

    expect((await mapRefresh(refresh)).status).toBe(401)
    expect(rowFor(refresh)).toMatchObject({ usedAt: null, revokedAt: null })
  })

  it('refuses an expired token', async () => {
    const { refresh } = await mapSession()
    rowFor(refresh)!.expiresAt = new Date(Date.now() - 1000)

    expect((await mapRefresh(refresh)).status).toBe(401)
    expect(mapVersion()).toBe(0)
  })

  it('refuses a token of a deleted account', async () => {
    const { refresh } = await mapSession()
    mockMapUsers.findUserById.mockResolvedValue(null)

    expect((await mapRefresh(refresh)).status).toBe(401)
  })
})

describe('map sessions', () => {
  it('start on registration', async () => {
    mockMapUsers.createPasswordUser.mockImplementation(async () => currentMapUser())

    const res = await request(app).post('/api/map-auth/register').set('X-Forwarded-For', nextIp())
      .send({ firstName: 'Map', lastName: 'User', email: mapUser.email, phone: mapUser.phone, password: PASSWORD })

    expect(res.status).toBe(201)
    expect(rowFor(setCookie(res, MAP_COOKIE)!.value)).toMatchObject({ audience: 'map', mapUserId: mapUser.id })
  })

  it('do not start when registration is refused', async () => {
    mockMapUsers.createPasswordUser.mockRejectedValue(new Error('P2002'))

    const res = await request(app).post('/api/map-auth/register').set('X-Forwarded-For', nextIp())
      .send({ firstName: 'Map', lastName: 'User', email: mapUser.email, phone: mapUser.phone, password: PASSWORD })

    expect(res.status).toBe(409)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('start on OAuth sign-in', async () => {
    jest.mocked(verifyOAuthIdToken).mockResolvedValue({
      provider: 'google', providerUserId: 'google-sub-1', email: mapUser.email, name: mapUser.name,
    })
    mockMapUsers.upsertUserFromIdentity.mockImplementation(async () => currentMapUser())

    const res = await request(app).post('/api/map-auth/oauth').set('X-Forwarded-For', nextIp())
      .send({ provider: 'google', idToken: 'x'.repeat(40) })

    expect(res.status).toBe(200)
    expect(rowFor(setCookie(res, MAP_COOKIE)!.value)).toMatchObject({ audience: 'map', mapUserId: mapUser.id })
  })

  it('password reset ends earlier refresh sessions and starts a new one', async () => {
    const { refresh } = await mapSession()
    mockMapUsers.hasValidPasswordResetToken.mockResolvedValue(true)
    mockMapUsers.consumePasswordResetToken.mockImplementation(async () => {
      fakeDb.sessionVersions.mapUser.set(mapUser.id, mapVersion() + 1)
      return currentMapUser()
    })

    const res = await request(app).post('/api/map-auth/password-reset/confirm').set('X-Forwarded-For', nextIp())
      .send({ token: 'r'.repeat(40), password: PASSWORD })

    expect(res.status).toBe(200)
    const fresh = setCookie(res, MAP_COOKIE)!.value
    expect(rowFor(fresh)).toMatchObject({ sessionVersion: 1 })
    expect(rowFor(fresh)!.familyId).not.toBe(rowFor(refresh)!.familyId)
    expect((await mapRefresh(refresh)).status).toBe(401)
    expect(rowFor(refresh)).toMatchObject({ usedAt: null, revokedAt: null })
    expect((await mapRefresh(fresh)).status).toBe(200)
  })

  it('a new sign-in revokes the refresh session it replaces', async () => {
    const { refresh } = await mapSession()

    const res = await mapLogin().set('Cookie', `${MAP_COOKIE}=${refresh}`)

    expect(res.status).toBe(200)
    expect(rowFor(refresh)!.revokedAt).toBeInstanceOf(Date)
    expect(mapVersion()).toBe(0)
    expect((await mapRefresh(setCookie(res, MAP_COOKIE)!.value)).status).toBe(200)
  })

  it('logout clears the cookie, revokes the family and bumps the session version', async () => {
    const { access, refresh } = await mapSession()

    const res = await request(app).post('/api/map-auth/logout').set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${access}`).set('Cookie', `${MAP_COOKIE}=${refresh}`)

    expect(res.status).toBe(204)
    expectCleared(res, MAP_COOKIE, '/api/map-auth')
    expect(rowFor(refresh)!.revokedAt).toBeInstanceOf(Date)
    expect(mapVersion()).toBe(1)
    expect((await mapRefresh(refresh)).status).toBe(401)
    expect((await mapMe(access)).status).toBe(401)
  })
})

// ── Cross-site requests ────────────────────────────────────────────────────
describe('requests from other sites', () => {
  const SESSION_START_ROUTES: Array<[string, Record<string, string>]> = [
    ['/api/auth/login', { email: 'admin@test.il', password: 'password' }],
    ['/api/auth/2fa/verify', { tempToken: 't', code: '123456' }],
    ['/api/auth/2fa/verify-backup', { tempToken: 't', backupCode: 'aaaaaaaaaa' }],
    ['/api/map-auth/login', { email: 'user@example.com', password: PASSWORD }],
    ['/api/map-auth/register', { firstName: 'A', lastName: 'B', email: 'a@example.com', phone: '+972500000001', password: PASSWORD }],
    ['/api/map-auth/oauth', { provider: 'google', idToken: 'x'.repeat(40) }],
    ['/api/map-auth/password-reset/confirm', { token: 'r'.repeat(40), password: PASSWORD }],
  ]

  it.each(SESSION_START_ROUTES)('%s refuses an HTML form post', async (path, fields) => {
    const res = await request(app).post(path).set('X-Forwarded-For', nextIp())
      .set('Origin', 'https://evil.example').type('form').send(new URLSearchParams(fields).toString())

    expect(res.status).toBe(415)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(rows()).toHaveLength(0)
  })

  it.each(SESSION_START_ROUTES)('%s refuses a JSON post from another site', async (path, fields) => {
    const res = await request(app).post(path).set('X-Forwarded-For', nextIp())
      .set('Sec-Fetch-Site', 'cross-site').set('Origin', 'https://evil.example').send(fields)

    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('refuses a CRM login from the map, a sibling on the same site', async () => {
    const res = await crmLogin()
      .set('Host', 'crm.mykoshermap.com').set('Sec-Fetch-Site', 'same-site').set('Origin', 'https://mykoshermap.com')

    expect(res.status).toBe(403)
    expect(rows()).toHaveLength(0)
  })

  it.each([
    ['a sibling origin on the same site', { 'Sec-Fetch-Site': 'same-site', Origin: 'https://mykoshermap.com' }],
    ['a sibling origin, without fetch metadata', { Origin: 'https://mykoshermap.com' }],
    ['a sibling origin claiming its host in X-Forwarded-Host', { 'Sec-Fetch-Site': 'same-site', Origin: 'https://mykoshermap.com', 'X-Forwarded-Host': 'mykoshermap.com' }],
    ['an opaque origin', { Origin: 'null' }],
    ['a navigation', { 'Sec-Fetch-Site': 'none' }],
    ['same-site metadata without an Origin', { 'Sec-Fetch-Site': 'same-site' }],
  ])('refuses a CRM refresh from %s, before touching the token', async (_label, headers) => {
    const { refresh } = await crmSession()

    const res = await crmRefresh(refresh).set('Host', 'crm.mykoshermap.com').set(headers)

    expect(res.status).toBe(403)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(rowFor(refresh)!.usedAt).toBeNull()
  })

  it.each([
    ['the same origin', 'crm.mykoshermap.com', { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://crm.mykoshermap.com' }],
    ['the same origin, without fetch metadata', 'crm.mykoshermap.com', { Origin: 'https://crm.mykoshermap.com' }],
    ['a dev server on another port of the same host', 'localhost:3000', { 'Sec-Fetch-Site': 'same-site', Origin: 'http://localhost:5173' }],
    ['a client that is not a browser', 'crm.mykoshermap.com', {}],
  ])('accepts a CRM refresh from %s', async (_label, host, headers) => {
    const { refresh } = await crmSession()

    const res = await crmRefresh(refresh).set('Host', host).set(headers)

    expect(res.status).toBe(200)
  })

  it('refuses a map refresh from the CRM origin', async () => {
    const { refresh } = await mapSession()

    const res = await mapRefresh(refresh).set('Host', 'mykoshermap.com')
      .set('Sec-Fetch-Site', 'same-site').set('Origin', 'https://crm.mykoshermap.com')

    expect(res.status).toBe(403)
    expect(rowFor(refresh)!.usedAt).toBeNull()
  })
})

describe('purgeExpiredRefreshTokens', () => {
  it('deletes expired rows only', async () => {
    const live = (await crmSession()).refresh
    const expired = (await crmSession()).refresh
    const used = (await crmSession()).refresh
    await crmRefresh(used)
    rowFor(expired)!.expiresAt = new Date(Date.now() - 1000)

    expect(await purgeExpiredRefreshTokens()).toBe(1)
    expect(rowFor(expired)).toBeUndefined()
    expect(rowFor(live)).toBeDefined()
    // A used row stays until it expires, so replaying it is still caught.
    expect(rowFor(used)).toBeDefined()
  })
})
