import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../app'
import { mapCommunityRepo, type MapAuthUserRow } from '../db/mapCommunity.repo'
import { verifyCrmAccessToken, verifyMapAccessToken, verifyTwoFactorPendingToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { resetLoginThrottleMemory } from '../lib/loginThrottle'
import { verifyOAuthIdToken } from '../services/mapOAuth.service'
import { DUMMY_PASSWORD_HASH, hashPassword } from '../services/mapPassword.service'

// Every map sign-in flow must issue a token signed for the map-access purpose:
// one minted with another purpose's key would lock every map user out while
// the middleware tests (which mint their own tokens) kept passing.
jest.mock('../lib/prisma')
jest.mock('../db/mapCommunity.repo')
// Refresh-token storage; its behaviour is covered in refreshTokens.test.ts.
jest.mock('../db/refreshTokens.repo')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/tokenBlacklist')
jest.mock('../services/mapOAuth.service', () => ({
  ...jest.requireActual('../services/mapOAuth.service'),
  verifyOAuthIdToken: jest.fn(),
}))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockRepo = jest.mocked(mapCommunityRepo)
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)
const mockVerifyOAuthIdToken = jest.mocked(verifyOAuthIdToken)

const app = createApp()
const PASSWORD = 'Passw0rd123'

const mapUser: MapAuthUserRow = {
  id:             'map-user-1',
  email:          'user@example.com',
  phone:          '+972500000000',
  firstName:      'Map',
  lastName:       'User',
  name:           'Map User',
  avatarUrl:      null,
  sessionVersion: 4,
  passwordHash:   bcrypt.hashSync(PASSWORD, 4),
}

beforeEach(() => {
  mockIsTokenBlacklisted.mockResolvedValue(false)
  mockRepo.findUserById.mockResolvedValue(mapUser)
  resetLoginThrottleMemory()
})

// The issued token verifies only as a map session, and the map middleware
// accepts it on a protected route.
async function expectMapSessionToken(token: string): Promise<void> {
  expect(verifyMapAccessToken(token)).toMatchObject({
    sub:  mapUser.id,
    typ:  'map_user',
    ver:  mapUser.sessionVersion,
  })
  expect(() => verifyCrmAccessToken(token)).toThrow()
  expect(() => verifyTwoFactorPendingToken(token)).toThrow()

  const me = await request(app).get('/api/map-auth/me').set('Authorization', `Bearer ${token}`)
  expect(me.status).toBe(200)
  expect(me.body.id).toBe(mapUser.id)
}

describe('map auth flows issue map-access tokens', () => {
  it('password login', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(mapUser)

    const res = await request(app)
      .post('/api/map-auth/login')
      .send({ email: mapUser.email, password: PASSWORD })

    expect(res.status).toBe(200)
    await expectMapSessionToken(res.body.token)
  })

  it('registration', async () => {
    mockRepo.createPasswordUser.mockResolvedValue(mapUser)

    const res = await request(app)
      .post('/api/map-auth/register')
      .send({
        firstName: 'Map',
        lastName:  'User',
        email:     mapUser.email,
        phone:     mapUser.phone,
        password:  PASSWORD,
      })

    expect(res.status).toBe(201)
    await expectMapSessionToken(res.body.token)
  })

  it('OAuth sign-in', async () => {
    mockVerifyOAuthIdToken.mockResolvedValue({
      provider:       'google',
      providerUserId: 'google-sub-1',
      email:          mapUser.email,
      name:           mapUser.name,
    })
    mockRepo.upsertUserFromIdentity.mockResolvedValue(mapUser)

    const res = await request(app)
      .post('/api/map-auth/oauth')
      .send({ provider: 'google', idToken: 'x'.repeat(40) })

    expect(res.status).toBe(200)
    await expectMapSessionToken(res.body.token)
  })
})

describe('map password login hardening', () => {
  // Several requests (and real cost-12 bcrypt compares) per test.
  const SLOW_TEST_MS = 30_000

  // Fresh address per request: the lock follows the account, not the IP.
  let ipSeq = 0
  const nextIp = () => `2001:db8:${(ipSeq++).toString(16)}::1`
  const login = (email: string, password: string) => request(app)
    .post('/api/map-auth/login')
    .set('X-Forwarded-For', nextIp())
    .send({ email, password })

  let clock: jest.SpyInstance
  beforeEach(() => { clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now()) })
  afterEach(() => { clock.mockRestore() })

  it('locks after five free failures without comparing the password while locked', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(mapUser)
    for (let i = 0; i < 6; i += 1) expect((await login(mapUser.email, 'Wrong0000')).status).toBe(401)

    mockRepo.findAuthUserByEmail.mockClear()
    const compare = jest.spyOn(bcrypt, 'compare')
    try {
      const res = await login(' USER@example.com ', PASSWORD)

      expect(res.status).toBe(429)
      expect(res.body).toEqual({ error: 'Too many attempts. Try again later.' })
      expect(res.headers['retry-after']).toBe('60')
      expect(mockRepo.findAuthUserByEmail).not.toHaveBeenCalled()
      expect(compare).not.toHaveBeenCalled()
    } finally {
      compare.mockRestore()
    }
  }, SLOW_TEST_MS)

  it('locks an unknown email with the identical response', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(mapUser)
    for (let i = 0; i < 6; i += 1) await login(mapUser.email, 'Wrong0000')
    mockRepo.findAuthUserByEmail.mockResolvedValue(null)
    for (let i = 0; i < 6; i += 1) expect((await login('nobody@example.com', 'Wrong0000')).status).toBe(401)

    const real = await login(mapUser.email, 'Wrong0000')
    const unknown = await login('nobody@example.com', 'Wrong0000')

    expect(real.status).toBe(429)
    expect(unknown.status).toBe(429)
    expect(unknown.body).toEqual(real.body)
    expect(unknown.headers['retry-after']).toBe(real.headers['retry-after'])
  }, SLOW_TEST_MS)

  it('clears the failure count on a successful login', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(mapUser)
    for (let i = 0; i < 5; i += 1) await login(mapUser.email, 'Wrong0000')
    expect((await login(mapUser.email, PASSWORD)).status).toBe(200)

    for (let i = 0; i < 6; i += 1) expect((await login(mapUser.email, 'Wrong0000')).status).toBe(401)
    expect((await login(mapUser.email, PASSWORD)).status).toBe(429)
  }, SLOW_TEST_MS)

  it('lets only the free attempts plus one of a parallel burst reach the password check', async () => {
    // As slow as a real lookup + compare, so the whole burst is in flight at once.
    mockRepo.findAuthUserByEmail.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mapUser), 100)))

    const burst = await Promise.all(Array.from({ length: 20 }, () => login(mapUser.email, 'Wrong0000')))

    expect(burst.filter(res => res.status === 401)).toHaveLength(6)
    expect(burst.filter(res => res.status === 429)).toHaveLength(14)
    expect(mockRepo.findAuthUserByEmail).toHaveBeenCalledTimes(6)
  }, SLOW_TEST_MS)

  it('lifts the lock once a password reset proves control of the account', async () => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(mapUser)
    for (let i = 0; i < 6; i += 1) await login(mapUser.email, 'Wrong0000')
    expect((await login(mapUser.email, PASSWORD)).status).toBe(429)

    mockRepo.hasValidPasswordResetToken.mockResolvedValue(true)
    mockRepo.consumePasswordResetToken.mockResolvedValue(mapUser)
    const reset = await request(app)
      .post('/api/map-auth/password-reset/confirm')
      .set('X-Forwarded-For', nextIp())
      .send({ token: 'r'.repeat(40), password: PASSWORD })
    expect(reset.status).toBe(200)

    expect((await login(mapUser.email, PASSWORD)).status).toBe(200)
  }, SLOW_TEST_MS)

  it.each([
    ['an unknown email', null],
    ['an OAuth-only account', { ...mapUser, passwordHash: null }],
  ])('spends a dummy bcrypt compare for %s', async (_label, row) => {
    mockRepo.findAuthUserByEmail.mockResolvedValue(row)
    const compare = jest.spyOn(bcrypt, 'compare')
    try {
      const res = await login(mapUser.email, PASSWORD)

      expect(res.status).toBe(401)
      expect(res.body).toEqual({ error: 'Invalid email or password' })
      expect(compare).toHaveBeenCalledTimes(1)
      expect(compare.mock.calls[0]).toEqual([PASSWORD, DUMMY_PASSWORD_HASH])
      await expect(compare.mock.results[0].value).resolves.toBe(false)
    } finally {
      compare.mockRestore()
    }
  }, SLOW_TEST_MS)

  it('keeps the dummy hash at the cost real map hashes use', async () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(bcrypt.getRounds(await hashPassword('x')))
  }, SLOW_TEST_MS)
})
