import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { env } from '../config/env'
import { documentsRepo } from '../db/documents.repo'
import { rabbanutRepo } from '../db/rabbanuts.repo'
import { usersRepo } from '../db/users.repo'
import { createDocumentSchema } from '../schemas'
import { serializeDocument } from '../serializers/document.serializer'
import type { KashrutDocument, Rabbanut, Role, User } from '../models/types'

// Any rabbanut used to list and delete every document (the owner's global
// regulations and other tenants' files), and url accepted javascript:.
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

const mockDocs  = documentsRepo as jest.Mocked<typeof documentsRepo>
const mockRb    = rabbanutRepo as jest.Mocked<typeof rabbanutRepo>
const mockUsers = usersRepo as jest.Mocked<typeof usersRepo>
const app = createApp()

/** Sign a CRM token and make the auth middleware resolve the same account.
 *  Pass `rabbanutId: null` for an owner, or a malformed tenant account. */
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

const auth = (role: Role, rabbanutId: string | null) => ({ Authorization: `Bearer ${token(role, rabbanutId)}` })

const doc = (id: string, rabbanutId: string | null, url?: string): KashrutDocument => ({
  id, name: `Doc ${id}`, category: 'Regulations', date: '2026-09-01', size: 0, ext: 'PDF', rabbanutId,
  ...(url ? { url } : {}),
})

const rabbanut = (id: string, active = true): Rabbanut => ({
  id, name: `R ${id}`, city: 'City', contact: '', phone: '', email: '', active, color: '#000',
})

const validBody = { name: 'Checklist', category: 'Forms', date: '2026-09-30', ext: 'PDF' }

const GLOBAL = doc('d_global', null)
const MINE   = doc('d_mine', 'rb_mine')
const OTHER  = doc('d_other', 'rb_other')

describe('createDocumentSchema url', () => {
  it.each([
    'https://example.org/regulations.pdf',
    'https://files.example.org/a/b?x=1#page=2',
    '  https://example.org/padded.pdf  ',
  ])('accepts https URL %s', (url) => {
    const r = createDocumentSchema.safeParse({ ...validBody, url })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.url).toBe(url.trim())
  })

  it.each([
    'javascript:alert(document.cookie)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'http://example.org/regulations.pdf',
    'ftp://example.org/file.pdf',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    '//example.org/protocol-relative.pdf',
    '/relative/path.pdf',
    'example.org/no-scheme.pdf',
    '',
  ])('rejects %s', (url) => {
    expect(createDocumentSchema.safeParse({ ...validBody, url }).success).toBe(false)
  })

  it('rejects URLs longer than 2048 characters', () => {
    const base = 'https://example.org/'
    const at = (n: number) => base + 'a'.repeat(n - base.length)
    expect(createDocumentSchema.safeParse({ ...validBody, url: at(2048) }).success).toBe(true)
    expect(createDocumentSchema.safeParse({ ...validBody, url: at(2049) }).success).toBe(false)
  })

  it('url stays optional', () => {
    const r = createDocumentSchema.safeParse(validBody)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.url).toBeUndefined()
  })
})

describe('document serializer', () => {
  it('returns rabbanutId, null for global documents', () => {
    expect(serializeDocument(GLOBAL).rabbanutId).toBeNull()
    expect(serializeDocument(MINE).rabbanutId).toBe('rb_mine')
  })

  it('returns stored https links unchanged', () => {
    expect(serializeDocument(doc('d', null, 'https://example.org/a.pdf')).url).toBe('https://example.org/a.pdf')
    expect(serializeDocument(GLOBAL).url).toBeNull()
  })

  // Rows written around the create schema: the PDF importer stored the
  // operator's local path, and older rows predate the https rule.
  it.each([
    'C:\\MyProject\\docs-kashrut\\regulations.pdf',
    '/home/operator/docs/regulations.pdf',
    'javascript:alert(1)',
    'http://example.org/a.pdf',
    'data:text/html,<script>alert(1)</script>',
  ])('never returns stored non-https url %s', (url) => {
    expect(serializeDocument(doc('d', null, url)).url).toBeNull()
  })
})

describe('GET /api/documents', () => {
  beforeEach(() => {
    mockDocs.findAll.mockResolvedValue([GLOBAL, MINE])
  })

  it('owner lists every document', async () => {
    mockDocs.findAll.mockResolvedValue([GLOBAL, MINE, OTHER])
    const res = await request(app).get('/api/documents').set(auth('owner', null))

    expect(res.status).toBe(200)
    expect(res.body.map((d: { rabbanutId: string | null }) => d.rabbanutId)).toEqual([null, 'rb_mine', 'rb_other'])
    expect(mockDocs.findAll).toHaveBeenCalledWith({ category: undefined, rabbanutId: undefined })
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s sees global + own tenant only', async (role) => {
    const res = await request(app).get('/api/documents?rabbanutId=rb_other').set(auth(role, 'rb_mine'))

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(mockDocs.findAll).toHaveBeenCalledWith({ category: undefined, rabbanutId: 'rb_mine' })
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s without a rabbanutId fails closed', async (role) => {
    const res = await request(app).get('/api/documents').set(auth(role, null))

    expect(res.status).toBe(403)
    expect(mockDocs.findAll).not.toHaveBeenCalled()
  })

  it('passes a valid category filter and rejects anything else', async () => {
    const ok = await request(app).get('/api/documents?category=Pesach').set(auth('rabbanut', 'rb_mine'))
    expect(ok.status).toBe(200)
    expect(mockDocs.findAll).toHaveBeenCalledWith({ category: 'Pesach', rabbanutId: 'rb_mine' })

    mockDocs.findAll.mockClear()
    for (const query of ['?category=Nope', '?category[not]=Pesach']) {
      const res = await request(app).get(`/api/documents${query}`).set(auth('owner', null))
      expect(res.status).toBe(400)
    }
    expect(mockDocs.findAll).not.toHaveBeenCalled()
  })

  it('does not leak a stored local file path to tenant users', async () => {
    mockDocs.findAll.mockResolvedValue([doc('d_imported', null, 'C:\\MyProject\\docs-kashrut\\a.pdf')])
    const res = await request(app).get('/api/documents').set(auth('mashgiach', 'rb_mine'))

    expect(res.status).toBe(200)
    expect(res.body[0].url).toBeNull()
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/api/documents')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/documents/:id', () => {
  const byId: Record<string, KashrutDocument> = { d_global: GLOBAL, d_mine: MINE, d_other: OTHER }
  beforeEach(() => {
    mockDocs.findById.mockImplementation(async (id) => byId[id] ?? null)
  })

  it('owner reads global and any tenant\'s document', async () => {
    for (const id of ['d_global', 'd_mine', 'd_other']) {
      const res = await request(app).get(`/api/documents/${id}`).set(auth('owner', null))
      expect(res.status).toBe(200)
      expect(res.body.id).toBe(id)
    }
  })

  it.each(['rabbanut', 'mashgiach'] as const)('%s reads global and own, 403 for another tenant', async (role) => {
    const global = await request(app).get('/api/documents/d_global').set(auth(role, 'rb_mine'))
    expect(global.status).toBe(200)
    expect(global.body.rabbanutId).toBeNull()

    const mine = await request(app).get('/api/documents/d_mine').set(auth(role, 'rb_mine'))
    expect(mine.status).toBe(200)
    expect(mine.body.rabbanutId).toBe('rb_mine')

    const other = await request(app).get('/api/documents/d_other').set(auth(role, 'rb_mine'))
    expect(other.status).toBe(403)
    expect(other.body).toEqual({ error: 'Forbidden' })
  })

  it('404 for an unknown id', async () => {
    const res = await request(app).get('/api/documents/nope').set(auth('rabbanut', 'rb_mine'))
    expect(res.status).toBe(404)
  })

  it('tenant account without a rabbanutId cannot read even global documents', async () => {
    const res = await request(app).get('/api/documents/d_global').set(auth('rabbanut', null))
    expect(res.status).toBe(403)
  })
})

describe('POST /api/documents', () => {
  beforeEach(() => {
    mockDocs.create.mockImplementation(async (input) => ({ id: 'd_new', ...input }))
    mockRb.findById.mockImplementation(async (id) => {
      if (id === 'rb_active') return rabbanut('rb_active')
      if (id === 'rb_inactive') return rabbanut('rb_inactive', false)
      return null
    })
  })

  it.each([
    ['omitted', {}],
    ['null', { rabbanutId: null }],
  ])('owner creates a global document when rabbanutId is %s', async (_label, scope) => {
    const res = await request(app).post('/api/documents').set(auth('owner', null)).send({ ...validBody, ...scope })

    expect(res.status).toBe(201)
    expect(res.body.rabbanutId).toBeNull()
    expect(mockDocs.create).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: null }))
    expect(mockRb.findById).not.toHaveBeenCalled()
  })

  it('owner creates a document for an existing active rabbanut', async () => {
    const res = await request(app).post('/api/documents').set(auth('owner', null))
      .send({ ...validBody, rabbanutId: 'rb_active', url: 'https://example.org/a.pdf' })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ rabbanutId: 'rb_active', url: 'https://example.org/a.pdf' })
    expect(mockDocs.create).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: 'rb_active', size: 0 }))
  })

  it.each(['rb_inactive', 'rb_missing'])('owner cannot target %s', async (rabbanutId) => {
    const res = await request(app).post('/api/documents').set(auth('owner', null)).send({ ...validBody, rabbanutId })

    expect(res.status).toBe(400)
    expect(mockDocs.create).not.toHaveBeenCalled()
  })

  it.each([
    ['omitted', {}],
    ['its own id', { rabbanutId: 'rb_mine' }],
  ])('rabbanut is pinned to its own tenant when rabbanutId is %s', async (_label, scope) => {
    const res = await request(app).post('/api/documents').set(auth('rabbanut', 'rb_mine')).send({ ...validBody, ...scope })

    expect(res.status).toBe(201)
    expect(res.body.rabbanutId).toBe('rb_mine')
    expect(mockDocs.create).toHaveBeenCalledWith(expect.objectContaining({ rabbanutId: 'rb_mine' }))
  })

  it.each([
    ['another tenant', { rabbanutId: 'rb_other' }],
    ['global (null)', { rabbanutId: null }],
  ])('rabbanut cannot create for %s', async (_label, scope) => {
    const res = await request(app).post('/api/documents').set(auth('rabbanut', 'rb_mine')).send({ ...validBody, ...scope })

    expect(res.status).toBe(403)
    expect(mockDocs.create).not.toHaveBeenCalled()
  })

  it('rabbanut account without a rabbanutId fails closed', async () => {
    const res = await request(app).post('/api/documents').set(auth('rabbanut', null)).send(validBody)
    expect(res.status).toBe(403)
    expect(mockDocs.create).not.toHaveBeenCalled()
  })

  it('mashgiach cannot create documents', async () => {
    const res = await request(app).post('/api/documents').set(auth('mashgiach', 'rb_mine')).send(validBody)
    expect(res.status).toBe(403)
    expect(mockDocs.create).not.toHaveBeenCalled()
  })

  it.each([
    'javascript:alert(1)',
    'http://example.org/a.pdf',
    'data:text/html,<script>alert(1)</script>',
  ])('rejects url %s with 400', async (url) => {
    const res = await request(app).post('/api/documents').set(auth('owner', null)).send({ ...validBody, url })
    expect(res.status).toBe(400)
    expect(mockDocs.create).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/documents/:id', () => {
  const byId: Record<string, KashrutDocument> = { d_global: GLOBAL, d_mine: MINE, d_other: OTHER }
  beforeEach(() => {
    mockDocs.findById.mockImplementation(async (id) => byId[id] ?? null)
    mockDocs.remove.mockResolvedValue(true)
  })

  it('owner deletes global and any tenant\'s document', async () => {
    for (const id of ['d_global', 'd_other']) {
      const res = await request(app).delete(`/api/documents/${id}`).set(auth('owner', null))
      expect(res.status).toBe(204)
      expect(mockDocs.remove).toHaveBeenCalledWith(id)
    }
  })

  it('rabbanut deletes its own tenant\'s document', async () => {
    const res = await request(app).delete('/api/documents/d_mine').set(auth('rabbanut', 'rb_mine'))
    expect(res.status).toBe(204)
    expect(mockDocs.remove).toHaveBeenCalledWith('d_mine')
  })

  it.each(['d_global', 'd_other'])('rabbanut cannot delete %s', async (id) => {
    const res = await request(app).delete(`/api/documents/${id}`).set(auth('rabbanut', 'rb_mine'))
    expect(res.status).toBe(403)
    expect(mockDocs.remove).not.toHaveBeenCalled()
  })

  it('rabbanut account without a rabbanutId cannot delete', async () => {
    const res = await request(app).delete('/api/documents/d_mine').set(auth('rabbanut', null))
    expect(res.status).toBe(403)
    expect(mockDocs.remove).not.toHaveBeenCalled()
  })

  it('mashgiach cannot delete documents, even its own tenant\'s', async () => {
    const res = await request(app).delete('/api/documents/d_mine').set(auth('mashgiach', 'rb_mine'))
    expect(res.status).toBe(403)
    expect(mockDocs.findById).not.toHaveBeenCalled()
    expect(mockDocs.remove).not.toHaveBeenCalled()
  })

  it('404 for an unknown id', async () => {
    const res = await request(app).delete('/api/documents/nope').set(auth('owner', null))
    expect(res.status).toBe(404)
    expect(mockDocs.remove).not.toHaveBeenCalled()
  })
})
