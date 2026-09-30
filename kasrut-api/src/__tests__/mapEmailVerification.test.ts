import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import { createApp } from '../app'
import { mapAuthController } from '../controllers/mapAuth.controller'
import { env } from '../config/env'
import { mapCommunityRepo, type MapAuthUserRow } from '../db/mapCommunity.repo'
import { signMapAccessToken } from '../lib/jwt'
import { logger } from '../lib/logger'
import { resetLoginThrottleMemory } from '../lib/loginThrottle'
import { sendMapEmailVerification } from '../lib/mailer'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { serviceLogsRepo } from '../db/serviceLogs.repo'
import { resetRateLimitMemory } from '../middleware/rateLimit'
import { serviceLogger } from '../middleware/serviceLogger'
import { mailboxKey } from '../services/mapEmailVerification.service'

jest.mock('../lib/prisma')
jest.mock('../db/mapCommunity.repo')
// Refresh-token storage; its behaviour is covered in refreshTokens.test.ts.
jest.mock('../db/refreshTokens.repo')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/tokenBlacklist')
jest.mock('../lib/mailer')
jest.mock('../db/serviceLogs.repo', () => ({ serviceLogsRepo: { create: jest.fn() } }))
// bcrypt at the real cost takes ~300 ms per registration, and the budget tests
// register a dozen accounts: past Jest's timeout, their requests would still
// be sending mail during the next test.
jest.mock('../services/mapPassword.service', () => ({
  ...jest.requireActual('../services/mapPassword.service'),
  hashPassword: jest.fn(async () => 'bcrypt-hash'),
}))
// Loaded through the CRM routes that createApp mounts; ships as ESM.
jest.mock('otplib', () => ({}))

const mockRepo = jest.mocked(mapCommunityRepo)
const mockSendVerification = jest.mocked(sendMapEmailVerification)
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)
const mockServiceLog = jest.mocked(serviceLogsRepo.create)

const app = createApp()
const PASSWORD = 'Passw0rd123'
const DAY_MS = 24 * 60 * 60 * 1000

const unverifiedUser: MapAuthUserRow = {
  id:              'map-user-new',
  email:           'new@example.com',
  phone:           '+972500000001',
  firstName:       'New',
  lastName:        'User',
  name:            'New User',
  avatarUrl:       null,
  sessionVersion:  0,
  emailVerifiedAt: null,
  passwordHash:    bcrypt.hashSync(PASSWORD, 4),
}

const verifiedUser: MapAuthUserRow = {
  ...unverifiedUser,
  id:              'map-user-verified',
  email:           'verified@example.com',
  emailVerifiedAt: new Date('2026-09-01T00:00:00Z'),
}

// Fresh address per request: the IP limiters must not decide these tests
// unless a test is about them.
let ipSeq = 0
const nextIp = () => `2001:db8:${(ipSeq++).toString(16)}::1`

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function bearer(user: Pick<MapAuthUserRow, 'id' | 'name' | 'email' | 'sessionVersion'>): string {
  return `Bearer ${signMapAccessToken({ sub: user.id, name: user.name, email: user.email, ver: user.sessionVersion })}`
}

function register(email = unverifiedUser.email, ip = nextIp()) {
  return request(app)
    .post('/api/map-auth/register')
    .set('X-Forwarded-For', ip)
    .send({
      firstName: unverifiedUser.firstName,
      lastName:  unverifiedUser.lastName,
      email,
      phone:     unverifiedUser.phone,
      password:  PASSWORD,
    })
}

// The token the last verification email carried, read back from its link.
function lastMailedToken(): string {
  const { link } = mockSendVerification.mock.lastCall![0]
  const token = new URL(link).searchParams.get('verifyEmail')
  if (!token) throw new Error(`no token in ${link}`)
  return token
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve))

beforeEach(() => {
  mockIsTokenBlacklisted.mockResolvedValue(false)
  mockSendVerification.mockResolvedValue(undefined)
  mockServiceLog.mockResolvedValue(undefined)
  mockRepo.createPasswordUser.mockImplementation(async input => ({ ...unverifiedUser, email: input.email }))
  mockRepo.findUserById.mockImplementation(async id => [unverifiedUser, verifiedUser].find(u => u.id === id) ?? null)
  resetLoginThrottleMemory()
  resetRateLimitMemory()
  jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', 'required')
  jest.replaceProperty(env, 'SMTP_CONFIGURED', true)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('password registration', () => {
  it('creates the account unverified with a 24-hour token and emails the link', async () => {
    const before = Date.now()
    const res = await register()

    expect(res.status).toBe(201)
    expect(res.body.user.emailVerified).toBe(false)

    const input = mockRepo.createPasswordUser.mock.calls[0][0]
    expect(input.emailVerification).toEqual({ tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/), expiresAt: expect.any(Date) })
    const expiresAt = input.emailVerification!.expiresAt.getTime()
    expect(expiresAt).toBeGreaterThanOrEqual(before + DAY_MS)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + DAY_MS)

    expect(mockSendVerification).toHaveBeenCalledTimes(1)
    const mail = mockSendVerification.mock.calls[0][0]
    // Only the address and the link: the name is text the registrant chose.
    expect(Object.keys(mail).sort()).toEqual(['link', 'recipientEmail'])
    expect(mail.recipientEmail).toBe(unverifiedUser.email)
    // 32 random bytes, base64url: 43 characters.
    expect(mail.link).toMatch(/^https:\/\/mykoshermap\.com\/\?verifyEmail=[A-Za-z0-9_-]{43}$/)
    const token = lastMailedToken()
    expect(sha256(token)).toBe(input.emailVerification!.tokenHash)
    expect(JSON.stringify(res.body)).not.toContain(token)
  })

  it('builds the link from MAP_PUBLIC_URL', async () => {
    jest.replaceProperty(env, 'MAP_PUBLIC_URL', 'https://staging.example.org')
    await register()
    expect(mockSendVerification.mock.calls[0][0].link).toMatch(/^https:\/\/staging\.example\.org\/\?verifyEmail=/)
  })

  it('answers without waiting for the mail server', async () => {
    mockSendVerification.mockReturnValue(new Promise(() => {}))
    const res = await register()
    expect(res.status).toBe(201)
  })

  it('logs a delivery failure without the token or the link', async () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    mockSendVerification.mockRejectedValue(new Error('connect ECONNREFUSED'))

    expect((await register()).status).toBe(201)
    await flushPromises()

    const token = lastMailedToken()
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ mapUserId: unverifiedUser.id }),
      'Map email verification delivery failed',
    )
    expect(JSON.stringify(logged.mock.calls)).not.toContain(token)
  })

  it('issues nothing while verification is off and no mail server is configured', async () => {
    jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', 'off')
    jest.replaceProperty(env, 'SMTP_CONFIGURED', false)

    const res = await register()

    expect(res.status).toBe(201)
    expect(res.body.user.emailVerified).toBe(false)
    expect(mockRepo.createPasswordUser.mock.calls[0][0].emailVerification).toBeNull()
    expect(mockSendVerification).not.toHaveBeenCalled()
  })

  it('still sends the link while verification is off if a mail server is configured', async () => {
    jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', 'off')

    await register()

    expect(mockRepo.createPasswordUser.mock.calls[0][0].emailVerification).not.toBeNull()
    expect(mockSendVerification).toHaveBeenCalledTimes(1)
  })
})

describe('verification mail budget', () => {
  it('sends at most 10 per hour from one client address, still creating the accounts', async () => {
    const warned = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const ip = '203.0.113.50'
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) statuses.push((await register(`person${i}@example.com`, ip)).status)

    // Same answer throughout: the budget does not reveal itself to the client.
    expect(statuses.every(status => status === 201)).toBe(true)
    expect(mockRepo.createPasswordUser).toHaveBeenCalledTimes(12)
    expect(mockSendVerification).toHaveBeenCalledTimes(10)
    expect(warned).toHaveBeenCalledWith({ mapUserId: unverifiedUser.id }, 'Map email verification not sent: mail budget used up')
  })

  it('sends at most 5 per day to one mailbox, whatever +tag, dots or client address', async () => {
    const aliases = [
      'victim@gmail.com', 'victim+1@gmail.com', 'v.i.c.t.i.m@gmail.com', 'Victim+x@GoogleMail.com',
      'vic.tim+2@gmail.com', 'victim+3@gmail.com', 'victim+4@gmail.com',
    ]
    for (const email of aliases) expect((await register(email)).status).toBe(201)

    expect(mockSendVerification).toHaveBeenCalledTimes(5)
    // Another mailbox is unaffected.
    await register('someone.else@gmail.com')
    expect(mockSendVerification).toHaveBeenCalledTimes(6)
  })

  it('is shared with resend', async () => {
    const ip = '203.0.113.51'
    for (let i = 0; i < 10; i += 1) await register(`batch${i}@example.com`, ip)
    expect(mockSendVerification).toHaveBeenCalledTimes(10)

    const res = await request(app)
      .post('/api/map-auth/verify-email/resend')
      .set('X-Forwarded-For', ip)
      .set('Authorization', bearer(unverifiedUser))

    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
    expect(mockRepo.createEmailVerificationToken).not.toHaveBeenCalled()
    expect(mockSendVerification).toHaveBeenCalledTimes(10)
  })
})

describe('mailboxKey', () => {
  it.each([
    ['victim+news@gmail.com', 'victim@gmail.com'],
    ['V.I.C.T.I.M@gmail.com', 'victim@gmail.com'],
    ['victim@googlemail.com', 'victim@gmail.com'],
    ['first.last+tag@example.com', 'first.last@example.com'],
    ['USER@Example.COM', 'user@example.com'],
  ])('puts %s in the mailbox of %s', (alias, canonical) => {
    expect(mailboxKey(alias)).toBe(mailboxKey(canonical))
  })

  it('keeps dots outside Gmail and never holds the address', () => {
    expect(mailboxKey('first.last@example.com')).not.toBe(mailboxKey('firstlast@example.com'))
    expect(mailboxKey('victim@gmail.com')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('POST /api/map-auth/verify-email', () => {
  const verify = (body: unknown) => request(app)
    .post('/api/map-auth/verify-email')
    .set('X-Forwarded-For', nextIp())
    .send(body as object)

  const owner = { id: unverifiedUser.id, email: unverifiedUser.email }

  it('consumes the token by its hash, without a session', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'verified', user: owner })
    const token = 'A'.repeat(43)

    const res = await verify({ token })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(mockRepo.consumeEmailVerificationToken).toHaveBeenCalledWith(sha256(token))
  })

  it('says so when the account is verified already', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'already_verified', user: owner })

    const res = await verify({ token: 'A'.repeat(43) })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, alreadyVerified: true })
  })

  it('refuses a used, expired or unknown token', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'invalid', user: null })

    const res = await verify({ token: 'B'.repeat(43) })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid or expired verification link' })
  })

  // Mounted at the app level, where serviceLogger sees the full path.
  const audited = express()
  audited.use(express.json())
  audited.use(serviceLogger)
  audited.post('/api/map-auth/verify-email', mapAuthController.verifyEmail)
  const verifyAudited = (token: string) => request(audited).post('/api/map-auth/verify-email').send({ token })

  it('names the account in the service log on success', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'verified', user: owner })

    await verifyAudited('A'.repeat(43))
    await flushPromises()

    expect(mockServiceLog).toHaveBeenCalledWith(expect.objectContaining({
      path:       '/api/map-auth/verify-email',
      statusCode: 200,
      userId:     owner.id,
      userEmail:  owner.email,
      userRole:   'map_user',
      message:    'Map email verified',
    }))
  })

  it('names the account of a failed link in the service log', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'invalid', user: owner })

    await verifyAudited('B'.repeat(43))
    await flushPromises()

    expect(mockServiceLog).toHaveBeenCalledWith(expect.objectContaining({
      level:      'warn',
      statusCode: 400,
      userId:     owner.id,
      userRole:   'auth_attempt',
      message:    'Map email verification failed',
    }))
    expect(JSON.stringify(mockServiceLog.mock.calls)).not.toContain('B'.repeat(43))
  })

  it.each([[{}], [{ token: 'short' }], [{ token: 'x'.repeat(161) }], [{ token: 42 }]])(
    'rejects the malformed body %j without a lookup',
    async body => {
      expect((await verify(body)).status).toBe(400)
      expect(mockRepo.consumeEmailVerificationToken).not.toHaveBeenCalled()
    },
  )

  it('shares the password-reset budget per address', async () => {
    mockRepo.consumeEmailVerificationToken.mockResolvedValue({ status: 'invalid', user: null })
    const ip = '198.51.100.77'
    const statuses: number[] = []
    for (let i = 0; i < 11; i += 1) {
      const res = await request(app).post('/api/map-auth/verify-email').set('X-Forwarded-For', ip).send({ token: 'C'.repeat(43) })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 10).every(status => status === 400)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('POST /api/map-auth/verify-email/resend', () => {
  const resend = (user: MapAuthUserRow, ip = nextIp()) => request(app)
    .post('/api/map-auth/verify-email/resend')
    .set('X-Forwarded-For', ip)
    .set('Authorization', bearer(user))

  // Every test here gets its own account and mailbox, so the per-account and
  // per-mailbox budgets start full.
  let userSeq = 0
  const accounts = new Map<string, MapAuthUserRow>()
  function freshUnverified(): MapAuthUserRow {
    const n = userSeq++
    const user = { ...unverifiedUser, id: `map-user-resend-${n}`, email: `resend-${n}@example.com` }
    accounts.set(user.id, user)
    mockRepo.findUserById.mockImplementation(async id => accounts.get(id) ?? null)
    return user
  }

  it('retires older links, issues a new one and mails it', async () => {
    const user = freshUnverified()

    const res = await resend(user)

    expect(res.status).toBe(204)
    expect(mockRepo.createEmailVerificationToken).toHaveBeenCalledWith({
      mapUserId: user.id,
      tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      expiresAt: expect.any(Date),
    })
    expect(mockSendVerification).toHaveBeenCalledWith(expect.objectContaining({ recipientEmail: user.email }))
    const { tokenHash } = mockRepo.createEmailVerificationToken.mock.calls[0][0]
    expect(sha256(lastMailedToken())).toBe(tokenHash)
  })

  it('does nothing for a verified account', async () => {
    const res = await resend(verifiedUser)

    expect(res.status).toBe(204)
    expect(mockRepo.createEmailVerificationToken).not.toHaveBeenCalled()
    expect(mockSendVerification).not.toHaveBeenCalled()
  })

  it('does nothing while no mail can go out', async () => {
    jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', 'off')
    jest.replaceProperty(env, 'SMTP_CONFIGURED', false)

    expect((await resend(freshUnverified())).status).toBe(204)
    expect(mockRepo.createEmailVerificationToken).not.toHaveBeenCalled()
    expect(mockSendVerification).not.toHaveBeenCalled()
  })

  it('needs a map session', async () => {
    const res = await request(app).post('/api/map-auth/verify-email/resend').set('X-Forwarded-For', nextIp())
    expect(res.status).toBe(401)
  })

  it('allows three per hour per account, whatever the address', async () => {
    const user = freshUnverified()
    const statuses = []
    for (let i = 0; i < 4; i += 1) statuses.push((await resend(user)).status)

    expect(statuses).toEqual([204, 204, 204, 429])
    expect(mockSendVerification).toHaveBeenCalledTimes(3)
  })

  it('refuses past the mailbox budget, without issuing a link', async () => {
    const user = freshUnverified()
    for (let i = 0; i < 5; i += 1) await register(user.email)
    expect(mockSendVerification).toHaveBeenCalledTimes(5)

    const res = await resend(user)

    expect(res.status).toBe(429)
    expect(mockRepo.createEmailVerificationToken).not.toHaveBeenCalled()
  })

  it('caps one address across accounts', async () => {
    const ip = '198.51.100.88'
    const statuses = []
    for (let i = 0; i < 11; i += 1) statuses.push((await resend(freshUnverified(), ip)).status)

    expect(statuses.slice(0, 10).every(status => status === 204)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('verified email required for reviews and suggestions', () => {
  const postSuggestion = (user: MapAuthUserRow) => request(app)
    .post('/api/map/suggestions')
    .set('X-Forwarded-For', nextIp())
    .set('Authorization', bearer(user))
    .send({})
  const postReview = (user: MapAuthUserRow) => request(app)
    .post('/api/map/restaurants/r1/reviews')
    .set('X-Forwarded-For', nextIp())
    .set('Authorization', bearer(user))
    .send({ rating: 0 })

  it.each([['suggestion', postSuggestion], ['review', postReview]])(
    'refuses a %s from an unverified account while required',
    async (_label, post) => {
      const res = await post(unverifiedUser)

      expect(res.status).toBe(403)
      expect(res.body).toEqual({ error: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' })
      expect(mockRepo.createSuggestionWithinQuota).not.toHaveBeenCalled()
      expect(mockRepo.upsertReview).not.toHaveBeenCalled()
    },
  )

  // The payloads are invalid on purpose: a 400 shows the controller ran.
  it.each([['suggestion', postSuggestion], ['review', postReview]])(
    'lets a verified account post a %s',
    async (_label, post) => {
      expect((await post(verifiedUser)).status).toBe(400)
    },
  )

  it.each([['suggestion', postSuggestion], ['review', postReview]])(
    'lets an unverified account post a %s while verification is off',
    async (_label, post) => {
      jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', 'off')
      expect((await post(unverifiedUser)).status).toBe(400)
    },
  )

  it('reads the database on every request, not a value frozen into the token', async () => {
    const authorization = bearer(unverifiedUser)
    const post = () => request(app)
      .post('/api/map/restaurants/r1/reviews')
      .set('X-Forwarded-For', nextIp())
      .set('Authorization', authorization)
      .send({ rating: 0 })

    expect((await post()).status).toBe(403)
    mockRepo.findUserById.mockResolvedValue({ ...unverifiedUser, emailVerifiedAt: new Date() })
    expect((await post()).status).toBe(400)
    // One lookup per request: the one authenticateMapJWT makes anyway.
    expect(mockRepo.findUserById).toHaveBeenCalledTimes(2)
  })
})

describe('emailVerified in auth responses', () => {
  it.each([[unverifiedUser, false], [verifiedUser, true]] as const)('/me for %#', async (user, expected) => {
    const res = await request(app).get('/api/map-auth/me').set('Authorization', bearer(user))
    expect(res.status).toBe(200)
    expect(res.body.emailVerified).toBe(expected)
  })

  it('login', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(verifiedUser)
    const res = await request(app)
      .post('/api/map-auth/login')
      .set('X-Forwarded-For', nextIp())
      .send({ email: verifiedUser.email, password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user.emailVerified).toBe(true)
  })

  it.each([['required'], ['off']] as const)('/config reports verification %s', async mode => {
    jest.replaceProperty(env, 'MAP_EMAIL_VERIFICATION', mode)
    const res = await request(app).get('/api/map-auth/config')
    expect(res.body.emailVerification).toBe(mode)
  })
})

// The email reset channel takes an address. Anything else used to be looked
// up, and stored as the attempt's userEmail in service_logs (kept 90 days,
// shown to every owner): a password typed into the field, say.
describe('POST /api/map-auth/password-reset/request identifier', () => {
  const requestReset = (body: Record<string, unknown>) => request(app)
    .post('/api/map-auth/password-reset/request')
    .set('X-Forwarded-For', nextIp())
    .send(body)

  it('refuses a non-address identifier on the email channel without a lookup or a stored copy', async () => {
    const res = await requestReset({ channel: 'email', identifier: 'mysecretpassw0rd!' })
    await new Promise(resolve => setImmediate(resolve))

    expect(res.status).toBe(400)
    expect(mockRepo.findUserByResetIdentifier).not.toHaveBeenCalled()
    expect(JSON.stringify(mockServiceLog.mock.calls)).not.toContain('mysecretpassw0rd')
  })

  it('still answers an address with the generic response', async () => {
    mockRepo.findUserByResetIdentifier.mockResolvedValue(null)

    const res = await requestReset({ channel: 'email', identifier: 'Nobody@Example.com' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true })
    expect(mockRepo.findUserByResetIdentifier).toHaveBeenCalledWith('email', 'nobody@example.com')
  })
})
