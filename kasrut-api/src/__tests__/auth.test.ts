import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../app'
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
import { consumeTwoFactorChallenge } from '../lib/twoFactorChallenges'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'

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
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockRepo = usersRepo as jest.Mocked<typeof usersRepo>
const mockCheckTotpAttempt = jest.mocked(checkTotpAttempt)
const mockConsumeChallenge = jest.mocked(consumeTwoFactorChallenge)
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
  mockRepo.findAuthById.mockResolvedValue(baseUser)
  mockRepo.verifyPassword.mockResolvedValue(true)
  mockCheckTotpAttempt.mockResolvedValue(true)
  mockConsumeChallenge.mockResolvedValue('consumed')
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

describe('POST /api/auth/2fa/disable', () => {
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
})
