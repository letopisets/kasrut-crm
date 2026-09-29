import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { env } from '../config/env'
import { mashgichimRepo } from '../db/mashgichim.repo'
import { usersRepo } from '../db/users.repo'
import { signCrmAccessToken, signMapAccessToken, signTwoFactorPendingToken } from '../lib/jwt'
import type { User } from '../models/types'
import { signWithPurposeKey } from './jwtTestUtils'

// Public map-user tokens and pre-2FA temp tokens must NEVER authenticate a CRM
// endpoint — otherwise anyone who registers on the public map can read the
// whole internal database. They are signed with different derived keys and
// audiences, and the CRM verifier still checks typ/role as defence in depth.
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

const ownerClaims = { sub: 'u1', role: 'owner' as const, name: 'Owner', email: 'o@crm.il', ver: 0 }

beforeEach(() => {
  mockUsersRepo.findAuthById.mockResolvedValue(currentOwner)
})

const CRM = '/api/mashgichim' // representative CRM endpoint (authenticateJWT only)

describe('CRM endpoints reject non-CRM token audiences', () => {
  it('rejects a public map-user token', async () => {
    const mapToken = signMapAccessToken({ sub: 'mu1', name: 'Map User', email: 'mu@pub.il', ver: 0 })
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${mapToken}`)
    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })

  it('rejects a pre-2FA temp token', async () => {
    const temp = signTwoFactorPendingToken({ sub: 'u1' })
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${temp}`)
    expect(res.status).toBe(401)
  })

  it('rejects a map-access-keyed token that carries CRM claims and audience', async () => {
    const forged = signWithPurposeKey('map-access', { ...ownerClaims, typ: 'crm', jti: 'j1' }, { audience: 'crm-access' })
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
    expect(mockUsersRepo.findAuthById).not.toHaveBeenCalled()
  })

  it.each([
    ['no typ marker', { ...ownerClaims, jti: 'j1' }],
    ['no role', { sub: 'u1', typ: 'crm', jti: 'j1', ver: 0 }],
    ['no token id', { ...ownerClaims, typ: 'crm' }],
  ])('rejects a CRM-keyed token with %s', async (_label, payload) => {
    const token = signWithPurposeKey('crm-access', payload)
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(mockUsersRepo.findAuthById).not.toHaveBeenCalled()
  })

  it('accepts a valid CRM token', async () => {
    mockRepo.findAll.mockResolvedValue([])
    const crm = signCrmAccessToken(ownerClaims)
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${crm}`)
    expect(res.status).toBe(200)
  })

  it('rejects a legacy CRM token signed with the raw JWT_SECRET', async () => {
    const legacy = jwt.sign(
      { ...ownerClaims, typ: 'crm', jti: 'j1' },
      env.JWT_SECRET, { expiresIn: '1h' } as object,
    )
    const res = await request(app).get(CRM).set('Authorization', `Bearer ${legacy}`)
    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })

  it('rejects a token after the current user role changes', async () => {
    mockUsersRepo.findAuthById.mockResolvedValue({
      ...currentOwner,
      role: 'rabbanut',
      rabbanutId: 'rb1',
    })
    const staleOwner = signCrmAccessToken(ownerClaims)

    const res = await request(app).get(CRM).set('Authorization', `Bearer ${staleOwner}`)

    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })

  it('rejects a token when the current account or tenant is inactive', async () => {
    mockUsersRepo.findAuthById.mockResolvedValue(null)
    const token = signCrmAccessToken(ownerClaims)

    const res = await request(app).get(CRM).set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(mockRepo.findAll).not.toHaveBeenCalled()
  })
})
