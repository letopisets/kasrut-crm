import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { env } from '../config/env'
import { mashgichimRepo } from '../db/mashgichim.repo'
import { usersRepo } from '../db/users.repo'
import type { User } from '../models/types'

// A public map-user token and a pre-2FA temp token are signed with the SAME
// secret as CRM tokens. They must NEVER authenticate a CRM endpoint — otherwise
// anyone who registers on the public map can read the whole internal database.
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET32',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))

const mockRepo = mashgichimRepo as jest.Mocked<typeof mashgichimRepo>
const mockUsersRepo = usersRepo as jest.Mocked<typeof usersRepo>
const app = createApp()

const currentOwner: User = {
  id: 'u1',
  name: 'Owner',
  email: 'o@crm.il',
  passwordHash: 'hash',
  role: 'owner',
  twoFactorEnabled: false,
  twoFactorBackupCodes: [],
}

beforeEach(() => {
  mockUsersRepo.findAuthById.mockResolvedValue(currentOwner)
})

const CRM = '/api/mashgichim' // representative CRM endpoint (authenticateJWT only)

describe('CRM endpoints reject non-CRM token audiences', () => {
  it('rejects a public map-user token (typ=map_user, no role)', async () => {
    const mapToken = jwt.sign(
      { sub: 'mu1', typ: 'map_user', name: 'Map User', email: 'mu@pub.il' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${mapToken}`)
    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })

  it('rejects a pre-2FA temp token (typ=2fa_pending, no role)', async () => {
    const temp = jwt.sign(
      { sub: 'u1', typ: '2fa_pending', jti: 'j1' },
      env.JWT_SECRET, { expiresIn: '5m' } as object,
    )
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${temp}`)
    expect(res.status).toBe(401)
  })

  it('rejects a legacy temp token that carries no role', async () => {
    const temp = jwt.sign({ sub: 'u1', jti: 'j1' }, env.JWT_SECRET, { expiresIn: '5m' } as object)
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${temp}`)
    expect(res.status).toBe(401)
  })

  it('accepts a valid CRM token (typ=crm, has role)', async () => {
    mockRepo.findAll.mockResolvedValue([])
    const crm = jwt.sign(
      { sub: 'u1', role: 'owner', typ: 'crm', name: 'Owner', email: 'o@crm.il' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${crm}`)
    expect(res.status).toBe(200)
  })

  it('accepts a legacy CRM token minted before the typ marker (role, no typ)', async () => {
    mockRepo.findAll.mockResolvedValue([])
    const legacy = jwt.sign(
      { sub: 'u1', role: 'owner', name: 'Owner', email: 'o@crm.il' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${legacy}`)
    expect(res.status).toBe(200)
  })

  it('rejects a token after the current user role changes', async () => {
    mockUsersRepo.findAuthById.mockResolvedValue({
      ...currentOwner,
      role: 'rabbanut',
      rabbanutId: 'rb1',
    })
    const staleOwner = jwt.sign(
      { sub: 'u1', role: 'owner', typ: 'crm', name: 'Owner', email: 'o@crm.il' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )

    const res = await request(app).get(CRM).set('Authorization', `Bearer ${staleOwner}`)

    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })

  it('rejects a token when the current account or tenant is inactive', async () => {
    mockUsersRepo.findAuthById.mockResolvedValue(null)
    const token = jwt.sign(
      { sub: 'u1', role: 'owner', typ: 'crm', name: 'Owner', email: 'o@crm.il' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )

    const res = await request(app).get(CRM).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })
})
