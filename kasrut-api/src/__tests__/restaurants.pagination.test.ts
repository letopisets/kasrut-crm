import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { restaurantsRepo } from '../db/restaurants.repo'
import { env } from '../config/env'
import { withCache } from '../lib/cache'
import type { Restaurant } from '../models/types'

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

const mockRepo = restaurantsRepo as jest.Mocked<typeof restaurantsRepo>
const mockWithCache = withCache as jest.MockedFunction<typeof withCache>

const ownerToken = jwt.sign(
  { sub: 'u1', role: 'owner', name: 'Owner', email: 'o@test.il' },
  env.JWT_SECRET,
  { expiresIn: '1h' } as object,
)

const sample = (id: string, name: string): Restaurant => ({
  id, name, address: 'addr', city: 'TLV',
  levelId: 'kl_regular', level: 'Regular', hechsherId: 'h1', mashgiachId: undefined,
  kitniyot: false, expires: '2030-01-01', status: 'ok',
  rabbanutId: 'rb1', notes: undefined, lastInspection: undefined,
})

const app = createApp()

describe('GET /api/restaurants pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns plain array when no limit (back-compat)', async () => {
    mockRepo.findAll.mockResolvedValue([sample('r1', 'A'), sample('r2', 'B')])

    const res = await request(app)
      .get('/api/restaurants')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(2)
    expect(mockRepo.findPage).not.toHaveBeenCalled()
    expect(mockWithCache).toHaveBeenCalledWith(
      expect.stringContaining('restaurants:list:'),
      300,
      expect.any(Function),
    )
  })

  it('returns page object with nextCursor when limit is provided', async () => {
    mockRepo.findPage.mockResolvedValue({
      items: [sample('r1', 'A'), sample('r2', 'B')],
      nextCursor: 'r2',
    })

    const res = await request(app)
      .get('/api/restaurants?limit=2')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      items: expect.any(Array),
      nextCursor: 'r2',
    })
    expect(res.body.items).toHaveLength(2)
    expect(mockRepo.findPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }))
    expect(mockWithCache).toHaveBeenCalledWith(
      expect.stringContaining('"limit":2'),
      300,
      expect.any(Function),
    )
  })

  it('passes cursor through to repo', async () => {
    mockRepo.findPage.mockResolvedValue({ items: [], nextCursor: null })

    await request(app)
      .get('/api/restaurants?limit=10&cursor=r5')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(mockRepo.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, cursor: 'r5' }),
    )
  })

  it('returns nextCursor null when last page', async () => {
    mockRepo.findPage.mockResolvedValue({
      items: [sample('r9', 'Last')],
      nextCursor: null,
    })

    const res = await request(app)
      .get('/api/restaurants?limit=50')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.body.nextCursor).toBeNull()
  })

  it('rejects limit greater than 200', async () => {
    const res = await request(app)
      .get('/api/restaurants?limit=500')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(400)
  })

  it('rejects non-numeric limit', async () => {
    const res = await request(app)
      .get('/api/restaurants?limit=abc')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(400)
  })
})
