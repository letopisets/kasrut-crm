import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../app'
import { env } from '../config/env'
import { usersRepo } from '../db/users.repo'
import {
  signCrmAccessToken,
  signTwoFactorPendingToken,
  verifyCrmAccessToken,
  verifyMapAccessToken,
  verifyTwoFactorPendingToken,
} from '../lib/jwt'
import type { User } from '../models/types'
import { checkTotpAttempt } from '../lib/twoFactorAttempts'
import { claimTotpTimeStep, consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { resetLoginThrottleMemory } from '../lib/loginThrottle'

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
// Refresh-token storage; its behaviour is covered in refreshTokens.test.ts.
jest.mock('../db/refreshTokens.repo')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/twoFactorAttempts')
jest.mock('../lib/twoFactorChallenges')
jest.mock('../lib/tokenBlacklist')
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  // 123456 is the code of time step 1000, 654321 the code of the next one.
  verifySync:     ({ token }: { token: string }) =>
    token === '123456' ? { valid: true, timeStep: 1000 }
      : token === '654321' ? { valid: true, timeStep: 1001 }
        : { valid: false },
}))

const mockRepo = usersRepo as jest.Mocked<typeof usersRepo>
const mockCheckTotpAttempt = jest.mocked(checkTotpAttempt)
const mockConsumeChallenge = jest.mocked(consumeTwoFactorChallenge)
const mockClaimTotpStep = jest.mocked(claimTotpTimeStep)
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)

const baseUser: User = {
  id:                   'u1',
  name:                 'Test Owner',
  email:                'owner@test.il',
  passwordHash:         '$2a$08$hashedpassword',
  role:                 'owner',
  twoFactorEnabled:     false,
  twoFactorBackupCodes: [],
}

function makeToken(user: User = baseUser) {
  return signCrmAccessToken({ sub: user.id, role: user.role, name: user.name, email: user.email, ver: 0 })
}

// An issued session token must verify only as a CRM access token.
function expectCrmSessionToken(token: string) {
  expect(verifyCrmAccessToken(token)).toMatchObject({ sub: 'u1', role: 'owner', typ: 'crm', ver: 0 })
  expect(() => verifyMapAccessToken(token)).toThrow()
  expect(() => verifyTwoFactorPendingToken(token)).toThrow()
}

const app = createApp()

beforeEach(() => {
  jest.clearAllMocks()
  resetLoginThrottleMemory()
  mockRepo.findAuthById.mockResolvedValue(baseUser)
  mockRepo.verifyPassword.mockResolvedValue(true)
  mockCheckTotpAttempt.mockResolvedValue(true)
  mockConsumeChallenge.mockResolvedValue('consumed')
  mockClaimTotpStep.mockResolvedValue(true)
  mockIsTokenBlacklisted.mockResolvedValue(false)
})

// ── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('returns token on valid credentials', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'password' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe('owner@test.il')
    expectCrmSessionToken(res.body.token)

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)
    expect(me.status).toBe(200)
  })

  it('returns 401 on wrong password', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 when user not found', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(null)
    mockRepo.verifyPassword.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.il', password: 'password' })

    expect(res.status).toBe(401)
  })

  it('returns 400 when body is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({})
    expect(res.status).toBe(400)
  })

  it('returns tempToken when 2FA is enabled', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthByEmail.mockResolvedValue(tfUser)
    mockRepo.verifyPassword.mockResolvedValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'password' })

    expect(res.status).toBe(200)
    expect(res.body.requiresTwoFactor).toBe(true)
    expect(res.body).toHaveProperty('tempToken')
    expect(res.body).not.toHaveProperty('token')
    expect(verifyTwoFactorPendingToken(res.body.tempToken)).toMatchObject({ sub: 'u1', typ: '2fa_pending' })
    expect(() => verifyCrmAccessToken(res.body.tempToken)).toThrow()
    expect(() => verifyMapAccessToken(res.body.tempToken)).toThrow()
  })
})

describe('GET /api/auth/me', () => {
  it('returns current user with valid JWT', async () => {
    mockRepo.findAuthById.mockResolvedValue(baseUser)
    const token = makeToken()

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.email).toBe('owner@test.il')
    expect(res.body).not.toHaveProperty('passwordHash')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/2fa/setup', () => {
  it('generates secret and QR code', async () => {
    mockRepo.setTwoFactorSecret.mockResolvedValue(baseUser)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'current-password' })

    expect(res.status).toBe(200)
    expect(res.body.secret).toBe('MOCKSECRET32')
    expect(res.body.qrDataUrl).toContain('data:image/png')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/2fa/setup')
    expect(res.status).toBe(401)
  })

  // A wrong re-auth password must not read as a dead session (401), which
  // the CRM answers by signing the user out.
  it('answers a wrong password with 400, not 401', async () => {
    mockRepo.verifyPassword.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'wrong-password' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid credentials', code: 'INVALID_PASSWORD' })
    expect(mockRepo.setTwoFactorSecret).not.toHaveBeenCalled()
  })

  it('does not replace an already enabled factor', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthById.mockResolvedValue(tfUser)

    const res = await request(app)
      .post('/api/auth/2fa/setup')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password: 'current-password' })

    expect(res.status).toBe(409)
    expect(mockRepo.setTwoFactorSecret).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/2fa/enable', () => {
  it('enables 2FA with valid code', async () => {
    const userWithSecret: User = { ...baseUser, twoFactorSecret: 'MOCKSECRET32' }
    const updatedUser: User    = { ...userWithSecret, twoFactorEnabled: true }
    mockRepo.findAuthById.mockResolvedValue(userWithSecret)
    mockRepo.enableTwoFactor.mockResolvedValue(updatedUser)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.user.twoFactorEnabled).toBe(true)
  })

  it('returns 400 with invalid code', async () => {
    const userWithSecret: User = { ...baseUser, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthById.mockResolvedValue(userWithSecret)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid code')
  })

  it('returns 400 if setup was not called first', async () => {
    mockRepo.findAuthById.mockResolvedValue(baseUser)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.error).toContain('setup')
  })
})

// These owners may switch 2FA off only with the owner policy off; the policy
// itself is covered in ownerTwoFactor.test.ts.
function withoutOwnerTwoFactorPolicy() {
  let policy: jest.ReplaceProperty<boolean>
  beforeEach(() => { policy = jest.replaceProperty(env, 'REQUIRE_OWNER_2FA', false) })
  afterEach(() => { policy.restore() })
}

describe('POST /api/auth/2fa/disable', () => {
  withoutOwnerTwoFactorPolicy()

  it('disables 2FA with valid code', async () => {
    const tfUser: User    = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    const disabled: User  = { ...tfUser, twoFactorEnabled: false, twoFactorSecret: undefined }
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    mockRepo.disableTwoFactor.mockResolvedValue(disabled)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body.user.twoFactorEnabled).toBe(false)
  })

  it('returns 400 if 2FA is not enabled', async () => {
    mockRepo.findAuthById.mockResolvedValue(baseUser)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '123456' })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/2fa/verify', () => {
  it('issues full JWT with valid tempToken and code', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthById.mockResolvedValue(tfUser)

    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'pending-1' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken, code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.id).toBe('u1')
    expectCrmSessionToken(res.body.token)
  })

  it('returns 401 with invalid tempToken', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: 'invalid.token', code: '123456' })

    expect(res.status).toBe(401)
  })

  it('rejects a full CRM JWT in place of a pending token', async () => {
    const fullToken = signCrmAccessToken(
      { sub: 'u1', role: 'owner', jti: 'full-1', name: 'Owner', email: 'owner@test.il', ver: 0 },
    )

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: fullToken, code: '123456' })

    expect(res.status).toBe(401)
    expect(mockRepo.findAuthById).not.toHaveBeenCalled()
  })

  it('rejects a blacklisted pending token', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(true)
    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'revoked-pending' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken, code: '123456' })

    expect(res.status).toBe(401)
  })

  it('rejects an already consumed pending challenge', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    mockConsumeChallenge.mockResolvedValue('already_used')
    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'replayed-pending' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken, code: '123456' })

    expect(res.status).toBe(401)
    expect(res.body.error).toContain('already been used')
  })

  it('returns 400 with wrong TOTP code', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findAuthById.mockResolvedValue(tfUser)

    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'pending-2' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken, code: '000000' })

    expect(res.status).toBe(400)
  })

  it('returns 400 when body is missing fields', async () => {
    const res = await request(app).post('/api/auth/2fa/verify').send({})
    expect(res.status).toBe(400)
  })

  it('claims the code\'s time step for the account before consuming the challenge', async () => {
    mockRepo.findAuthById.mockResolvedValue({ ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1', jti: 'step-1' }), code: '123456' })

    expect(res.status).toBe(200)
    expect(mockClaimTotpStep).toHaveBeenCalledWith('u1', 1000)
    expect(mockClaimTotpStep.mock.invocationCallOrder[0])
      .toBeLessThan(mockConsumeChallenge.mock.invocationCallOrder[0])
  })

  // RFC 6238 section 5.2: a code that already opened a session must not open
  // a second one through a fresh password step within its 30 s window.
  it('refuses a code whose time step this account already used, whatever the pending token', async () => {
    mockRepo.findAuthById.mockResolvedValue({ ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' })
    mockClaimTotpStep.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1', jti: 'fresh-pending' }), code: '123456' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid code' })
    expect(res.body).not.toHaveProperty('token')
    expect(mockConsumeChallenge).not.toHaveBeenCalled()
  })

  it.each([
    ['a number', { code: 123456 }],
    ['an array', { code: ['123456'] }],
    ['an object', { code: { $gt: '' } }],
    ['an oversized string', { code: '1'.repeat(65) }],
  ])('answers 400, not 500, for a code that is %s', async (_label, body) => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1', jti: 'typed' }), ...body })

    expect(res.status).toBe(400)
    expect(mockRepo.findAuthById).not.toHaveBeenCalled()
  })

  it('answers 400 for a tempToken that is not a string', async () => {
    const res = await request(app).post('/api/auth/2fa/verify').send({ tempToken: 42, code: '123456' })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/2fa/verify-backup', () => {
  it('consumes a backup code with compare-and-swap before issuing a token', async () => {
    const hash = await bcrypt.hash('A1B2C3D4E5', 4)
    const tfUser: User = {
      ...baseUser,
      twoFactorEnabled: true,
      twoFactorSecret: 'MOCKSECRET32',
      twoFactorBackupCodes: [hash],
    }
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    mockRepo.consumeBackupCode.mockResolvedValue(true)
    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'backup-pending' })

    const res = await request(app)
      .post('/api/auth/2fa/verify-backup')
      .send({ tempToken, backupCode: 'a1b2c3d4e5' })

    expect(res.status).toBe(200)
    expect(mockRepo.consumeBackupCode).toHaveBeenCalledWith('u1', [hash], [])
    expectCrmSessionToken(res.body.token)
  })

  it('does not issue a token when another request changed the backup-code set', async () => {
    const hash = await bcrypt.hash('A1B2C3D4E5', 4)
    const tfUser: User = {
      ...baseUser,
      twoFactorEnabled: true,
      twoFactorBackupCodes: [hash],
    }
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    mockRepo.consumeBackupCode.mockResolvedValue(false)
    const tempToken = signTwoFactorPendingToken({ sub: 'u1', jti: 'backup-race' })

    const res = await request(app)
      .post('/api/auth/2fa/verify-backup')
      .send({ tempToken, backupCode: 'A1B2C3D4E5' })

    expect(res.status).toBe(409)
    expect(res.body).not.toHaveProperty('token')
  })

  it.each([
    ['a number', 12345678],
    ['an array', ['A1B2C3D4E5']],
    ['null', null],
  ])('answers 400, not 500, for a backupCode that is %s', async (_label, backupCode) => {
    const res = await request(app)
      .post('/api/auth/2fa/verify-backup')
      .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1', jti: 'typed-backup' }), backupCode })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'tempToken and backupCode required' })
    expect(mockRepo.findAuthById).not.toHaveBeenCalled()
  })
})

describe('2FA enable / disable input and replay', () => {
  const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
  let policy: jest.ReplaceProperty<boolean>
  // Own addresses: earlier blocks spent the default address's 2FA budget.
  let ip = 0
  const from = () => `203.0.113.${++ip}`
  beforeEach(() => { policy = jest.replaceProperty(env, 'REQUIRE_OWNER_2FA', false) })
  afterEach(() => { policy.restore() })

  it.each(['enable', 'disable'])('/2fa/%s answers 400 for a code that is not a string', async endpoint => {
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    const res = await request(app)
      .post(`/api/auth/2fa/${endpoint}`)
      .set('X-Forwarded-For', from())
      .set('Authorization', `Bearer ${makeToken(endpoint === 'disable' ? tfUser : baseUser)}`)
      .send({ code: 123456 })

    expect(res.status).toBe(400)
    expect(mockClaimTotpStep).not.toHaveBeenCalled()
    expect(mockRepo.enableTwoFactor).not.toHaveBeenCalled()
    expect(mockRepo.disableTwoFactor).not.toHaveBeenCalled()
  })

  it('/2fa/enable refuses a replayed code', async () => {
    mockRepo.findAuthById.mockResolvedValue({ ...baseUser, twoFactorSecret: 'MOCKSECRET32' })
    mockClaimTotpStep.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('X-Forwarded-For', from())
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(mockClaimTotpStep).toHaveBeenCalledWith('u1', 1000)
    expect(mockRepo.enableTwoFactor).not.toHaveBeenCalled()
  })

  it('/2fa/disable refuses a replayed code', async () => {
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    mockClaimTotpStep.mockResolvedValue(false)

    const res = await request(app)
      .post('/api/auth/2fa/disable')
      .set('X-Forwarded-For', from())
      .set('Authorization', `Bearer ${makeToken(tfUser)}`)
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(mockRepo.disableTwoFactor).not.toHaveBeenCalled()
  })
})

// ── Per-account throttling ─────────────────────────────────────────────────
// Every request comes from a fresh address: the lock follows the account, so
// rotating IPs (which also keeps the IP limiter out of the way) must not help.
let ipSeq = 0
const nextIp = () => `198.51.100.${(ipSeq++ % 250) + 1}`

const LOCKED_BODY = { error: 'Too many attempts. Try again later.' }
// Several requests (and real cost-12 bcrypt compares) per test.
const SLOW_TEST_MS = 30_000

// Frozen clock: Retry-After values stay exact however slow the run is.
function freezeClock() {
  let clock: jest.SpyInstance
  beforeEach(() => { clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now()) })
  afterEach(() => { clock.mockRestore() })
}

function login(email: string, password = 'wrong-password') {
  return request(app).post('/api/auth/login').set('X-Forwarded-For', nextIp()).send({ email, password })
}

describe('CRM login throttling', () => {
  freezeClock()

  it('locks the account after five free failures and stops checking passwords', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockResolvedValue(false)

    for (let i = 0; i < 6; i += 1) expect((await login('owner@test.il')).status).toBe(401)
    expect(mockRepo.verifyPassword).toHaveBeenCalledTimes(6)

    jest.clearAllMocks()
    mockRepo.verifyPassword.mockResolvedValue(true)
    const locked = await login('Owner@Test.il', 'right-password')

    expect(locked.status).toBe(429)
    expect(locked.body).toEqual(LOCKED_BODY)
    expect(locked.headers['retry-after']).toBe('60')
    expect(mockRepo.findAuthByEmail).not.toHaveBeenCalled()
    expect(mockRepo.verifyPassword).not.toHaveBeenCalled()
  }, SLOW_TEST_MS)

  it('answers a locked unknown account exactly like a locked real one', async () => {
    mockRepo.verifyPassword.mockResolvedValue(false)
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    for (let i = 0; i < 6; i += 1) await login('owner@test.il')
    mockRepo.findAuthByEmail.mockResolvedValue(null)
    for (let i = 0; i < 6; i += 1) expect((await login('nobody@test.il')).status).toBe(401)

    const real = await login('owner@test.il')
    const unknown = await login('nobody@test.il')

    expect(real.status).toBe(429)
    expect(unknown.status).toBe(real.status)
    expect(unknown.body).toEqual(real.body)
    expect(unknown.headers['retry-after']).toBe(real.headers['retry-after'])
  }, SLOW_TEST_MS)

  it('clears the failure count on a successful login', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 5; i += 1) await login('owner@test.il')

    mockRepo.verifyPassword.mockResolvedValue(true)
    expect((await login('owner@test.il', 'right-password')).status).toBe(200)

    mockRepo.verifyPassword.mockResolvedValue(false)
    for (let i = 0; i < 6; i += 1) expect((await login('owner@test.il')).status).toBe(401)
    expect((await login('owner@test.il')).status).toBe(429)
  }, SLOW_TEST_MS)

  it('lets only the free attempts plus one of a parallel burst reach the password check', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(baseUser)
    // As slow as a real cost-12 compare, so the whole burst is in flight at once.
    mockRepo.verifyPassword.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(false), 100)))

    const burst = await Promise.all(Array.from({ length: 20 }, () => login('owner@test.il')))

    expect(burst.filter(res => res.status === 401)).toHaveLength(6)
    expect(burst.filter(res => res.status === 429)).toHaveLength(14)
    expect(mockRepo.verifyPassword).toHaveBeenCalledTimes(6)
  }, SLOW_TEST_MS)

  it('counts the /2fa/setup password re-check against the same account budget', async () => {
    mockRepo.verifyPassword.mockResolvedValue(false)
    const setup = (password: string) => request(app)
      .post('/api/auth/2fa/setup')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ password })
    for (let i = 0; i < 6; i += 1) expect((await setup('wrong-password')).status).toBe(400)

    mockRepo.verifyPassword.mockClear()
    mockRepo.verifyPassword.mockResolvedValue(true)
    const locked = await setup('right-password')

    expect(locked.status).toBe(429)
    expect(locked.body).toEqual(LOCKED_BODY)
    expect(mockRepo.verifyPassword).not.toHaveBeenCalled()
    expect(mockRepo.setTwoFactorSecret).not.toHaveBeenCalled()
    expect((await login('owner@test.il', 'right-password')).status).toBe(429)
  }, SLOW_TEST_MS)

  it('spends a real cost-12 bcrypt compare on an unknown account', async () => {
    mockRepo.findAuthByEmail.mockResolvedValue(null)
    const compare = jest.spyOn(bcrypt, 'compare')

    try {
      const res = await login('nobody@test.il', 'guess')

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Invalid credentials' })
      expect(mockRepo.verifyPassword).not.toHaveBeenCalled()
      expect(compare).toHaveBeenCalledTimes(1)
      const [password, hash] = compare.mock.calls[0] as unknown as [string, string]
      expect(password).toBe('guess')
      expect(bcrypt.getRounds(hash)).toBe(12)
      await expect(compare.mock.results[0].value).resolves.toBe(false)
    } finally {
      compare.mockRestore()
    }
  }, SLOW_TEST_MS)
})

describe('CRM 2FA throttling per account', () => {
  freezeClock()
  withoutOwnerTwoFactorPolicy()

  const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }

  // A fresh pending token per call, as an attacker re-running the password
  // step would get: the per-jti counter alone never trips.
  function verify(code: string) {
    return request(app)
      .post('/api/auth/2fa/verify')
      .set('X-Forwarded-For', nextIp())
      .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1' }), code })
  }

  it('locks both 2FA endpoints for the account and skips the factor check', async () => {
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    for (let i = 0; i < 6; i += 1) expect((await verify('000000')).status).toBe(400)

    jest.clearAllMocks()
    const compare = jest.spyOn(bcrypt, 'compare')
    try {
      const totp = await verify('123456')
      const backup = await request(app)
        .post('/api/auth/2fa/verify-backup')
        .set('X-Forwarded-For', nextIp())
        .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1' }), backupCode: 'A1B2C3D4E5' })

      for (const res of [totp, backup]) {
        expect(res.status).toBe(429)
        expect(res.body).toEqual(LOCKED_BODY)
        expect(res.headers['retry-after']).toBe('60')
      }
      expect(mockRepo.findAuthById).not.toHaveBeenCalled()
      expect(mockCheckTotpAttempt).not.toHaveBeenCalled()
      expect(compare).not.toHaveBeenCalled()
      expect(mockConsumeChallenge).not.toHaveBeenCalled()
    } finally {
      compare.mockRestore()
    }
  }, SLOW_TEST_MS)

  it('lets only the free attempts plus one of a parallel burst reach the code check', async () => {
    mockRepo.findAuthById.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(tfUser), 50)))

    const burst = await Promise.all(Array.from({ length: 20 }, () => verify('000000')))

    expect(burst.filter(res => res.status === 400)).toHaveLength(6)
    expect(burst.filter(res => res.status === 429)).toHaveLength(14)
    expect(mockRepo.findAuthById).toHaveBeenCalledTimes(6)
  }, SLOW_TEST_MS)

  it('counts /2fa/disable code guesses against the same account budget', async () => {
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    const disable = (code: string) => request(app)
      .post('/api/auth/2fa/disable')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${makeToken(tfUser)}`)
      .send({ code })
    for (let i = 0; i < 6; i += 1) expect((await disable('000000')).status).toBe(400)

    const locked = await disable('123456')

    expect(locked.status).toBe(429)
    expect(locked.body).toEqual(LOCKED_BODY)
    expect(mockRepo.disableTwoFactor).not.toHaveBeenCalled()
    expect((await verify('123456')).status).toBe(429)
  }, SLOW_TEST_MS)

  it('counts /2fa/enable code guesses against the same account budget', async () => {
    mockRepo.findAuthById.mockResolvedValue({ ...baseUser, twoFactorSecret: 'MOCKSECRET32' })
    const enable = (code: string) => request(app)
      .post('/api/auth/2fa/enable')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code })
    for (let i = 0; i < 6; i += 1) expect((await enable('000000')).status).toBe(400)

    const locked = await enable('123456')

    expect(locked.status).toBe(429)
    expect(locked.body).toEqual(LOCKED_BODY)
    expect(mockRepo.enableTwoFactor).not.toHaveBeenCalled()
    expect((await verify('123456')).status).toBe(429)
  }, SLOW_TEST_MS)

  it('clears the 2FA failure count after 2FA is enabled', async () => {
    mockRepo.findAuthById.mockResolvedValue({ ...baseUser, twoFactorSecret: 'MOCKSECRET32' })
    mockRepo.enableTwoFactor.mockResolvedValue({ ...tfUser, sessionVersion: 1 })
    const enable = (code: string) => request(app)
      .post('/api/auth/2fa/enable')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ code })
    for (let i = 0; i < 5; i += 1) expect((await enable('000000')).status).toBe(400)
    expect((await enable('123456')).status).toBe(200)

    mockRepo.findAuthById.mockResolvedValue(tfUser)
    for (let i = 0; i < 5; i += 1) expect((await verify('000000')).status).toBe(400)
    expect((await verify('123456')).status).toBe(200)
  }, SLOW_TEST_MS)

  it('counts wrong backup codes against the same account budget', async () => {
    const hash = await bcrypt.hash('A1B2C3D4E5', 4)
    mockRepo.findAuthById.mockResolvedValue({ ...tfUser, twoFactorBackupCodes: [hash] })
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app)
        .post('/api/auth/2fa/verify-backup')
        .set('X-Forwarded-For', nextIp())
        .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1' }), backupCode: 'FFFFFFFFFF' })
      expect(res.status).toBe(400)
    }

    expect((await verify('123456')).status).toBe(429)
  }, SLOW_TEST_MS)

  // A correct factor refused only because the challenge store failed must not
  // count: retrying through an outage used to walk the owner into a lock
  // that outlived the outage.
  it('does not count a correct factor refused because the challenge store is unavailable', async () => {
    const hash = await bcrypt.hash('A1B2C3D4E5', 4)
    mockRepo.findAuthById.mockResolvedValue({ ...tfUser, twoFactorBackupCodes: [hash] })
    mockConsumeChallenge.mockResolvedValue('unavailable')

    for (let i = 0; i < 8; i += 1) {
      const res = i % 2 === 0
        ? await verify('123456')
        : await request(app)
          .post('/api/auth/2fa/verify-backup')
          .set('X-Forwarded-For', nextIp())
          .send({ tempToken: signTwoFactorPendingToken({ sub: 'u1' }), backupCode: 'A1B2C3D4E5' })
      expect(res.status).toBe(503)
    }

    mockConsumeChallenge.mockResolvedValue('consumed')
    expect((await verify('123456')).status).toBe(200)
  }, SLOW_TEST_MS)

  it('clears the 2FA failure count after a successful verification', async () => {
    mockRepo.findAuthById.mockResolvedValue(tfUser)
    for (let i = 0; i < 5; i += 1) await verify('000000')
    expect((await verify('123456')).status).toBe(200)

    for (let i = 0; i < 6; i += 1) expect((await verify('000000')).status).toBe(400)
    expect((await verify('000000')).status).toBe(429)
  }, SLOW_TEST_MS)
})
