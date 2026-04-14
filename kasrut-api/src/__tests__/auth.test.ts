import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { usersRepo } from '../db/users.repo'
import { env } from '../config/env'
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
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockRepo = usersRepo as jest.Mocked<typeof usersRepo>

const baseUser: User = {
  id:               'u1',
  name:             'Test Owner',
  email:            'owner@test.il',
  passwordHash:     '$2a$08$hashedpassword',
  role:             'owner',
  twoFactorEnabled: false,
}

function makeToken(user: Partial<User> = baseUser) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email },
    env.JWT_SECRET,
    { expiresIn: '1h' } as object,
  )
}

const app = createApp()

// ── Tests ──────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  it('returns token on valid credentials', async () => {
    mockRepo.findByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockReturnValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'password' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.email).toBe('owner@test.il')
  })

  it('returns 401 on wrong password', async () => {
    mockRepo.findByEmail.mockResolvedValue(baseUser)
    mockRepo.verifyPassword.mockReturnValue(false)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('Invalid credentials')
  })

  it('returns 401 when user not found', async () => {
    mockRepo.findByEmail.mockResolvedValue(null)
    mockRepo.verifyPassword.mockReturnValue(false)

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
    mockRepo.findByEmail.mockResolvedValue(tfUser)
    mockRepo.verifyPassword.mockReturnValue(true)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.il', password: 'password' })

    expect(res.status).toBe(200)
    expect(res.body.requiresTwoFactor).toBe(true)
    expect(res.body).toHaveProperty('tempToken')
    expect(res.body).not.toHaveProperty('token')
  })
})

describe('GET /api/auth/me', () => {
  it('returns current user with valid JWT', async () => {
    mockRepo.findById.mockResolvedValue(baseUser)
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

    expect(res.status).toBe(200)
    expect(res.body.secret).toBe('MOCKSECRET32')
    expect(res.body.qrDataUrl).toContain('data:image/png')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/auth/2fa/setup')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/2fa/enable', () => {
  it('enables 2FA with valid code', async () => {
    const userWithSecret: User = { ...baseUser, twoFactorSecret: 'MOCKSECRET32' }
    const updatedUser: User    = { ...userWithSecret, twoFactorEnabled: true }
    mockRepo.findById.mockResolvedValue(userWithSecret)
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
    mockRepo.findById.mockResolvedValue(userWithSecret)
    const token = makeToken()

    const res = await request(app)
      .post('/api/auth/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid code')
  })

  it('returns 400 if setup was not called first', async () => {
    mockRepo.findById.mockResolvedValue(baseUser)
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
    mockRepo.findById.mockResolvedValue(tfUser)
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
    mockRepo.findById.mockResolvedValue(baseUser)
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
    mockRepo.findById.mockResolvedValue(tfUser)

    const tempToken = jwt.sign({ sub: 'u1' }, env.JWT_SECRET, { expiresIn: '5m' })

    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken, code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('token')
    expect(res.body.user.id).toBe('u1')
  })

  it('returns 401 with invalid tempToken', async () => {
    const res = await request(app)
      .post('/api/auth/2fa/verify')
      .send({ tempToken: 'invalid.token', code: '123456' })

    expect(res.status).toBe(401)
  })

  it('returns 400 with wrong TOTP code', async () => {
    const tfUser: User = { ...baseUser, twoFactorEnabled: true, twoFactorSecret: 'MOCKSECRET32' }
    mockRepo.findById.mockResolvedValue(tfUser)

    const tempToken = jwt.sign({ sub: 'u1' }, env.JWT_SECRET, { expiresIn: '5m' })

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
