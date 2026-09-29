import request from 'supertest'
import { createApp } from '../app'
import { mashgichimRepo } from '../db/mashgichim.repo'
import { restaurantsRepo } from '../db/restaurants.repo'
import { usersRepo } from '../db/users.repo'
import { signCrmAccessToken } from '../lib/jwt'
import type { Mashgiach, User } from '../models/types'

// The mashgiach controller used to skip rabbanut-scoping entirely, so a rabbanut
// user could read/modify/assign another tenant's mashgichim by guessing an id.
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockM = mashgichimRepo as jest.Mocked<typeof mashgichimRepo>
const mockR = restaurantsRepo as jest.Mocked<typeof restaurantsRepo>
const mockUsers = usersRepo as jest.Mocked<typeof usersRepo>
const app = createApp()

const mashgiach = (rabbanutId: string): Mashgiach => ({
  id: 'm1', name: 'Mash', phone: '', email: 'm@x.il', area: '',
  hechsherimIds: [], assignedRestaurantIds: [], active: true, rabbanutId,
})

function token(role: 'owner' | 'rabbanut' | 'mashgiach', rabbanutId?: string) {
  const currentUser: User = {
    id: 'u1',
    name: 'U',
    email: 'u@crm.il',
    passwordHash: 'hash',
    role,
    ...(rabbanutId ? { rabbanutId } : {}),
    ...(role === 'mashgiach' ? { mashgiachId: 'm_mine' } : {}),
    twoFactorEnabled: false,
    twoFactorBackupCodes: [],
  }
  mockUsers.findAuthById.mockResolvedValue(currentUser)

  return signCrmAccessToken({
    sub: 'u1',
    role,
    name: 'U',
    email: 'u@crm.il',
    ver: 0,
    ...(rabbanutId ? { rabbanutId } : {}),
    ...(role === 'mashgiach' ? { mashgiachId: 'm_mine' } : {}),
  })
}

describe('GET /api/mashgichim/:id tenant scoping', () => {
  it('403 when a rabbanut reads a mashgiach of another rabbanut', async () => {
    mockM.findById.mockResolvedValue(mashgiach('rb_other'))
    const res = await request(app).get('/api/mashgichim/m1')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_mine')}`)
    expect(res.status).toBe(403)
  })

  it('200 when a rabbanut reads their own mashgiach', async () => {
    mockM.findById.mockResolvedValue(mashgiach('rb_mine'))
    const res = await request(app).get('/api/mashgichim/m1')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_mine')}`)
    expect(res.status).toBe(200)
  })

  it('200 when an owner reads any mashgiach', async () => {
    mockM.findById.mockResolvedValue(mashgiach('rb_other'))
    const res = await request(app).get('/api/mashgichim/m1')
      .set('Authorization', `Bearer ${token('owner')}`)
    expect(res.status).toBe(200)
  })

  it('403 when a mashgiach-role user tries to list mashgichim (cross-tenant PII)', async () => {
    const res = await request(app).get('/api/mashgichim')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_mine')}`)
    expect(res.status).toBe(403)
    expect(mockM.findAll).not.toHaveBeenCalled()
  })

  it('403 when a mashgiach-role user reads a mashgiach by id', async () => {
    const res = await request(app).get('/api/mashgichim/m1')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_mine')}`)
    expect(res.status).toBe(403)
    expect(mockM.findById).not.toHaveBeenCalled()
  })
})

describe('POST /api/mashgichim/:id/assign tenant scoping', () => {
  it('403 when a rabbanut assigns a restaurant of another rabbanut', async () => {
    mockM.findById.mockResolvedValue(mashgiach('rb_mine'))
    mockR.findById.mockResolvedValue({ id: 'r1', rabbanutId: 'rb_other' } as never)
    const res = await request(app).post('/api/mashgichim/m1/assign')
      .set('Authorization', `Bearer ${token('rabbanut', 'rb_mine')}`)
      .send({ restaurantId: 'r1' })
    expect(res.status).toBe(403)
    expect(mockM.assignRestaurant).not.toHaveBeenCalled()
  })

  it('400 when the restaurant and mashgiach belong to different rabbanuts (owner)', async () => {
    mockM.findById.mockResolvedValue(mashgiach('rb_a'))
    mockR.findById.mockResolvedValue({ id: 'r1', rabbanutId: 'rb_b' } as never)
    const res = await request(app).post('/api/mashgichim/m1/assign')
      .set('Authorization', `Bearer ${token('owner')}`)
      .send({ restaurantId: 'r1' })
    expect(res.status).toBe(400)
    expect(mockM.assignRestaurant).not.toHaveBeenCalled()
  })
})

describe('GET /api/restaurants/:id mashgiach assignment scoping', () => {
  const restaurant = (mashgiachId: string) => ({
    id: 'r1', name: 'Restaurant', address: 'A', city: 'Jerusalem',
    levelId: 'kl_regular', level: 'Regular', hechsherId: 'h1', mashgiachId,
    kitniyot: false, foodType: 'pareve', expires: '2030-01-01', status: 'ok',
    rabbanutId: 'rb_mine', notes: 'internal',
  }) as never

  it('403 when a mashgiach opens a restaurant not assigned to their mashgiach profile', async () => {
    mockR.findById.mockResolvedValue(restaurant('m_other'))

    const res = await request(app).get('/api/restaurants/r1')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_mine')}`)

    expect(res.status).toBe(403)
  })

  it('200 only when the restaurant is assigned to the current mashgiach profile', async () => {
    mockR.findById.mockResolvedValue(restaurant('m_mine'))

    const res = await request(app).get('/api/restaurants/r1')
      .set('Authorization', `Bearer ${token('mashgiach', 'rb_mine')}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('r1')
  })
})
