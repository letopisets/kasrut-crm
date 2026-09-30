import request from 'supertest'
import { createApp } from '../app'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { signMapAccessToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { isEntityId } from '../lib/entityId'

// The public review and suggestion endpoints take a restaurant id from the
// path or body. They now apply the same id rule as the map's by-id reads:
// an id no row can have 404s before any repository call.
jest.mock('../lib/prisma')
jest.mock('../db/mapCommunity.repo')
jest.mock('../lib/tokenBlacklist')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))

const mockRepo = jest.mocked(mapCommunityRepo)
const app = createApp()

const MAP_USER = {
  id: 'mu1',
  email: 'dana@example.com',
  phone: null,
  firstName: 'Dana',
  lastName: null,
  name: 'Dana',
  avatarUrl: null,
  sessionVersion: 0,
  emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
}
const bearer = () => ({
  Authorization: `Bearer ${signMapAccessToken({ sub: MAP_USER.id, name: MAP_USER.name, email: MAP_USER.email, ver: 0 })}`,
})

// Encoded as they would arrive in a URL path.
const BAD_PATH_IDS: Array<[string, string]> = [
  ['too long', 'a'.repeat(65)],
  ['NUL byte', 'r1%00'],
  ['dot', 'r1.json'],
  ['non-ASCII', '%D7%90'],
  ['space', 'r%201'],
  ['quote', "r1'"],
]

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(isTokenBlacklisted).mockResolvedValue(false)
  mockRepo.findUserById.mockResolvedValue(MAP_USER as never)
  mockRepo.restaurantExists.mockResolvedValue(true)
})

describe('isEntityId', () => {
  it.each(['r1', 'r_0123456789abcd', 'r_mach_0123456789ab', 'cmg1x2y3z0000abcd1234', 'a'.repeat(64)])(
    'accepts %s', (id) => { expect(isEntityId(id)).toBe(true) })

  it.each(['', 'a'.repeat(65), 'r1\u0000', 'r 1', 'r1.x', 'א', undefined, 42, ['r1']])(
    'rejects %p', (id) => { expect(isEntityId(id)).toBe(false) })
})

describe('public review endpoints refuse restaurant ids that cannot exist', () => {
  it.each(BAD_PATH_IDS)('GET /reviews 404s for a %s id without a query', async (_label, id) => {
    const res = await request(app).get(`/api/map/restaurants/${id}/reviews`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Restaurant not found' })
    expect(mockRepo.restaurantExists).not.toHaveBeenCalled()
    expect(mockRepo.listReviews).not.toHaveBeenCalled()
  })

  it.each(BAD_PATH_IDS)('GET /reviews/mine 404s for a %s id without a query', async (_label, id) => {
    const res = await request(app).get(`/api/map/restaurants/${id}/reviews/mine`).set(bearer())

    expect(res.status).toBe(404)
    expect(mockRepo.restaurantExists).not.toHaveBeenCalled()
    expect(mockRepo.findOwnReview).not.toHaveBeenCalled()
  })

  it.each(BAD_PATH_IDS)('POST /reviews 404s for a %s id without a write', async (_label, id) => {
    const res = await request(app)
      .post(`/api/map/restaurants/${id}/reviews`)
      .set(bearer())
      .send({ rating: 5, text: 'Great' })

    expect(res.status).toBe(404)
    expect(mockRepo.upsertReview).not.toHaveBeenCalled()
  })

  it('still requires a session before looking at the id', async () => {
    const res = await request(app).post(`/api/map/restaurants/${'a'.repeat(65)}/reviews`).send({ rating: 5 })
    expect(res.status).toBe(401)
  })

  it('serves a well-formed id as before', async () => {
    mockRepo.listReviews.mockResolvedValue({ ratingAvg: null, reviewCount: 0, reviews: [], nextCursor: null } as never)
    mockRepo.findOwnReview.mockResolvedValue(null)

    expect((await request(app).get('/api/map/restaurants/r_mach_0123456789ab/reviews')).status).toBe(200)
    expect(mockRepo.restaurantExists).toHaveBeenCalledWith('r_mach_0123456789ab')

    const mine = await request(app).get('/api/map/restaurants/r1/reviews/mine').set(bearer())
    expect(mine.status).toBe(200)
    expect(mine.body).toEqual({ review: null })
  })
})

describe('POST /api/map/suggestions refuses restaurant ids that cannot exist', () => {
  it.each([
    ['too long', 'a'.repeat(65)],
    ['NUL byte', 'r1\u0000'],
    ['path characters', '../r1'],
  ])('404s for a %s restaurantId without a query', async (_label, restaurantId) => {
    const res = await request(app)
      .post('/api/map/suggestions')
      .set(bearer())
      .send({ type: 'update', restaurantId, notes: 'Closed on Fridays' })

    expect(res.status).toBe(404)
    expect(mockRepo.restaurantExists).not.toHaveBeenCalled()
    expect(mockRepo.createSuggestionWithinQuota).not.toHaveBeenCalled()
  })
})
