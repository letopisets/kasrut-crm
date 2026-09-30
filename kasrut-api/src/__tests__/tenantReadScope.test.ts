import request from 'supertest'
import jwt from 'jsonwebtoken'
import type { Request } from 'express'
import { createApp } from '../app'
import { env } from '../config/env'
import { hechsherimRepo } from '../db/hechsherim.repo'
import { inspectionsRepo } from '../db/inspections.repo'
import { rabbanutRepo } from '../db/rabbanuts.repo'
import { usersRepo } from '../db/users.repo'
import { withCache } from '../lib/cache'
import {
  assertOwnsRabbanut,
  ForbiddenScopeError,
  resolveScopeRabbanutId,
} from '../lib/rabbanutScope'
import type { Hechsher, Rabbanut, Role, User } from '../models/types'

// Read scoping used to narrow only the 'rabbanut' role: a mashgiach could list
// every tenant's hechsherim (served from the owner's 'hechsherim:list:all'
// cache entry), open any hechsher by id, and enumerate every rabbanut.
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('../lib/cache', () => ({
  withCache: jest.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  invalidatePattern: jest.fn(),
}))
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))

const mockH         = hechsherimRepo as jest.Mocked<typeof hechsherimRepo>
const mockI         = inspectionsRepo as jest.Mocked<typeof inspectionsRepo>
const mockRb        = rabbanutRepo as jest.Mocked<typeof rabbanutRepo>
const mockUsers     = usersRepo as jest.Mocked<typeof usersRepo>
const mockWithCache = withCache as jest.MockedFunction<typeof withCache>
const app = createApp()

/** Sign a CRM token and make the auth middleware resolve the same account.
 *  Pass `rabbanutId: null` for a malformed tenant account with no tenant. */
function token(role: Role, rabbanutId: string | null) {
  const links = {
    ...(rabbanutId ? { rabbanutId } : {}),
    ...(role === 'mashgiach' ? { mashgiachId: 'm_self' } : {}),
  }
  const currentUser: User = {
    id: 'u1', name: 'U', email: 'u@crm.il', passwordHash: 'hash', role,
    ...links, twoFactorEnabled: false, twoFactorBackupCodes: [],
  }
  mockUsers.findAuthById.mockResolvedValue(currentUser)
  return jwt.sign(
    { sub: 'u1', role, typ: 'crm', name: 'U', email: 'u@crm.il', ...links },
    env.JWT_SECRET, { expiresIn: '1h' } as object,
  )
}

const hechsher = (id: string, rabbanutId: string): Hechsher => ({
  id, name: `H ${id}`, shortName: id, type: 'Rabbanut', color: '#fff', rabbanutId, active: true,
})

const rabbanut = (id: string): Rabbanut => ({
  id, name: `R ${id}`, city: 'City', contact: '', phone: '', email: '', active: true, color: '#000',
})

const fakeReq = (user?: Partial<{ role: Role; rabbanutId: string }>) =>
  ({ user }) as unknown as Request

describe('rabbanutScope read helpers', () => {
  it('owner resolves to the requested filter (undefined = all tenants)', () => {
    expect(resolveScopeRabbanutId(fakeReq({ role: 'owner' }), undefined)).toBeUndefined()
    expect(resolveScopeRabbanutId(fakeReq({ role: 'owner' }), 'rb_a')).toBe('rb_a')
  })

  it('owner non-string filters (qs objects such as ?rabbanutId[not]=x) are dropped', () => {
    const operator = { not: 'rb_a' } as unknown as string
    expect(resolveScopeRabbanutId(fakeReq({ role: 'owner' }), operator)).toBeUndefined()
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s is pinned to its own rabbanut, ignoring the filter', (role) => {
    expect(resolveScopeRabbanutId(fakeReq({ role, rabbanutId: 'rb_b' }), 'rb_a')).toBe('rb_b')
    expect(resolveScopeRabbanutId(fakeReq({ role, rabbanutId: 'rb_b' }), undefined)).toBe('rb_b')
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', (role) => {
    expect(() => resolveScopeRabbanutId(fakeReq({ role }), undefined)).toThrow(ForbiddenScopeError)
    expect(() => assertOwnsRabbanut(fakeReq({ role }), { rabbanutId: 'rb_a' })).toThrow(ForbiddenScopeError)
  })

  it('a request without a user fails closed', () => {
    expect(() => resolveScopeRabbanutId(fakeReq(), 'rb_a')).toThrow(ForbiddenScopeError)
    expect(() => assertOwnsRabbanut(fakeReq(), { rabbanutId: 'rb_a' })).toThrow(ForbiddenScopeError)
  })

  it('assertOwnsRabbanut: owner passes any tenant; rabbanut and mashgiach only their own', () => {
    expect(() => assertOwnsRabbanut(fakeReq({ role: 'owner' }), { rabbanutId: 'rb_a' })).not.toThrow()
    for (const role of ['rabbanut', 'mashgiach'] as const) {
      const req = fakeReq({ role, rabbanutId: 'rb_b' })
      expect(() => assertOwnsRabbanut(req, { rabbanutId: 'rb_b' })).not.toThrow()
      expect(() => assertOwnsRabbanut(req, { rabbanutId: 'rb_a' })).toThrow(ForbiddenScopeError)
      expect(() => assertOwnsRabbanut(req, null)).not.toThrow()
    }
  })
})

describe('GET /api/hechsherim tenant scoping', () => {
  beforeEach(() => {
    mockH.findAll.mockResolvedValue([])
  })

  it('owner lists all tenants from the unscoped cache entry', async () => {
    mockH.findAll.mockResolvedValue([hechsher('h1', 'rb_a'), hechsher('h2', 'rb_b')])
    const res = await request(app).get('/api/hechsherim')
      .set('Authorization', `Bearer ${token('owner', null)}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(mockH.findAll).toHaveBeenCalledWith({ rabbanutId: undefined, active: undefined })
    expect(mockWithCache).toHaveBeenCalledWith('hechsherim:list:all:all', expect.any(Number), expect.any(Function))
  })

  it('owner may filter by any rabbanut', async () => {
    const res = await request(app).get('/api/hechsherim?rabbanutId=rb_a')
      .set('Authorization', `Bearer ${token('owner', null)}`)

    expect(res.status).toBe(200)
    expect(mockH.findAll).toHaveBeenCalledWith({ rabbanutId: 'rb_a', active: undefined })
  })

  it('owner object-valued filters neither reach the repo nor alias a cache key', async () => {
    for (const query of ['?rabbanutId[not]=rb_a', '?rabbanutId[equals]=rb_b']) {
      const res = await request(app).get(`/api/hechsherim${query}`)
        .set('Authorization', `Bearer ${token('owner', null)}`)
      expect(res.status).toBe(200)
    }
    expect(mockH.findAll).toHaveBeenCalledTimes(2)
    for (const [filter] of mockH.findAll.mock.calls) {
      expect(filter).toEqual({ rabbanutId: undefined, active: undefined })
    }
    const keys = mockWithCache.mock.calls.map(([key]) => key)
    expect(keys).toEqual(['hechsherim:list:all:all', 'hechsherim:list:all:all'])
  })

  it('rabbanut is pinned to its own tenant even when asking for another', async () => {
    const res = await request(app).get('/api/hechsherim?rabbanutId=rb_other')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_a')}`)

    expect(res.status).toBe(200)
    expect(mockH.findAll).toHaveBeenCalledWith({ rabbanutId: 'rb_a', active: undefined })
    expect(mockWithCache).toHaveBeenCalledWith('hechsherim:list:rb:rb_a:all', expect.any(Number), expect.any(Function))
  })

  it('mashgiach is pinned to its own tenant and never reads the all-tenant entry', async () => {
    const res = await request(app).get('/api/hechsherim?rabbanutId=rb_a&active=true')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_b')}`)

    expect(res.status).toBe(200)
    expect(mockH.findAll).toHaveBeenCalledWith({ rabbanutId: 'rb_b', active: true })
    expect(mockWithCache).toHaveBeenCalledWith('hechsherim:list:rb:rb_b:true', expect.any(Number), expect.any(Function))
    const keys = mockWithCache.mock.calls.map(([key]) => key)
    expect(keys.some(k => k.startsWith('hechsherim:list:all'))).toBe(false)
  })

  it('mashgiach paginated list is scoped as well', async () => {
    mockH.findPage.mockResolvedValue({ items: [hechsher('h2', 'rb_b')], nextCursor: null })
    const res = await request(app).get('/api/hechsherim?limit=10&rabbanutId=rb_a')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_b')}`)

    expect(res.status).toBe(200)
    expect(mockH.findPage).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: 'rb_b' }))
  })

  it('cache keys differ per scope, and an owner filter cannot alias the unscoped key', async () => {
    const calls: [Role, string | null, string][] = [
      ['owner',     null,   ''],
      ['owner',     null,   '?rabbanutId=all'],
      ['rabbanut',  'rb_a', ''],
      ['mashgiach', 'rb_b', ''],
    ]
    for (const [role, rabbanutId, query] of calls) {
      const res = await request(app).get(`/api/hechsherim${query}`)
        .set('Authorization', `Bearer ${token(role, rabbanutId)}`)
      expect(res.status).toBe(200)
    }

    const keys = mockWithCache.mock.calls.map(([key]) => key)
    expect(keys).toEqual([
      'hechsherim:list:all:all',
      'hechsherim:list:rb:all:all',
      'hechsherim:list:rb:rb_a:all',
      'hechsherim:list:rb:rb_b:all',
    ])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', async (role) => {
    const res = await request(app).get('/api/hechsherim')
      .set('Authorization', `Bearer ${token(role, null)}`)

    expect(res.status).toBe(403)
    expect(mockH.findAll).not.toHaveBeenCalled()
    expect(mockWithCache).not.toHaveBeenCalled()
  })
})

describe('GET /api/hechsherim/:id tenant scoping', () => {
  it('owner reads any tenant\'s hechsher', async () => {
    mockH.findById.mockResolvedValue(hechsher('h1', 'rb_other'))
    const res = await request(app).get('/api/hechsherim/h1')
      .set('Authorization', `Bearer ${token('owner', null)}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('h1')
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s reads its own tenant\'s hechsher', async (role) => {
    mockH.findById.mockResolvedValue(hechsher('h1', 'rb_mine'))
    const res = await request(app).get('/api/hechsherim/h1')
      .set('Authorization', `Bearer ${token(role, 'rb_mine')}`)
    expect(res.status).toBe(200)
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s gets 403 for another tenant\'s hechsher', async (role) => {
    mockH.findById.mockResolvedValue(hechsher('h1', 'rb_other'))
    const res = await request(app).get('/api/hechsherim/h1')
      .set('Authorization', `Bearer ${token(role, 'rb_mine')}`)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'Forbidden' })
  })

  it('mashgiach without a rabbanutId fails closed', async () => {
    mockH.findById.mockResolvedValue(hechsher('h1', 'rb_other'))
    const res = await request(app).get('/api/hechsherim/h1')
      .set('Authorization', `Bearer ${token('mashgiach', null)}`)
    expect(res.status).toBe(403)
  })

  it('mashgiach still cannot write hechsherim (read scoping does not widen writes)', async () => {
    const res = await request(app).post('/api/hechsherim')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_mine')}`)
      .send({ name: 'X', shortName: 'X', type: 'Rabbanut', color: '#fff', rabbanutId: 'rb_mine' })
    expect(res.status).toBe(403)
    expect(mockH.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/rabbanuts tenant scoping', () => {
  it('owner lists every rabbanut', async () => {
    mockRb.findAll.mockResolvedValue([rabbanut('rb_a'), rabbanut('rb_b')])
    const res = await request(app).get('/api/rabbanuts?active=true')
      .set('Authorization', `Bearer ${token('owner', null)}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(mockRb.findAll).toHaveBeenCalledWith({ id: undefined, active: true })
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s only gets its own rabbanut', async (role) => {
    mockRb.findAll.mockResolvedValue([rabbanut('rb_mine')])
    const res = await request(app).get('/api/rabbanuts')
      .set('Authorization', `Bearer ${token(role, 'rb_mine')}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([expect.objectContaining({ id: 'rb_mine' })])
    expect(mockRb.findAll).toHaveBeenCalledWith({ id: 'rb_mine', active: undefined })
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', async (role) => {
    const res = await request(app).get('/api/rabbanuts')
      .set('Authorization', `Bearer ${token(role, null)}`)

    expect(res.status).toBe(403)
    expect(mockRb.findAll).not.toHaveBeenCalled()
  })
})

describe('GET /api/rabbanuts/:id tenant scoping', () => {
  it('owner reads any rabbanut', async () => {
    mockRb.findById.mockResolvedValue(rabbanut('rb_other'))
    const res = await request(app).get('/api/rabbanuts/rb_other')
      .set('Authorization', `Bearer ${token('owner', null)}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('rb_other')
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s reads its own rabbanut', async (role) => {
    mockRb.findById.mockResolvedValue(rabbanut('rb_mine'))
    const res = await request(app).get('/api/rabbanuts/rb_mine')
      .set('Authorization', `Bearer ${token(role, 'rb_mine')}`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('rb_mine')
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s gets 403 for another tenant without a lookup', async (role) => {
    mockRb.findById.mockResolvedValue(rabbanut('rb_other'))
    const res = await request(app).get('/api/rabbanuts/rb_other')
      .set('Authorization', `Bearer ${token(role, 'rb_mine')}`)
    expect(res.status).toBe(403)
    expect(mockRb.findById).not.toHaveBeenCalled()
  })

  it('404 when the caller\'s own rabbanut no longer exists', async () => {
    mockRb.findById.mockResolvedValue(null)
    const res = await request(app).get('/api/rabbanuts/rb_mine')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_mine')}`)
    expect(res.status).toBe(404)
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', async (role) => {
    mockRb.findById.mockResolvedValue(rabbanut('rb_other'))
    const res = await request(app).get('/api/rabbanuts/rb_other')
      .set('Authorization', `Bearer ${token(role, null)}`)
    expect(res.status).toBe(403)
  })
})

// inspection.controller does not use the helpers for writes, but its list used
// to leave a rabbanut account without a rabbanutId unfiltered (fail-open).
describe('GET /api/inspections tenant scoping', () => {
  beforeEach(() => {
    mockI.findAll.mockResolvedValue([])
  })

  it('owner lists every tenant', async () => {
    const res = await request(app).get('/api/inspections')
      .set('Authorization', `Bearer ${token('owner', null)}`)
    expect(res.status).toBe(200)
    expect(mockI.findAll).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: undefined }))
  })

  it('rabbanut is pinned to its own tenant', async () => {
    const res = await request(app).get('/api/inspections')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_a')}`)
    expect(res.status).toBe(200)
    expect(mockI.findAll).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: 'rb_a' }))
  })

  it('mashgiach is pinned to its own tenant and profile', async () => {
    const res = await request(app).get('/api/inspections?mashgiachId=m_other')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_b')}`)
    expect(res.status).toBe(200)
    expect(mockI.findAll).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: 'rb_b', mashgiachId: 'm_self' }))
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', async (role) => {
    const res = await request(app).get('/api/inspections')
      .set('Authorization', `Bearer ${token(role, null)}`)
    expect(res.status).toBe(403)
    expect(mockI.findAll).not.toHaveBeenCalled()
  })
})
