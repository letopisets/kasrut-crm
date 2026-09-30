import request from 'supertest'
import { createApp } from '../app'
import { inspectionsRepo } from '../db/inspections.repo'
import { usersRepo } from '../db/users.repo'
import { signCrmAccessToken } from '../lib/jwt'
import type { Inspection } from '../models/types'

jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))

const mockRepo = inspectionsRepo as jest.Mocked<typeof inspectionsRepo>
const mockUsersRepo = usersRepo as jest.Mocked<typeof usersRepo>

const ownerUser = {
  id: 'u1',
  role: 'owner' as const,
  name: 'Owner',
  email: 'o@test.il',
  passwordHash: 'hash',
  // REQUIRE_OWNER_2FA: a signed-in owner has 2FA, or every call but setup is refused
  twoFactorEnabled: true,
  twoFactorBackupCodes: [],
}

const ownerToken = signCrmAccessToken({ sub: 'u1', role: 'owner', name: 'Owner', email: 'o@test.il', ver: 0 })

const sample = (id: string): Inspection => ({
  id,
  restaurantId: 'r1',
  mashgiachId:  'm1',
  date:         '2026-04-01',
  type:         'planned',
  result:       'pass',
  notes:        undefined,
})

const app = createApp()

describe('GET /api/inspections pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUsersRepo.findAuthById.mockResolvedValue(ownerUser)
  })

  it('returns plain array when no limit (back-compat)', async () => {
    mockRepo.findAll.mockResolvedValue([sample('i1'), sample('i2')])

    const res = await request(app)
      .get('/api/inspections')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(mockRepo.findPage).not.toHaveBeenCalled()
  })

  it('returns page object with nextCursor when limit is provided', async () => {
    mockRepo.findPage.mockResolvedValue({
      items: [sample('i1'), sample('i2')],
      nextCursor: 'i2',
    })

    const res = await request(app)
      .get('/api/inspections?limit=2')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.nextCursor).toBe('i2')
    expect(res.body.items).toHaveLength(2)
  })

  it('passes filters and cursor through to repo', async () => {
    mockRepo.findPage.mockResolvedValue({ items: [], nextCursor: null })

    await request(app)
      .get('/api/inspections?limit=10&cursor=i5&result=pass&type=planned')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(mockRepo.findPage).toHaveBeenCalledWith(expect.objectContaining({
      limit: 10, cursor: 'i5', result: 'pass', type: 'planned',
    }))
  })

  it('rejects limit greater than 200', async () => {
    const res = await request(app)
      .get('/api/inspections?limit=999')
      .set('Authorization', `Bearer ${ownerToken}`)

    expect(res.status).toBe(400)
  })
})
