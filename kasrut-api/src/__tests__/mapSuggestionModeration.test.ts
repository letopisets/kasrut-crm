import request from 'supertest'
import { createApp } from '../app'
import { signCrmAccessToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { usersRepo } from '../db/users.repo'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { invalidateMapCache } from '../lib/mapCache'
import { invalidateHechsherimCache } from '../lib/crmCache'
import type { User } from '../models/types'

jest.mock('../lib/prisma', () => ({ prisma: {} }))
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('../lib/tokenBlacklist')
jest.mock('../lib/mapCache', () => ({ invalidateMapCache: jest.fn(async () => undefined) }))
jest.mock('../lib/crmCache', () => ({
  ...jest.requireActual('../lib/crmCache'),
  invalidateHechsherimCache: jest.fn(async () => undefined),
}))
jest.mock('../db/users.repo')
jest.mock('../db/mapCommunity.repo')
jest.mock('../db/serviceLogs.repo', () => ({ serviceLogsRepo: { create: jest.fn(async () => undefined) } }))
// otplib ships ESM that ts-jest does not transform; every app-level suite stubs it.
jest.mock('otplib', () => ({ generateSecret: jest.fn(), generateURI: jest.fn(), verifySync: jest.fn() }))

const mockUsers = jest.mocked(usersRepo)
const mockCommunity = jest.mocked(mapCommunityRepo)

const OWNER: User = {
  id: 'u_owner', name: 'Owner', email: 'owner@test.il', passwordHash: 'x', role: 'owner',
  twoFactorEnabled: true, twoFactorBackupCodes: [],
}
const RABBANUT: User = {
  id: 'u_rab', name: 'Rabbanut A', email: 'rab@test.il', passwordHash: 'x', role: 'rabbanut',
  rabbanutId: 'rb_a', twoFactorEnabled: false, twoFactorBackupCodes: [],
}

function tokenFor(user: User) {
  return signCrmAccessToken({
    sub: user.id, role: user.role, name: user.name, email: user.email, ver: 0,
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
  })
}

const ROW = {
  id: 's1', type: 'update', status: 'pending', restaurantId: 'r_a1', mapUserId: 'mu1',
  proposedName: 'New name', proposedAddress: null, proposedCity: null, proposedHechsher: null,
  proposedKashrutStatus: null, proposedFoodType: null, proposedCategory: null, proposedImageUrl: null,
  proposedLat: null, proposedLng: null, notes: null, reviewerNote: null, reviewedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  mapUser: { id: 'mu1', name: 'Dana', email: 'dana@example.com' },
}

const app = createApp()

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(isTokenBlacklisted).mockResolvedValue(false)
  mockUsers.findAuthById.mockImplementation(async id => (id === OWNER.id ? OWNER : id === RABBANUT.id ? RABBANUT : null))
  mockCommunity.listSuggestions.mockResolvedValue([ROW] as never)
  mockCommunity.reviewSuggestion.mockResolvedValue({ ...ROW, status: 'rejected', reviewedAt: new Date() } as never)
})

// A tenant moderator has no business with map users' addresses; the review
// moderation API already withholds them. Only the owner sees the email.
describe('map suggestion moderation: submitter email', () => {
  it('lists the submitter email for the owner', async () => {
    const res = await request(app).get('/api/map/suggestions').set('Authorization', `Bearer ${tokenFor(OWNER)}`)

    expect(res.status).toBe(200)
    expect(res.body[0].user).toEqual({ id: 'mu1', name: 'Dana', email: 'dana@example.com' })
  })

  it('withholds it from a rabbanut moderator, in the list and in the review answer', async () => {
    const list = await request(app).get('/api/map/suggestions').set('Authorization', `Bearer ${tokenFor(RABBANUT)}`)
    const review = await request(app)
      .post('/api/map/suggestions/s1/review')
      .set('Authorization', `Bearer ${tokenFor(RABBANUT)}`)
      .send({ status: 'rejected' })

    expect(list.status).toBe(200)
    expect(list.body[0].user).toEqual({ id: 'mu1', name: 'Dana' })
    expect(review.status).toBe(200)
    expect(review.body.user).toEqual({ id: 'mu1', name: 'Dana' })
    expect(JSON.stringify([list.body, review.body])).not.toContain('dana@example.com')
  })
})

describe('map suggestion moderation: caches', () => {
  it('drops the CRM hechsher lists as well as the map cache on approval', async () => {
    mockCommunity.reviewSuggestion.mockResolvedValue({ ...ROW, status: 'approved', reviewedAt: new Date() } as never)

    const res = await request(app)
      .post('/api/map/suggestions/s1/review')
      .set('Authorization', `Bearer ${tokenFor(RABBANUT)}`)
      .send({ status: 'approved' })

    expect(res.status).toBe(200)
    expect(invalidateMapCache).toHaveBeenCalledTimes(1)
    expect(invalidateHechsherimCache).toHaveBeenCalledTimes(1)
  })

  it('leaves the caches alone on rejection', async () => {
    const res = await request(app)
      .post('/api/map/suggestions/s1/review')
      .set('Authorization', `Bearer ${tokenFor(RABBANUT)}`)
      .send({ status: 'rejected' })

    expect(res.status).toBe(200)
    expect(invalidateMapCache).not.toHaveBeenCalled()
    expect(invalidateHechsherimCache).not.toHaveBeenCalled()
  })
})
