import express from 'express'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { env } from '../config/env'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { authenticateMapJWT } from '../middleware/mapAuth'

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

function signMapToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign({
    sub: currentUser.id,
    typ: 'map_user',
    name: currentUser.name,
    email: currentUser.email,
    ver: currentUser.sessionVersion,
    jti: 'session-1',
    ...overrides,
  }, env.JWT_SECRET, { expiresIn: '1h' })
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
  ])('rejects a signed token without %s', async (_label, overrides) => {
    const response = await request(app)
      .get('/private')
      .set('Authorization', `Bearer ${signMapToken(overrides)}`)

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
