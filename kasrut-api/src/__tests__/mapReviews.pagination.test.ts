import request from 'supertest'
import { createApp } from '../app'
import { signMapAccessToken } from '../lib/jwt'
import { prisma } from '../lib/prisma'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { decodeReviewCursor, encodeReviewCursor } from '../controllers/mapReview.controller'

jest.mock('../lib/prisma', () => ({
  prisma: {
    restaurant: { findFirst: jest.fn() },
    mapRestaurantReview: { findMany: jest.fn(), aggregate: jest.fn(), findUnique: jest.fn() },
    mapUser: { findUnique: jest.fn() },
  },
}))
jest.mock('../lib/tokenBlacklist')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockPrisma = prisma as unknown as {
  restaurant: { findFirst: jest.Mock }
  mapRestaurantReview: { findMany: jest.Mock; aggregate: jest.Mock; findUnique: jest.Mock }
  mapUser: { findUnique: jest.Mock }
}
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)

interface ReviewRow {
  id: string
  restaurantId: string
  mapUserId: string
  rating: number
  text: string | null
  createdAt: Date
  updatedAt: Date
  mapUser: { id: string; name: string; avatarUrl: string | null }
}

const T1 = new Date('2026-09-01T10:00:00.000Z')
const T2 = new Date('2026-09-02T10:00:00.000Z')
const T3 = new Date('2026-09-03T10:00:00.000Z')
const T4 = new Date('2026-09-04T10:00:00.000Z')

function row(id: string, restaurantId: string, rating: number, createdAt: Date): ReviewRow {
  return {
    id,
    restaurantId,
    mapUserId: `u_${id}`,
    rating,
    text: `text ${id}`,
    createdAt,
    updatedAt: createdAt,
    mapUser: { id: `u_${id}`, name: `User ${id}`, avatarUrl: null },
  }
}

// rv02–rv04 and rv06–rv07 share a createdAt, so id has to break the tie.
const ROWS: ReviewRow[] = [
  row('rv01', 'r1', 5, T1),
  row('rv02', 'r1', 4, T2),
  row('rv03', 'r1', 3, T2),
  row('rv04', 'r1', 1, T2),
  row('rv05', 'r1', 2, T3),
  row('rv06', 'r1', 5, T4),
  row('rv07', 'r1', 4, T4),
  row('rv08', 'r2', 1, T4),
]
const R1_NEWEST_FIRST = ['rv07', 'rv06', 'rv05', 'rv04', 'rv03', 'rv02', 'rv01']
const R1_AVG = (5 + 4 + 3 + 1 + 2 + 5 + 4) / 7

// ── Minimal in-memory interpreter for the Prisma calls listReviews makes ────
// Unknown filter shapes throw, so a query the fake does not understand fails
// the test instead of silently matching everything.
type Cond = Record<string, unknown>

function matchesCond(r: ReviewRow, cond: Cond): boolean {
  return Object.entries(cond).every(([key, value]) => {
    if (key === 'restaurantId') return r.restaurantId === value
    if (key === 'OR') return (value as Cond[]).some(c => matchesCond(r, c))
    if (key === 'createdAt') {
      if (value instanceof Date) return r.createdAt.getTime() === value.getTime()
      const { lt, ...rest } = value as { lt?: Date }
      if (!lt || Object.keys(rest).length) throw new Error(`unsupported createdAt filter ${JSON.stringify(value)}`)
      return r.createdAt.getTime() < lt.getTime()
    }
    if (key === 'id') {
      const { lt, ...rest } = value as { lt?: string }
      if (lt === undefined || Object.keys(rest).length) throw new Error(`unsupported id filter ${JSON.stringify(value)}`)
      return r.id < lt
    }
    throw new Error(`unsupported where key ${key}`)
  })
}

function fakeFindMany(args: { where: Cond; orderBy: Array<Record<string, 'asc' | 'desc'>>; take: number }) {
  const sorted = ROWS.filter(r => matchesCond(r, args.where)).sort((a, b) => {
    for (const order of args.orderBy) {
      const [field, dir] = Object.entries(order)[0] as [keyof ReviewRow, 'asc' | 'desc']
      const av = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field] as string
      const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field] as string
      if (av === bv) continue
      const cmp = av < bv ? -1 : 1
      return dir === 'asc' ? cmp : -cmp
    }
    return 0
  })
  return Promise.resolve(sorted.slice(0, args.take))
}

function fakeAggregate(args: { where: Cond }) {
  const rows = ROWS.filter(r => matchesCond(r, args.where))
  return Promise.resolve({
    _avg: { rating: rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : null },
    _count: { _all: rows.length },
  })
}

const app = createApp()
const url = (restaurantId = 'r1') => `/api/map/restaurants/${restaurantId}/reviews`

beforeEach(() => {
  jest.resetAllMocks()
  mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'r1' })
  mockPrisma.mapRestaurantReview.findMany.mockImplementation(fakeFindMany)
  mockPrisma.mapRestaurantReview.aggregate.mockImplementation(fakeAggregate)
  mockIsTokenBlacklisted.mockResolvedValue(false)
})

describe('GET /api/map/restaurants/:restaurantId/reviews pagination', () => {
  it('returns the first page newest first (createdAt desc, id desc) with the full summary', async () => {
    const res = await request(app).get(url()).query({ limit: 3 })

    expect(res.status).toBe(200)
    expect(res.body.reviews.map((r: { id: string }) => r.id)).toEqual(['rv07', 'rv06', 'rv05'])
    expect(res.body.reviewCount).toBe(7)
    expect(res.body.ratingAvg).toBeCloseTo(R1_AVG)
    expect(typeof res.body.nextCursor).toBe('string')
    // Existing review fields are unchanged.
    expect(res.body.reviews[0]).toEqual({
      id: 'rv07',
      restaurantId: 'r1',
      rating: 4,
      text: 'text rv07',
      createdAt: T4.toISOString(),
      updatedAt: T4.toISOString(),
      user: { id: 'u_rv07', name: 'User rv07', avatarUrl: null },
    })
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId: 'r1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 4,
    }))
  })

  it.each([1, 2, 3, 7, 50])('walks every review exactly once with limit=%i, summary identical on every page', async (limit) => {
    const seen: string[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const res: request.Response = await request(app)
        .get(url())
        .query(cursor ? { limit, cursor } : { limit })
      expect(res.status).toBe(200)
      expect(res.body.reviews.length).toBeLessThanOrEqual(limit)
      expect(res.body.reviewCount).toBe(7)
      expect(res.body.ratingAvg).toBeCloseTo(R1_AVG)
      seen.push(...res.body.reviews.map((r: { id: string }) => r.id))
      cursor = res.body.nextCursor
      pages += 1
    } while (cursor && pages < 20)

    expect(seen).toEqual(R1_NEWEST_FIRST)
    expect(pages).toBe(Math.ceil(7 / limit))
  })

  it('resumes inside a createdAt tie using the id tiebreaker', async () => {
    // rv04 shares T2 with rv03 and rv02, which must follow it.
    const cursor = encodeReviewCursor({ createdAt: T2, id: 'rv04' })
    const res = await request(app).get(url()).query({ limit: 2, cursor })

    expect(res.status).toBe(200)
    expect(res.body.reviews.map((r: { id: string }) => r.id)).toEqual(['rv03', 'rv02'])
    expect(decodeReviewCursor(res.body.nextCursor)).toEqual({ createdAt: T2, id: 'rv02' })
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        restaurantId: 'r1',
        OR: [
          { createdAt: { lt: T2 } },
          { createdAt: T2, id: { lt: 'rv04' } },
        ],
      },
    }))
  })

  it('returns nextCursor null on the last page', async () => {
    const res = await request(app).get(url()).query({ limit: 7 })

    expect(res.status).toBe(200)
    expect(res.body.reviews).toHaveLength(7)
    expect(res.body.nextCursor).toBeNull()
  })

  it('computes the summary over the whole restaurant, not the page', async () => {
    const cursor = encodeReviewCursor({ createdAt: T2, id: 'rv02' })
    const res = await request(app).get(url()).query({ limit: 1, cursor })

    expect(res.status).toBe(200)
    expect(res.body.reviews.map((r: { id: string }) => r.id)).toEqual(['rv01'])
    expect(res.body.reviewCount).toBe(7)
    expect(res.body.ratingAvg).toBeCloseTo(R1_AVG)
    expect(mockPrisma.mapRestaurantReview.aggregate).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
      _avg: { rating: true },
      _count: { _all: true },
    })
  })

  it('defaults to 20 per page', async () => {
    const res = await request(app).get(url())

    expect(res.status).toBe(200)
    expect(res.body.reviews).toHaveLength(7)
    expect(res.body.nextCursor).toBeNull()
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 21 }))
  })

  it('accepts the maximum limit of 50', async () => {
    const res = await request(app).get(url()).query({ limit: 50 })

    expect(res.status).toBe(200)
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }))
  })

  it('returns an empty page for a restaurant without reviews', async () => {
    mockPrisma.restaurant.findFirst.mockResolvedValue({ id: 'r3' })
    const res = await request(app).get(url('r3'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ratingAvg: null, reviewCount: 0, reviews: [], nextCursor: null })
  })

  it.each([
    ['zero', '0'],
    ['above the maximum', '51'],
    ['negative', '-1'],
    ['fractional', '2.5'],
    ['exponent notation', '1e1'],
    ['not a number', 'abc'],
    ['empty', ''],
  ])('400 when limit is %s', async (_label, limit) => {
    const res = await request(app).get(`${url()}?limit=${encodeURIComponent(limit)}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/limit/)
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
  })

  it('400 when limit is repeated', async () => {
    const res = await request(app).get(`${url()}?limit=5&limit=6`)

    expect(res.status).toBe(400)
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
  })

  const b64 = (value: string) => Buffer.from(value, 'utf8').toString('base64url')

  it.each([
    ['empty', ''],
    ['outside the base64url alphabet', 'abc+/=='],
    ['not JSON', b64('not json')],
    ['a JSON array', b64('["2026-09-01T10:00:00.000Z","rv01"]')],
    ['missing the id', b64('{"createdAt":"2026-09-01T10:00:00.000Z"}')],
    ['missing createdAt', b64('{"id":"rv01"}')],
    ['a non-ISO createdAt', b64('{"createdAt":"yesterday","id":"rv01"}')],
    ['a numeric createdAt', b64('{"createdAt":1767225600000,"id":"rv01"}')],
    // Pass a loose datetime check but Postgres refuses them (500 before).
    ['a year-0000 createdAt', b64('{"createdAt":"0000-01-01T00:00:00.000Z","id":"rv01"}')],
    ['a pre-1970 createdAt', b64('{"createdAt":"1969-12-31T23:59:59.999Z","id":"rv01"}')],
    ['a createdAt without milliseconds', b64('{"createdAt":"2026-09-01T10:00:00Z","id":"rv01"}')],
    ['an impossible date', b64('{"createdAt":"2026-02-30T10:00:00.000Z","id":"rv01"}')],
    ['a NUL byte in the id', b64('{"createdAt":"2026-09-01T10:00:00.000Z","id":"a\\u0000b"}')],
    ['an id outside the cuid charset', b64('{"createdAt":"2026-09-01T10:00:00.000Z","id":"rv 01"}')],
    ['an id longer than 64 chars', b64(`{"createdAt":"2026-09-01T10:00:00.000Z","id":"${'a'.repeat(65)}"}`)],
    ['an empty id', b64('{"createdAt":"2026-09-01T10:00:00.000Z","id":""}')],
    ['an unexpected key', b64('{"createdAt":"2026-09-01T10:00:00.000Z","id":"rv01","restaurantId":"r2"}')],
    ['too long', 'A'.repeat(300)],
  ])('400 when the cursor is %s', async (_label, cursor) => {
    const res = await request(app).get(`${url()}?cursor=${encodeURIComponent(cursor)}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid cursor')
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
  })

  it('round-trips the cursor codec', () => {
    const cursor = { createdAt: new Date('2026-09-02T10:00:00.123Z'), id: 'cmabc123' }
    const encoded = encodeReviewCursor(cursor)

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeReviewCursor(encoded)).toEqual(cursor)
  })

  it('404 for a restaurant hidden from the public map, without reading reviews', async () => {
    mockPrisma.restaurant.findFirst.mockResolvedValue(null)
    const res = await request(app).get(url('gone')).query({ limit: 5 })

    expect(res.status).toBe(404)
    expect(mockPrisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'gone', deletedAt: null, expires: { gte: expect.any(Date) } }),
      select: { id: true },
    })
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.mapRestaurantReview.aggregate).not.toHaveBeenCalled()
  })
})

describe('GET /api/map/restaurants/:restaurantId/reviews/mine', () => {
  const mapUser = {
    id: 'u_rv01',
    email: 'user@example.com',
    phone: null,
    firstName: 'Map',
    lastName: 'User',
    name: 'User rv01',
    avatarUrl: null,
    sessionVersion: 1,
    emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
  }
  const token = () =>
    signMapAccessToken({ sub: mapUser.id, name: mapUser.name, email: mapUser.email, ver: 1, jti: 'j1' })

  beforeEach(() => {
    mockPrisma.mapUser.findUnique.mockResolvedValue(mapUser)
  })

  it('401 without a map session', async () => {
    const res = await request(app).get(`${url()}/mine`)

    expect(res.status).toBe(401)
    expect(mockPrisma.mapRestaurantReview.findUnique).not.toHaveBeenCalled()
  })

  it('returns the caller\'s review even when it is not on the first page', async () => {
    mockPrisma.mapRestaurantReview.findUnique.mockResolvedValue(ROWS[0])
    const res = await request(app).get(`${url()}/mine`).set('Authorization', `Bearer ${token()}`)

    expect(res.status).toBe(200)
    expect(res.body.review).toMatchObject({ id: 'rv01', rating: 5, user: { id: 'u_rv01' } })
    expect(mockPrisma.mapRestaurantReview.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurantId_mapUserId: { restaurantId: 'r1', mapUserId: 'u_rv01' } },
    }))
  })

  it('returns null when the caller has not reviewed the restaurant', async () => {
    mockPrisma.mapRestaurantReview.findUnique.mockResolvedValue(null)
    const res = await request(app).get(`${url()}/mine`).set('Authorization', `Bearer ${token()}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ review: null })
  })

  it('404 for a restaurant hidden from the public map', async () => {
    mockPrisma.restaurant.findFirst.mockResolvedValue(null)
    const res = await request(app).get(`${url('gone')}/mine`).set('Authorization', `Bearer ${token()}`)

    expect(res.status).toBe(404)
    expect(mockPrisma.mapRestaurantReview.findUnique).not.toHaveBeenCalled()
  })
})
