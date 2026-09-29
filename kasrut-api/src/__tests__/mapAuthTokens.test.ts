import request from 'supertest'
import bcrypt from 'bcryptjs'
import { createApp } from '../app'
import { mapCommunityRepo, type MapAuthUserRow } from '../db/mapCommunity.repo'
import { verifyCrmAccessToken, verifyMapAccessToken, verifyTwoFactorPendingToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { verifyOAuthIdToken } from '../services/mapOAuth.service'

// Every map sign-in flow must issue a token signed for the map-access purpose:
// one minted with another purpose's key would lock every map user out while
// the middleware tests (which mint their own tokens) kept passing.
jest.mock('../lib/prisma')
jest.mock('../db/mapCommunity.repo')
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
