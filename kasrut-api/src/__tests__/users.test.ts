import path from 'path'
import request from 'supertest'
import { createApp } from '../app'
import { usersRepo, UserChangedError } from '../db/users.repo'
import { Prisma } from '../generated/prisma/client'
import { signCrmAccessToken } from '../lib/jwt'
import type { User } from '../models/types'

// ── Mocks ──────────────────────────────────────────────────────────────────
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/restaurants.repo')
jest.mock('../db/inspections.repo')
jest.mock('../db/mashgichim.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/documents.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'MOCKSECRET',
  generateURI:    () => 'otpauth://totp/test',
  verifySync:     ({ token }: { token: string }) => ({ valid: token === '123456' }),
}))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))

const mockRepo = usersRepo as jest.Mocked<typeof usersRepo>

const ownerUser: User = {
  id:                   'u1',
  name:                 'Owner',
  email:                'owner@test.il',
  passwordHash:         '$2a$08$hash',
  role:                 'owner',
  // REQUIRE_OWNER_2FA: a signed-in owner has 2FA, or every call but setup is refused
  twoFactorEnabled:     true,
  twoFactorBackupCodes: [],
}

const rabbanutUser: User = {
  id:                   'u2',
  name:                 'Admin',
  email:                'admin@test.il',
  passwordHash:         '$2a$08$hash',
  role:                 'rabbanut',
  twoFactorEnabled:     false,
  twoFactorBackupCodes: [],
  rabbanutId:           'rb1',
}

const mashgiachUser: User = {
  id:                   'u3',
  name:                 'Mashgiach',
  email:                'mashgiach@test.il',
  passwordHash:         '$2a$08$hash',
  role:                 'mashgiach',
  twoFactorEnabled:     false,
  twoFactorBackupCodes: [],
  rabbanutId:           'rb1',
  mashgiachId:          'm1',
}

function ownerToken() {
  return signCrmAccessToken(
    { sub: ownerUser.id, role: ownerUser.role, name: ownerUser.name, email: ownerUser.email, ver: 0 },
  )
}

function rabbanutToken() {
  return signCrmAccessToken({
    sub: rabbanutUser.id,
    role: rabbanutUser.role,
    name: rabbanutUser.name,
    email: rabbanutUser.email,
    rabbanutId: rabbanutUser.rabbanutId,
    ver: 0,
  })
}

// ── App ────────────────────────────────────────────────────────────────────
const app = createApp()

// ── Tests ──────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockRepo.validateTenantAssignment.mockResolvedValue(true)
  mockRepo.findAuthById.mockImplementation(async id => {
    if (id === ownerUser.id) return ownerUser
    if (id === rabbanutUser.id) return rabbanutUser
    return null
  })
})

describe('GET /api/users', () => {
  it('returns all users for owner', async () => {
    mockRepo.findAll.mockResolvedValue([ownerUser, rabbanutUser])

    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${ownerToken()}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).not.toHaveProperty('passwordHash')
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/users')
    expect(res.status).toBe(401)
  })

  it('returns 403 for rabbanut role', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${rabbanutToken()}`)
    expect(res.status).toBe(403)
  })
})

describe('GET /api/users/:id', () => {
  it('returns user by id for owner', async () => {
    mockRepo.findById.mockResolvedValue(ownerUser)

    const res = await request(app)
      .get('/api/users/u1')
      .set('Authorization', `Bearer ${ownerToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('u1')
  })

  it('returns 404 for unknown id', async () => {
    mockRepo.findById.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/users/unknown')
      .set('Authorization', `Bearer ${ownerToken()}`)

    expect(res.status).toBe(404)
  })
})

describe('POST /api/users', () => {
  it('creates a new user', async () => {
    const newUser: User = { ...rabbanutUser, id: 'u3', name: 'New User', email: 'new@test.il' }
    mockRepo.create.mockResolvedValue(newUser)

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        name: 'New User', email: 'new@test.il', password: 'password1234',
        role: 'rabbanut', rabbanutId: 'rb1',
      })

    expect(res.status).toBe(201)
    expect(res.body.email).toBe('new@test.il')
  })

  it.each(['rabbanut', 'mashgiach'] as const)(
    'rejects a %s user without rabbanutId',
    async role => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${ownerToken()}`)
        .send({ name: 'Tenant User', email: `${role}@test.il`, password: 'password1234', role })

      expect(res.status).toBe(400)
      expect(mockRepo.create).not.toHaveBeenCalled()
    },
  )

  it('rejects null tenant links on create (only PATCH may clear them)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({
        name: 'Owner Two', email: 'owner2@test.il', password: 'password1234',
        role: 'owner', rabbanutId: null,
      })

    expect(res.status).toBe(400)
    expect(mockRepo.create).not.toHaveBeenCalled()
  })

  it('returns 403 for non-owner', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${rabbanutToken()}`)
      .send({ name: 'X', email: 'x@test.il', password: 'pass', role: 'rabbanut' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/users/:id', () => {
  it('updates a user', async () => {
    const updated: User = { ...ownerUser, name: 'Updated Name' }
    mockRepo.findById.mockResolvedValue(ownerUser)
    mockRepo.update.mockResolvedValue(updated)

    const res = await request(app)
      .patch('/api/users/u1')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'Updated Name' })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated Name')
  })

  it('returns 404 when user not found', async () => {
    mockRepo.findById.mockResolvedValue(null)

    const res = await request(app)
      .patch('/api/users/nope')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ name: 'X' })

    expect(res.status).toBe(404)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('rejects conversion to a tenant role without a resulting rabbanutId', async () => {
    mockRepo.findById.mockResolvedValue(ownerUser)

    const res = await request(app)
      .patch('/api/users/u1')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ role: 'rabbanut' })

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('allows conversion to a tenant role with an explicit rabbanutId', async () => {
    const updated: User = { ...ownerUser, role: 'rabbanut', rabbanutId: 'rb1' }
    mockRepo.findById.mockResolvedValue(ownerUser)
    mockRepo.update.mockResolvedValue(updated)

    const res = await request(app)
      .patch('/api/users/u1')
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send({ role: 'rabbanut', rabbanutId: 'rb1' })

    expect(res.status).toBe(200)
    expect(mockRepo.update).toHaveBeenCalledWith(
      'u1', expect.objectContaining({ role: 'rabbanut', rabbanutId: 'rb1' }),
      { role: 'owner', rabbanutId: null, mashgiachId: null },
    )
  })
})

describe('PATCH /api/users/:id tenant links', () => {
  function patch(id: string, body: object) {
    return request(app)
      .patch(`/api/users/${id}`)
      .set('Authorization', `Bearer ${ownerToken()}`)
      .send(body)
  }

  it('converts rabbanut -> owner when rabbanutId is cleared with null', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)
    mockRepo.update.mockResolvedValue({ ...rabbanutUser, role: 'owner', rabbanutId: undefined })

    const res = await patch('u2', { role: 'owner', rabbanutId: null })

    expect(res.status).toBe(200)
    expect(res.body.role).toBe('owner')
    expect(mockRepo.validateTenantAssignment).toHaveBeenCalledWith({ role: 'owner' })
    expect(mockRepo.update).toHaveBeenCalledWith(
      'u2', { role: 'owner', rabbanutId: null },
      { role: 'rabbanut', rabbanutId: 'rb1', mashgiachId: null },
    )
  })

  it('rejects rabbanut -> owner that keeps the stored rabbanutId', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)

    const res = await patch('u2', { role: 'owner' })

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('converts mashgiach -> rabbanut when mashgiachId is cleared with null', async () => {
    mockRepo.findById.mockResolvedValue(mashgiachUser)
    mockRepo.update.mockResolvedValue({ ...mashgiachUser, role: 'rabbanut', mashgiachId: undefined })

    const res = await patch('u3', { role: 'rabbanut', mashgiachId: null })

    expect(res.status).toBe(200)
    expect(mockRepo.validateTenantAssignment).toHaveBeenCalledWith({ role: 'rabbanut', rabbanutId: 'rb1' })
    expect(mockRepo.update).toHaveBeenCalledWith(
      'u3', { role: 'rabbanut', mashgiachId: null },
      { role: 'mashgiach', rabbanutId: 'rb1', mashgiachId: 'm1' },
    )
  })

  it('rejects mashgiach -> rabbanut that keeps the stored mashgiachId', async () => {
    mockRepo.findById.mockResolvedValue(mashgiachUser)

    const res = await patch('u3', { role: 'rabbanut' })

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('converts owner -> rabbanut with an active rabbanut', async () => {
    mockRepo.findById.mockResolvedValue(ownerUser)
    mockRepo.update.mockResolvedValue({ ...ownerUser, role: 'rabbanut', rabbanutId: 'rb1' })

    const res = await patch('u1', { role: 'rabbanut', rabbanutId: 'rb1' })

    expect(res.status).toBe(200)
    expect(mockRepo.validateTenantAssignment).toHaveBeenCalledWith({ role: 'rabbanut', rabbanutId: 'rb1' })
  })

  it('rejects owner -> rabbanut when the rabbanut is inactive or deleted', async () => {
    mockRepo.findById.mockResolvedValue(ownerUser)
    mockRepo.validateTenantAssignment.mockResolvedValue(false)

    const res = await patch('u1', { role: 'rabbanut', rabbanutId: 'rb_inactive' })

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('rejects an owner with a rabbanutId', async () => {
    mockRepo.findById.mockResolvedValue(ownerUser)

    const res = await patch('u1', { rabbanutId: 'rb1' })

    expect(res.status).toBe(400)
    expect(mockRepo.validateTenantAssignment).not.toHaveBeenCalled()
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('rejects clearing the rabbanutId of a tenant role', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)

    const res = await patch('u2', { rabbanutId: null })

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it.each([
    ['rabbanut -> mashgiach without a profile', rabbanutUser, { role: 'mashgiach' }],
    ['mashgiach with its profile cleared',      mashgiachUser, { mashgiachId: null }],
  ])('rejects %s', async (_label, existing, body) => {
    mockRepo.findById.mockResolvedValue(existing)

    const res = await patch(existing.id, body)

    expect(res.status).toBe(400)
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('rejects a mashgiach profile from another or inactive rabbanut', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)
    mockRepo.validateTenantAssignment.mockResolvedValue(false)

    const res = await patch('u2', { role: 'mashgiach', mashgiachId: 'm_other_tenant' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Role must reference an active profile in the same active rabbanut')
    expect(mockRepo.validateTenantAssignment).toHaveBeenCalledWith({
      role: 'mashgiach', rabbanutId: 'rb1', mashgiachId: 'm_other_tenant',
    })
    expect(mockRepo.update).not.toHaveBeenCalled()
  })

  it('never passes fields outside the PATCH whitelist to the repository', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)
    mockRepo.update.mockResolvedValue({ ...rabbanutUser, name: 'Renamed' })

    const res = await patch('u2', {
      name: 'Renamed',
      password: 'new-password-123',
      passwordHash: '$2a$08$attacker',
      sessionVersion: 0,
      twoFactorEnabled: false,
      twoFactorSecret: 'PLAINTEXT',
      twoFactorBackupCodes: [],
      passwordChangedAt: null,
      createdAt: '2020-01-01',
      id: 'u1',
    })

    expect(res.status).toBe(200)
    expect(mockRepo.update).toHaveBeenCalledTimes(1)
    const [id, body] = mockRepo.update.mock.calls[0]
    expect(id).toBe('u2')
    expect(body).toEqual({ name: 'Renamed' })
  })

  it('returns 409 when the user changed between validation and write', async () => {
    mockRepo.findById.mockResolvedValue(rabbanutUser)
    mockRepo.update.mockRejectedValue(new UserChangedError())

    const res = await patch('u2', { role: 'owner', rabbanutId: null })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Conflict: the user was changed concurrently; reload and retry' })
  })

  // End to end through asyncHandler -> next(err) -> errorHandler, with the
  // error object Prisma 7 + adapter-pg throws for a trigger RAISE (the real
  // DriverAdapterError class, resolved from adapter-pg's own dependencies).
  it('maps a tenant-trigger rejection from the database to 409 without leaking it', async () => {
    const adapterUtilsPath = require.resolve('@prisma/driver-adapter-utils', {
      paths: [path.dirname(require.resolve('@prisma/adapter-pg'))],
    })
    const { DriverAdapterError } = jest.requireActual<{
      DriverAdapterError: new (payload: Record<string, unknown>) => Error
    }>(adapterUtilsPath)
    const message = 'User and mashgiach must belong to the same rabbanut'
    const dbError = Object.assign(new DriverAdapterError({
      originalCode: '23514', originalMessage: message,
      kind: 'postgres', code: '23514', severity: 'ERROR', message,
    }), { clientVersion: '7.7.0' })
    mockRepo.findById.mockResolvedValue(rabbanutUser)
    mockRepo.update.mockRejectedValue(dbError)

    const res = await patch('u2', { role: 'mashgiach', mashgiachId: 'm1' })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Conflict: records must belong to the same rabbanut' })
    expect(res.text).not.toContain(message)
  })
})

// The HTTP tests above mock the repository; these exercise the real
// implementation against the (auto-mocked) Prisma client.
describe('usersRepo tenant links (actual repository)', () => {
  const {
    usersRepo: realRepo,
    UserChangedError: RealUserChangedError,
  } = jest.requireActual<typeof import('../db/users.repo')>('../db/users.repo')
  const db = {
    user:      { update: jest.fn(), findUnique: jest.fn() },
    rabbanut:  { findFirst: jest.fn() },
    mashgiach: { findFirst: jest.fn() },
  }

  const row = {
    id: 'u2', name: 'Admin', email: 'admin@test.il', passwordHash: 'h', role: 'owner',
    rabbanutId: null, mashgiachId: null, twoFactorSecret: null, twoFactorEnabled: false,
    twoFactorBackupCodes: [], sessionVersion: 0, passwordChangedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
  }

  // jest's automock of ../lib/prisma exports `prisma` as undefined; the real
  // repository reads the export at call time, so swap in stub delegates.
  const prismaModule = jest.requireMock<{ prisma: unknown }>('../lib/prisma')
  const originalPrisma = prismaModule.prisma
  afterAll(() => { prismaModule.prisma = originalPrisma })

  beforeEach(() => {
    prismaModule.prisma = db
    db.rabbanut.findFirst.mockResolvedValue({ id: 'rb1' })
    db.mashgiach.findFirst.mockResolvedValue({ id: 'm1' })
  })

  const asRabbanut = { role: 'rabbanut', rabbanutId: 'rb1', mashgiachId: null } as const

  it('update() writes NULL to clear a tenant link, pinned to the validated state', async () => {
    db.user.update.mockResolvedValue(row)

    const u = await realRepo.update('u2', { role: 'owner', rabbanutId: null }, asRabbanut)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'u2', role: 'rabbanut', rabbanutId: 'rb1', AND: [{ mashgiachId: null }] },
      data:  { role: 'owner', rabbanutId: null, sessionVersion: { increment: 1 } },
    })
    expect(u).not.toHaveProperty('rabbanutId')
  })

  it('update() leaves tenant links and sessionVersion alone when they are absent', async () => {
    db.user.update.mockResolvedValue({ ...row, role: 'rabbanut', rabbanutId: 'rb1' })

    await realRepo.update('u2', { name: 'Renamed' }, asRabbanut)

    const { data } = db.user.update.mock.calls[0][0]
    expect(data).toEqual({ name: 'Renamed' })
    expect(data).not.toHaveProperty('rabbanutId')
    expect(data).not.toHaveProperty('mashgiachId')
  })

  it('update() bumps sessionVersion only when role or a tenant link really changes', async () => {
    db.user.update.mockResolvedValue({ ...row, role: 'rabbanut', rabbanutId: 'rb1' })

    // Re-sending the stored values is not a change.
    await realRepo.update('u2', { role: 'rabbanut', rabbanutId: 'rb1', mashgiachId: null }, asRabbanut)
    expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('sessionVersion')

    // Every real change revokes older tokens, so rb1 -> rb2 -> rb1 cannot
    // bring a token from the first rb1 period back to life.
    const changes = [
      { rabbanutId: 'rb2' },
      { role: 'mashgiach' as const, mashgiachId: 'm1' },
      { role: 'owner' as const, rabbanutId: null },
    ]
    for (const change of changes) {
      db.user.update.mockClear()
      await realRepo.update('u2', change, asRabbanut)
      expect(db.user.update.mock.calls[0][0].data.sessionVersion).toEqual({ increment: 1 })
    }
  })

  it('update() writes only whitelisted fields', async () => {
    db.user.update.mockResolvedValue(row)
    const hostile = {
      name: 'N', passwordHash: 'x', sessionVersion: 0, twoFactorSecret: 'PLAINTEXT',
      twoFactorEnabled: false, twoFactorBackupCodes: [], passwordChangedAt: null, createdAt: 'x', id: 'u1',
    }

    await realRepo.update('u2', hostile as unknown as Parameters<typeof realRepo.update>[1], asRabbanut)

    expect(db.user.update.mock.calls[0][0].data).toEqual({ name: 'N' })
  })

  it('update() throws UserChangedError when the row no longer has the validated state', async () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('No record was found for an update.', {
      code: 'P2025', clientVersion: '7.7.0',
    })
    db.user.update.mockRejectedValue(notFound)

    db.user.findUnique.mockResolvedValue({ id: 'u2' })
    await expect(realRepo.update('u2', { role: 'owner', rabbanutId: null }, asRabbanut))
      .rejects.toBeInstanceOf(RealUserChangedError)

    db.user.findUnique.mockResolvedValue(null)
    await expect(realRepo.update('u2', { name: 'X' }, asRabbanut)).resolves.toBeNull()
  })

  it('validateTenantAssignment only accepts active, same-tenant profiles', async () => {
    await expect(realRepo.validateTenantAssignment({ role: 'owner' })).resolves.toBe(true)
    await expect(realRepo.validateTenantAssignment({ role: 'owner', rabbanutId: 'rb1' })).resolves.toBe(false)
    await expect(realRepo.validateTenantAssignment({ role: 'rabbanut' })).resolves.toBe(false)
    await expect(realRepo.validateTenantAssignment({ role: 'mashgiach', rabbanutId: 'rb1' })).resolves.toBe(false)
    await expect(realRepo.validateTenantAssignment({ role: 'mashgiach', rabbanutId: 'rb1', mashgiachId: 'm1' })).resolves.toBe(true)

    db.mashgiach.findFirst.mockResolvedValue(null) // other tenant or inactive profile
    await expect(realRepo.validateTenantAssignment({ role: 'mashgiach', rabbanutId: 'rb1', mashgiachId: 'm_other' })).resolves.toBe(false)
    expect(db.mashgiach.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'm_other', rabbanutId: 'rb1', active: true },
    }))

    db.rabbanut.findFirst.mockResolvedValue(null) // inactive or soft-deleted rabbanut
    await expect(realRepo.validateTenantAssignment({ role: 'rabbanut', rabbanutId: 'rb_inactive' })).resolves.toBe(false)
    expect(db.rabbanut.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'rb_inactive', active: true, deletedAt: null },
    }))
  })
})

describe('DELETE /api/users/:id', () => {
  it('deletes a user', async () => {
    mockRepo.remove.mockResolvedValue(true)

    const res = await request(app)
      .delete('/api/users/u1')
      .set('Authorization', `Bearer ${ownerToken()}`)

    expect(res.status).toBe(204)
  })

  it('returns 404 when user not found', async () => {
    mockRepo.remove.mockResolvedValue(false)

    const res = await request(app)
      .delete('/api/users/nope')
      .set('Authorization', `Bearer ${ownerToken()}`)

    expect(res.status).toBe(404)
  })
})
