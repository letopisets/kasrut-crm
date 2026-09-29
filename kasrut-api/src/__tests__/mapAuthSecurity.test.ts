import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../config/env'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { signCrmAccessToken, signMapAccessToken, signTwoFactorPendingToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { authenticateMapJWT } from '../middleware/mapAuth'
import { signWithPurposeKey } from './jwtTestUtils'

jest.mock('../lib/prisma')
jest.mock('../db/mapCommunity.repo')
jest.mock('../lib/tokenBlacklist')

const mockMapCommunityRepo = jest.mocked(mapCommunityRepo)
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)

const app = express()
app.get('/private', authenticateMapJWT, (req, res) => {
  res.json({ user: req.mapUser })
})

const currentUser = {
  id: 'map-user-1',
  email: 'user@example.com',
  phone: null,
  firstName: 'Map',
  lastName: 'User',
  name: 'Map User',
  avatarUrl: null,
  sessionVersion: 3,
}

const mapClaims = {
  sub: currentUser.id,
  name: currentUser.name,
  email: currentUser.email,
  ver: currentUser.sessionVersion,
  jti: 'session-1',
}

function signMapToken(): string {
  return signMapAccessToken(mapClaims)
}

// Correctly keyed for the map audience, but with claims the helper never emits.
function signMalformedMapToken(overrides: Record<string, unknown>): string {
  return signWithPurposeKey('map-access', { ...mapClaims, typ: 'map_user', ...overrides })
}

beforeEach(() => {
  mockMapCommunityRepo.findUserById.mockResolvedValue(currentUser)
  mockIsTokenBlacklisted.mockResolvedValue(false)
})

describe('public map session validation', () => {
  it('accepts a current, non-revoked map session', async () => {
    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMapToken()}`)

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      sub: currentUser.id,
      ver: currentUser.sessionVersion,
      jti: 'session-1',
    })
  })

  it.each([
    ['a session version', { ver: undefined }],
    ['a token id', { jti: undefined }],
    ['the map_user type marker', { typ: 'crm' }],
  ])('rejects a signed token without %s', async (_label, overrides) => {
    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMalformedMapToken(overrides)}`)

    expect(response.status).toBe(401)
    expect(mockMapCommunityRepo.findUserById).not.toHaveBeenCalled()
  })

  it.each([
    ['a CRM access token', () => signCrmAccessToken({ sub: currentUser.id, role: 'owner', name: 'Owner', email: 'o@crm.il', ver: 3 })],
    ['a pre-2FA token', () => signTwoFactorPendingToken({ sub: currentUser.id })],
    ['a legacy token signed with the raw JWT_SECRET', () => jwt.sign(
      { sub: currentUser.id, typ: 'map_user', name: currentUser.name, email: currentUser.email, ver: 3, jti: 'session-1' },
      env.JWT_SECRET,
      { expiresIn: '1h' },
    )],
  ])('rejects %s', async (_label, mint) => {
    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${mint()}`)

    expect(response.status).toBe(401)
    expect(mockMapCommunityRepo.findUserById).not.toHaveBeenCalled()
  })

  it('rejects a token after the server-side session version changes', async () => {
    mockMapCommunityRepo.findUserById.mockResolvedValue({
      ...currentUser,
      sessionVersion: currentUser.sessionVersion + 1,
    })

    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMapToken()}`)

    expect(response.status).toBe(401)
    expect(response.body.error).toMatch(/revoked/i)
  })

  it('rejects an explicitly blacklisted token before loading the user', async () => {
    mockIsTokenBlacklisted.mockResolvedValue(true)

    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMapToken()}`)

    expect(response.status).toBe(401)
    expect(response.body.error).toMatch(/revoked/i)
    expect(mockMapCommunityRepo.findUserById).not.toHaveBeenCalled()
  })

  it('rejects a token for a deleted map account', async () => {
    mockMapCommunityRepo.findUserById.mockResolvedValue(null)

    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMapToken()}`)

    expect(response.status).toBe(401)
  })
})
