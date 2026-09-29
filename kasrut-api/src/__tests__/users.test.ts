import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { usersRepo } from '../db/users.repo'
import { env } from '../config/env'
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
  twoFactorEnabled:     false,
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

function ownerToken() {
  return jwt.sign(
    { sub: ownerUser.id, role: ownerUser.role, name: ownerUser.name, email: ownerUser.email },
    env.JWT_SECRET,
    { expiresIn: '1h' } as object,
  )
}

function rabbanutToken() {
  return jwt.sign(
    {
      sub: rabbanutUser.id,
      role: rabbanutUser.role,
      name: rabbanutUser.name,
      email: rabbanutUser.email,
      rabbanutId: rabbanutUser.rabbanutId,
    },
    env.JWT_SECRET,
    { expiresIn: '1h' } as object,
  )
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
        name: 'New User', email: 'new@test.il', password: 'password123',
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
        .send({ name: 'Tenant User', email: `${role}@test.il`, password: 'password123', role })

      expect(res.status).toBe(400)
      expect(mockRepo.create).not.toHaveBeenCalled()
    },
  )

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
    )
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
