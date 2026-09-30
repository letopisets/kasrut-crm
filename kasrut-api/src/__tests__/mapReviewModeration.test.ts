import request from 'supertest'
import { createApp } from '../app'
import { signCrmAccessToken, signMapAccessToken } from '../lib/jwt'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { usersRepo } from '../db/users.repo'
import { serviceLogsRepo } from '../db/serviceLogs.repo'
import { encodeReviewCursor } from '../controllers/mapReview.controller'
import type { User } from '../models/types'

jest.mock('../lib/prisma', () => ({
  prisma: {
    restaurant: { findFirst: jest.fn() },
    mapRestaurantReview: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))
// A Map-backed Redis (see installFakeRedis), so a review payload cached
// anywhere on these routes would actually be served stale by the next request.
jest.mock('../lib/redis', () => ({
  redis: {
    status: 'end',
    store: new Map<string, string>(),
    get: jest.fn(),
    setex: jest.fn(),
    scan: jest.fn(),
    del: jest.fn(),
  },
}))
jest.mock('../lib/tokenBlacklist')
jest.mock('../db/users.repo')
jest.mock('../db/serviceLogs.repo', () => ({ serviceLogsRepo: { create: jest.fn() } }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockPrisma = prisma as unknown as {
  restaurant: { findFirst: jest.Mock }
  mapRestaurantReview: { findMany: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock; aggregate: jest.Mock }
}
const mockRedis = redis as unknown as {
  store: Map<string, string>
  get: jest.Mock
  setex: jest.Mock
  scan: jest.Mock
  del: jest.Mock
}
const mockUsersRepo = jest.mocked(usersRepo)
const mockLogCreate = jest.mocked(serviceLogsRepo.create)
const mockIsTokenBlacklisted = jest.mocked(isTokenBlacklisted)

// ── Fixture: two tenants, one hidden restaurant ─────────────────────────────
interface RestaurantRow { id: string; name: string; rabbanutId: string; public: boolean }
interface MapUserRow { id: string; name: string; email: string; avatarUrl: string | null }
interface ReviewRow {
  id: string
  restaurantId: string
  mapUserId: string
  rating: number
  text: string | null
  createdAt: Date
  updatedAt: Date
}

const RESTAURANTS: RestaurantRow[] = [
  { id: 'r_a1', name: 'Alpha Grill', rabbanutId: 'rb_a', public: true },
  { id: 'r_a2', name: 'Alpha Closed', rabbanutId: 'rb_a', public: false },
  { id: 'r_b1', name: 'Beta Bakery', rabbanutId: 'rb_b', public: true },
]
const MAP_USERS: MapUserRow[] = [
  { id: 'mu1', name: 'Dana', email: 'dana@example.com', avatarUrl: null },
  { id: 'mu2', name: 'Eli', email: 'eli@example.com', avatarUrl: null },
]

const at = (day: number) => new Date(`2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`)
const INITIAL_REVIEWS: ReviewRow[] = [
  { id: 'rv_a1', restaurantId: 'r_a1', mapUserId: 'mu1', rating: 5, text: 'Great', createdAt: at(1), updatedAt: at(1) },
  { id: 'rv_a2', restaurantId: 'r_a1', mapUserId: 'mu2', rating: 3, text: null, createdAt: at(3), updatedAt: at(3) },
  { id: 'rv_a3', restaurantId: 'r_a2', mapUserId: 'mu1', rating: 1, text: 'Closed now', createdAt: at(5), updatedAt: at(5) },
  { id: 'rv_b1', restaurantId: 'r_b1', mapUserId: 'mu2', rating: 2, text: 'Spam spam', createdAt: at(4), updatedAt: at(4) },
  { id: 'rv_b2', restaurantId: 'r_b1', mapUserId: 'mu1', rating: 4, text: 'Fresh bread', createdAt: at(2), updatedAt: at(2) },
]
const ALL_NEWEST_FIRST = ['rv_a3', 'rv_b1', 'rv_a2', 'rv_b2', 'rv_a1']
const TENANT_A_NEWEST_FIRST = ['rv_a3', 'rv_a2', 'rv_a1']

let reviews: ReviewRow[] = []

const restaurantOf = (review: ReviewRow) => RESTAURANTS.find(r => r.id === review.restaurantId)!
const authorOf = (review: ReviewRow) => MAP_USERS.find(u => u.id === review.mapUserId)!

// ── Minimal Prisma interpreter; unknown shapes throw so the fake cannot ─────
// silently match everything (and thereby hide a missing tenant filter).
type Cond = Record<string, unknown>

function matches(review: ReviewRow, cond: Cond): boolean {
  return Object.entries(cond).every(([key, value]) => {
    if (key === 'id') {
      if (typeof value === 'string') return review.id === value
      const { lt, ...rest } = value as { lt?: string }
      if (lt === undefined || Object.keys(rest).length) throw new Error(`unsupported id filter ${JSON.stringify(value)}`)
      return review.id < lt
    }
    if (key === 'restaurantId') return review.restaurantId === value
    if (key === 'OR') return (value as Cond[]).some(c => matches(review, c))
    if (key === 'createdAt' || key === 'updatedAt') {
      if (value instanceof Date) return review[key].getTime() === value.getTime()
      const { lt, ...rest } = value as { lt?: Date }
      if (!lt || Object.keys(rest).length) throw new Error(`unsupported ${key} filter ${JSON.stringify(value)}`)
      return review[key].getTime() < lt.getTime()
    }
    if (key === 'restaurant') {
      const { is, ...rest } = value as { is?: Cond }
      if (!is || Object.keys(rest).length || Object.keys(is).join() !== 'rabbanutId') {
        throw new Error(`unsupported restaurant filter ${JSON.stringify(value)}`)
      }
      return restaurantOf(review).rabbanutId === is.rabbanutId
    }
    throw new Error(`unsupported where key ${key}`)
  })
}

type Selection = Record<string, true | { select: Selection }>

function pick(source: Record<string, unknown>, selection: Selection): Record<string, unknown> {
  return Object.fromEntries(Object.entries(selection).map(([key, value]) => [
    key,
    value === true ? source[key] : pick(source[key] as Record<string, unknown>, value.select),
  ]))
}

function withRelations(review: ReviewRow): Record<string, unknown> {
  return { ...review, restaurant: { ...restaurantOf(review) }, mapUser: { ...authorOf(review) } }
}

function project(review: ReviewRow, args: { select?: Selection; include?: Selection }) {
  const full = withRelations(review)
  if (args.select) return pick(full, args.select)
  const included = args.include ? pick(full, args.include) : {}
  return { ...review, ...included }
}

function sortReviews(rows: ReviewRow[], orderBy: Array<Record<string, 'asc' | 'desc'>>) {
  return [...rows].sort((a, b) => {
    for (const order of orderBy) {
      const [field, dir] = Object.entries(order)[0] as [keyof ReviewRow, 'asc' | 'desc']
      const av = a[field] instanceof Date ? (a[field] as Date).getTime() : a[field] as string
      const bv = b[field] instanceof Date ? (b[field] as Date).getTime() : b[field] as string
      if (av === bv) continue
      const cmp = (av as string | number) < (bv as string | number) ? -1 : 1
      return dir === 'asc' ? cmp : -cmp
    }
    return 0
  })
}

function installFakePrisma() {
  mockPrisma.mapRestaurantReview.findMany.mockImplementation(async (args: {
    where: Cond
    orderBy: Array<Record<string, 'asc' | 'desc'>>
    take: number
    select?: Selection
    include?: Selection
  }) => sortReviews(reviews.filter(r => matches(r, args.where)), args.orderBy)
    .slice(0, args.take)
    .map(r => project(r, args)))
  mockPrisma.mapRestaurantReview.findFirst.mockImplementation(async (args: { where: Cond; select?: Selection }) => {
    const hit = reviews.find(r => matches(r, args.where))
    return hit ? project(hit, args) : null
  })
  mockPrisma.mapRestaurantReview.deleteMany.mockImplementation(async (args: { where: Cond }) => {
    const before = reviews.length
    reviews = reviews.filter(r => !matches(r, args.where))
    return { count: before - reviews.length }
  })
  mockPrisma.mapRestaurantReview.aggregate.mockImplementation(async (args: { where: Cond }) => {
    const rows = reviews.filter(r => matches(r, args.where))
    return {
      _avg: { rating: rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : null },
      _count: { _all: rows.length },
    }
  })
  // restaurantExists (public visibility gate of the public review list)
  mockPrisma.restaurant.findFirst.mockImplementation(async (args: { where: { id: string } }) => {
    const hit = RESTAURANTS.find(r => r.id === args.where.id && r.public)
    return hit ? { id: hit.id } : null
  })
}

// Re-installed after every resetAllMocks, which would otherwise turn SETEX
// into a no-op and let a newly added cache pass the staleness test.
function installFakeRedis() {
  const { store } = mockRedis
  const globToRegExp = (glob: string) =>
    new RegExp(`^${glob.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
  mockRedis.get.mockImplementation(async (key: string) => store.get(key) ?? null)
  mockRedis.setex.mockImplementation(async (key: string, _ttl: number, value: string) => {
    store.set(key, value)
    return 'OK'
  })
  mockRedis.scan.mockImplementation(async (_cursor: string, _match: string, pattern: string) =>
    ['0', [...store.keys()].filter(key => globToRegExp(pattern).test(key))])
  mockRedis.del.mockImplementation(async (...keys: string[]) => keys.filter(key => store.delete(key)).length)
}

// ── Actors ──────────────────────────────────────────────────────────────────
const USERS: Record<string, User> = {
  owner: {
    id: 'u_owner', name: 'Owner', email: 'owner@crm.il', passwordHash: 'h', role: 'owner',
    // REQUIRE_OWNER_2FA: an owner without 2FA may only reach the setup routes
    twoFactorEnabled: true, twoFactorBackupCodes: [], sessionVersion: 0,
  },
  rabbanutA: {
    id: 'u_rb_a', name: 'Rabbanut A', email: 'a@crm.il', passwordHash: 'h', role: 'rabbanut', rabbanutId: 'rb_a',
    twoFactorEnabled: false, twoFactorBackupCodes: [], sessionVersion: 0,
  },
  // A tenant role without a tenant must fail closed, not read globally.
  rabbanutNoTenant: {
    id: 'u_rb_none', name: 'Rabbanut ?', email: 'none@crm.il', passwordHash: 'h', role: 'rabbanut',
    twoFactorEnabled: false, twoFactorBackupCodes: [], sessionVersion: 0,
  },
  mashgiachA: {
    id: 'u_mg_a', name: 'Mashgiach A', email: 'mg@crm.il', passwordHash: 'h', role: 'mashgiach',
    rabbanutId: 'rb_a', mashgiachId: 'mg_a', twoFactorEnabled: false, twoFactorBackupCodes: [], sessionVersion: 0,
  },
}

function crmToken(user: User): string {
  return signCrmAccessToken({
    sub: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    ...(user.rabbanutId ? { rabbanutId: user.rabbanutId } : {}),
    ...(user.mashgiachId ? { mashgiachId: user.mashgiachId } : {}),
    ver: 0,
    jti: `jti_${user.id}`,
  })
}

const mapUserToken = () =>
  signMapAccessToken({ sub: 'mu1', name: 'Dana', email: 'dana@example.com', ver: 0, jti: 'jti_mu1' })

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })
const as = (user: User) => bearer(crmToken(user))
const ids = (body: { reviews: Array<{ id: string }> }) => body.reviews.map(r => r.id)
const flushServiceLog = () => new Promise(resolve => setImmediate(resolve))

const app = createApp()

beforeEach(() => {
  jest.resetAllMocks()
  reviews = INITIAL_REVIEWS.map(r => ({ ...r }))
  mockRedis.store.clear()
  installFakeRedis()
  installFakePrisma()
  mockIsTokenBlacklisted.mockResolvedValue(false)
  mockUsersRepo.findAuthById.mockImplementation(async (id: string) =>
    Object.values(USERS).find(u => u.id === id) ?? null)
  mockLogCreate.mockResolvedValue(undefined as never)
})

describe('GET /api/map/reviews (CRM moderation list)', () => {
  it('owner sees every review of every tenant, newest first, including hidden restaurants', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner))

    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual(ALL_NEWEST_FIRST)
    expect(res.body.nextCursor).toBeNull()
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 21,
    }))
  })

  it('brings a review its author rewrote back to the top, marked by its updatedAt', async () => {
    // rv_a1 is the oldest review; its author edits it after everything else.
    const edited = reviews.find(r => r.id === 'rv_a1')!
    edited.text = 'Now abusive'
    edited.updatedAt = at(9)

    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner))

    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual(['rv_a1', 'rv_a3', 'rv_b1', 'rv_a2', 'rv_b2'])
    expect(res.body.reviews[0]).toMatchObject({
      text: 'Now abusive',
      createdAt: at(1).toISOString(),
      updatedAt: at(9).toISOString(),
    })

    // Paging continues from the edited row's updatedAt without skipping any.
    const firstPage = await request(app).get('/api/map/reviews').set(as(USERS.owner)).query({ limit: 2 })
    const rest = await request(app).get('/api/map/reviews').set(as(USERS.owner))
      .query({ limit: 50, cursor: firstPage.body.nextCursor })
    expect([...ids(firstPage.body), ...ids(rest.body)]).toEqual(['rv_a1', 'rv_a3', 'rv_b1', 'rv_a2', 'rv_b2'])
  })

  it('returns restaurant and author (id + name) but never the author email', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner)).query({ restaurantId: 'r_b1' })

    expect(res.status).toBe(200)
    expect(res.body.reviews[0]).toEqual({
      id: 'rv_b1',
      rating: 2,
      text: 'Spam spam',
      createdAt: at(4).toISOString(),
      updatedAt: at(4).toISOString(),
      restaurant: { id: 'r_b1', name: 'Beta Bakery' },
      author: { id: 'mu2', name: 'Eli' },
    })
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com|email/)
    // Not even loaded from the database.
    expect(mockPrisma.mapRestaurantReview.findMany.mock.calls[0][0].select.mapUser)
      .toEqual({ select: { id: true, name: true } })
  })

  it('rabbanut sees only reviews of its own restaurants', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.rabbanutA))

    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual(TENANT_A_NEWEST_FIRST)
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurant: { is: { rabbanutId: 'rb_a' } } },
    }))
  })

  it('rabbanut filtering by another tenant\'s restaurant gets an empty page, not its reviews', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.rabbanutA)).query({ restaurantId: 'r_b1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ reviews: [], nextCursor: null })
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { restaurant: { is: { rabbanutId: 'rb_a' } }, restaurantId: 'r_b1' },
    }))
  })

  it('owner can filter by restaurant', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner)).query({ restaurantId: 'r_a1' })

    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual(['rv_a2', 'rv_a1'])
  })

  it.each([1, 2, 4])('walks every in-scope review exactly once with limit=%i', async (limit) => {
    for (const [user, expected] of [
      [USERS.owner, ALL_NEWEST_FIRST],
      [USERS.rabbanutA, TENANT_A_NEWEST_FIRST],
    ] as const) {
      const seen: string[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const res: request.Response = await request(app)
          .get('/api/map/reviews')
          .set(as(user))
          .query(cursor ? { limit, cursor } : { limit })
        expect(res.status).toBe(200)
        expect(res.body.reviews.length).toBeLessThanOrEqual(limit)
        seen.push(...ids(res.body))
        cursor = res.body.nextCursor
        pages += 1
      } while (cursor && pages < 20)
      expect(seen).toEqual(expected)
    }
  })

  it('accepts at most 50 per page', async () => {
    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner)).query({ limit: 50 })

    expect(res.status).toBe(200)
    expect(mockPrisma.mapRestaurantReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 51 }))
  })

  it.each([
    ['limit above the maximum', 'limit=51', /limit/],
    ['limit zero', 'limit=0', /limit/],
    ['a malformed cursor', 'cursor=not-a-cursor', /Invalid cursor/],
    ['a cursor with a forged key', `cursor=${Buffer.from(JSON.stringify({ createdAt: at(1).toISOString(), id: 'x', rabbanutId: 'rb_b' })).toString('base64url')}`, /Invalid cursor/],
    ['a restaurantId outside the id charset', 'restaurantId=r%00x', /Invalid restaurantId/],
    ['a repeated restaurantId', 'restaurantId=r_a1&restaurantId=r_b1', /Invalid restaurantId/],
  ])('400 for %s, without querying', async (_label, qs, error) => {
    const res = await request(app).get(`/api/map/reviews?${qs}`).set(as(USERS.owner))

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(error)
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
  })

  it('a valid cursor resumes after the given review', async () => {
    const cursor = encodeReviewCursor({ createdAt: at(3), id: 'rv_a2' })
    const res = await request(app).get('/api/map/reviews').set(as(USERS.owner)).query({ cursor })

    expect(res.status).toBe(200)
    expect(ids(res.body)).toEqual(['rv_b2', 'rv_a1'])
  })
})

describe('DELETE /api/map/reviews/:id (CRM moderation)', () => {
  it('owner deletes a review of any tenant', async () => {
    const res = await request(app).delete('/api/map/reviews/rv_b1').set(as(USERS.owner))

    expect(res.status).toBe(204)
    expect(reviews.map(r => r.id)).not.toContain('rv_b1')
    expect(reviews).toHaveLength(INITIAL_REVIEWS.length - 1)
    expect(mockPrisma.mapRestaurantReview.deleteMany).toHaveBeenCalledWith({ where: { id: 'rv_b1' } })
  })

  it('rabbanut deletes a review of its own restaurant with the tenant predicate on the DELETE itself', async () => {
    const res = await request(app).delete('/api/map/reviews/rv_a3').set(as(USERS.rabbanutA))

    expect(res.status).toBe(204)
    expect(reviews.map(r => r.id)).not.toContain('rv_a3')
    expect(mockPrisma.mapRestaurantReview.deleteMany).toHaveBeenCalledWith({
      where: { id: 'rv_a3', restaurant: { is: { rabbanutId: 'rb_a' } } },
    })
  })

  it('404 when a rabbanut targets another tenant\'s review, which stays in place', async () => {
    const res = await request(app).delete('/api/map/reviews/rv_b1').set(as(USERS.rabbanutA))

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Review not found' })
    expect(reviews).toHaveLength(INITIAL_REVIEWS.length)
    expect(mockPrisma.mapRestaurantReview.deleteMany).not.toHaveBeenCalled()
  })

  it('404, not a success, when the scoped DELETE removes nothing (restaurant moved tenant mid-request)', async () => {
    mockPrisma.mapRestaurantReview.deleteMany.mockResolvedValueOnce({ count: 0 })
    const res = await request(app).delete('/api/map/reviews/rv_a1').set(as(USERS.rabbanutA))

    expect(res.status).toBe(404)
    await flushServiceLog()
    expect(mockLogCreate).not.toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/^Deleted map review/),
    }))
  })

  it('404 for an unknown id and for a malformed id (the latter without touching the database)', async () => {
    const unknown = await request(app).delete('/api/map/reviews/rv_nope').set(as(USERS.owner))
    expect(unknown.status).toBe(404)

    mockPrisma.mapRestaurantReview.findFirst.mockClear()
    const malformed = await request(app).delete('/api/map/reviews/rv%00a1').set(as(USERS.owner))
    expect(malformed.status).toBe(404)
    expect(mockPrisma.mapRestaurantReview.findFirst).not.toHaveBeenCalled()
    expect(reviews).toHaveLength(INITIAL_REVIEWS.length)
  })

  it('a second delete of the same review is a 404', async () => {
    expect((await request(app).delete('/api/map/reviews/rv_a1').set(as(USERS.owner))).status).toBe(204)
    expect((await request(app).delete('/api/map/reviews/rv_a1').set(as(USERS.owner))).status).toBe(404)
  })

  it('writes an audit entry naming the review, restaurant, author and rating', async () => {
    await request(app).delete('/api/map/reviews/rv_a2').set(as(USERS.rabbanutA)).expect(204)
    await flushServiceLog()

    expect(mockLogCreate).toHaveBeenCalledTimes(1)
    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      service: 'Map',
      action: 'DELETE /api/map/reviews/rv_a2',
      message: 'Deleted map review rv_a2 (restaurant r_a1, author mu2, rating 3)',
      userId: 'u_rb_a',
      userEmail: 'a@crm.il',
      userRole: 'rabbanut',
      statusCode: 204,
      entityType: 'map_reviews',
      entityId: 'rv_a2',
    }))
  })

  // Express routes case-insensitively and ignores a trailing slash; neither
  // may reach the handler without leaving an audit entry.
  it.each([
    '/API/map/reviews/rv_a2',
    '/Api/Map/Reviews/rv_a2',
    '/api/map/reviews/rv_a2/',
  ])('audits a delete requested as %s', async (url) => {
    await request(app).delete(url).set(as(USERS.rabbanutA)).expect(204)
    await flushServiceLog()

    expect(reviews.map(r => r.id)).not.toContain('rv_a2')
    expect(mockLogCreate).toHaveBeenCalledTimes(1)
    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'info',
      service: 'Map',
      path: url,
      message: 'Deleted map review rv_a2 (restaurant r_a1, author mu2, rating 3)',
      userId: 'u_rb_a',
      entityType: 'map_reviews',
      entityId: 'rv_a2',
    }))
  })

  it('logs a refused cross-tenant delete as a warning without the deletion message', async () => {
    await request(app).delete('/api/map/reviews/rv_b1').set(as(USERS.rabbanutA)).expect(404)
    await flushServiceLog()

    expect(mockLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      statusCode: 404,
      userId: 'u_rb_a',
      message: 'DELETE /api/map/reviews/rv_b1 returned 404',
    }))
  })
})

describe('review moderation role matrix', () => {
  const routes = [
    ['GET', '/api/map/reviews'],
    ['DELETE', '/api/map/reviews/rv_a1'],
  ] as const
  const send = (method: 'GET' | 'DELETE', url: string) =>
    method === 'GET' ? request(app).get(url) : request(app).delete(url)

  function expectNoReviewAccess() {
    expect(mockPrisma.mapRestaurantReview.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.mapRestaurantReview.findFirst).not.toHaveBeenCalled()
    expect(mockPrisma.mapRestaurantReview.deleteMany).not.toHaveBeenCalled()
    expect(reviews).toHaveLength(INITIAL_REVIEWS.length)
  }

  it.each(routes)('%s %s: 403 for a mashgiach', async (method, url) => {
    const res = await send(method, url).set(as(USERS.mashgiachA))

    expect(res.status).toBe(403)
    expectNoReviewAccess()
  })

  it.each(routes)('%s %s: 403 for a rabbanut account without a tenant (fails closed)', async (method, url) => {
    const res = await send(method, url).set(as(USERS.rabbanutNoTenant))

    expect(res.status).toBe(403)
    expectNoReviewAccess()
  })

  it.each(routes)('%s %s: 401 for a public map-user token', async (method, url) => {
    const res = await send(method, url).set(bearer(mapUserToken()))

    expect(res.status).toBe(401)
    expect(mockUsersRepo.findAuthById).not.toHaveBeenCalled()
    expectNoReviewAccess()
  })

  it.each(routes)('%s %s: 401 without a token', async (method, url) => {
    const res = await send(method, url)

    expect(res.status).toBe(401)
    expectNoReviewAccess()
  })

  it.each(routes)('%s %s: 401 for a CRM token whose role changed since issue', async (method, url) => {
    const staleOwner = crmToken({ ...USERS.rabbanutA, role: 'owner', rabbanutId: undefined })
    const res = await send(method, url).set(bearer(staleOwner))

    expect(res.status).toBe(401)
    expectNoReviewAccess()
  })
})

describe('review deletion and cached payloads', () => {
  const publicList = (restaurantId: string) => request(app).get(`/api/map/restaurants/${restaurantId}/reviews`)

  it('the public list and rating summary reflect a deletion on the very next request', async () => {
    const before = await publicList('r_b1')
    expect(before.status).toBe(200)
    expect(before.body.reviewCount).toBe(2)
    expect(before.body.ratingAvg).toBeCloseTo(3)
    expect(ids(before.body)).toEqual(['rv_b1', 'rv_b2'])

    await request(app).delete('/api/map/reviews/rv_b1').set(as(USERS.owner)).expect(204)

    const after = await publicList('r_b1')
    expect(after.status).toBe(200)
    expect(after.body.reviewCount).toBe(1)
    expect(after.body.ratingAvg).toBeCloseTo(4)
    expect(ids(after.body)).toEqual(['rv_b2'])
    // Nothing on these routes caches review payloads, so nothing can go stale.
    expect(mockRedis.setex).not.toHaveBeenCalled()
    expect(mockRedis.store.size).toBe(0)
  })

  it('the CRM list no longer returns a deleted review', async () => {
    await request(app).delete('/api/map/reviews/rv_a2').set(as(USERS.rabbanutA)).expect(204)
    const res = await request(app).get('/api/map/reviews').set(as(USERS.rabbanutA))

    expect(ids(res.body)).toEqual(['rv_a3', 'rv_a1'])
  })

  it('leaves the public map caches warm: no map payload carries a rating', async () => {
    mockRedis.store.set('map:restaurant:r_b1', JSON.stringify({ id: 'r_b1' }))
    mockRedis.store.set('map:restaurants:all', JSON.stringify({ restaurants: [] }))

    await request(app).delete('/api/map/reviews/rv_b1').set(as(USERS.owner)).expect(204)

    expect(mockRedis.scan).not.toHaveBeenCalled()
    expect(mockRedis.del).not.toHaveBeenCalled()
    expect([...mockRedis.store.keys()].sort()).toEqual(['map:restaurant:r_b1', 'map:restaurants:all'])
  })
})
