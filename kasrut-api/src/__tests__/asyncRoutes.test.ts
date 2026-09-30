import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../app'
import { env } from '../config/env'
import { kashrutLevelsRepo } from '../db/kashrutLevels.repo'
import { establishmentCategoriesRepo } from '../db/establishmentCategories.repo'
import { usersRepo } from '../db/users.repo'
import { Prisma } from '../generated/prisma/client'
import type { Role, User } from '../models/types'

// The kashrut-level and establishment-category controllers were bare async
// functions. Express 4 ignores the promise they return, so a DB error or a
// duplicate-name create became an unhandled rejection, which exits Node 22
// instead of reaching errorHandler.
jest.mock('../lib/prisma')
jest.mock('../db/users.repo')
jest.mock('../db/kashrutLevels.repo')
jest.mock('../db/establishmentCategories.repo')
jest.mock('otplib', () => ({
  generateSecret: () => 'M', generateURI: () => '', verifySync: () => ({ valid: true }),
}))
jest.mock('qrcode', () => ({ toDataURL: async () => 'data:image/png;base64,qr' }))

const mockLevels     = kashrutLevelsRepo as jest.Mocked<typeof kashrutLevelsRepo>
const mockCategories = establishmentCategoriesRepo as jest.Mocked<typeof establishmentCategoriesRepo>
const mockUsers      = usersRepo as jest.Mocked<typeof usersRepo>
const app = createApp()

function auth(role: Role = 'owner') {
  const links = role === 'owner' ? {} : { rabbanutId: 'rb_1' }
  const currentUser: User = {
    id: 'u1', name: 'U', email: 'u@crm.il', passwordHash: 'hash', role,
    ...links, twoFactorEnabled: false, twoFactorBackupCodes: [],
  }
  mockUsers.findAuthById.mockResolvedValue(currentUser)
  const token = jwt.sign(
    { sub: 'u1', role, typ: 'crm', name: 'U', email: 'u@crm.il', ...links },
    env.JWT_SECRET, { expiresIn: '1h' } as object,
  )
  return { Authorization: `Bearer ${token}` }
}

const dbDown = () => new Error('Connection terminated unexpectedly')
const duplicateName = () => new Prisma.PrismaClientKnownRequestError(
  'Unique constraint failed on the fields: (`name`)',
  { code: 'P2002', clientVersion: '7.7.0', meta: { modelName: 'KashrutLevel', target: ['name'] } },
)

const LEVEL = { id: 'lvl_1', name: 'Mehadrin', sortOrder: 1 }

describe('kashrut-level routes reach errorHandler', () => {
  it('GET / answers 500 when the repository rejects', async () => {
    mockLevels.findAll.mockRejectedValue(dbDown())
    const res = await request(app).get('/api/kashrut-levels').set(auth('rabbanut'))
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('GET / still lists levels', async () => {
    mockLevels.findAll.mockResolvedValue([LEVEL])
    const res = await request(app).get('/api/kashrut-levels').set(auth('rabbanut'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual([LEVEL])
  })

  it('GET /:id answers 500 on a DB error and 404 for a missing level', async () => {
    mockLevels.findById.mockRejectedValueOnce(dbDown())
    expect((await request(app).get('/api/kashrut-levels/lvl_1').set(auth())).status).toBe(500)

    mockLevels.findById.mockResolvedValueOnce(null)
    expect((await request(app).get('/api/kashrut-levels/lvl_x').set(auth())).status).toBe(404)
  })

  it('POST / answers 409 for a duplicate name', async () => {
    mockLevels.create.mockRejectedValue(duplicateName())
    const res = await request(app).post('/api/kashrut-levels').set(auth()).send({ name: 'Mehadrin' })
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Conflict: record already exists' })
  })

  it('POST / keeps the 400 for an invalid body and 201 on success', async () => {
    expect((await request(app).post('/api/kashrut-levels').set(auth()).send({ name: '' })).status).toBe(400)
    expect(mockLevels.create).not.toHaveBeenCalled()

    mockLevels.create.mockResolvedValue(LEVEL)
    const res = await request(app).post('/api/kashrut-levels').set(auth()).send({ name: 'Mehadrin', sortOrder: 1 })
    expect(res.status).toBe(201)
    expect(res.body).toEqual(LEVEL)
  })

  it('PATCH /:id answers 409 for a duplicate name and 500 on a DB error', async () => {
    mockLevels.update.mockRejectedValueOnce(duplicateName())
    expect((await request(app).patch('/api/kashrut-levels/lvl_1').set(auth()).send({ name: 'Taken' })).status).toBe(409)

    mockLevels.update.mockRejectedValueOnce(dbDown())
    expect((await request(app).patch('/api/kashrut-levels/lvl_1').set(auth()).send({ sortOrder: 2 })).status).toBe(500)
  })

  it('DELETE /:id answers 500 on a DB error and keeps 409 for a level in use', async () => {
    mockLevels.remove.mockRejectedValueOnce(dbDown())
    expect((await request(app).delete('/api/kashrut-levels/lvl_1').set(auth())).status).toBe(500)

    mockLevels.remove.mockResolvedValueOnce('conflict')
    expect((await request(app).delete('/api/kashrut-levels/lvl_1').set(auth())).status).toBe(409)

    mockLevels.remove.mockResolvedValueOnce('deleted')
    expect((await request(app).delete('/api/kashrut-levels/lvl_1').set(auth())).status).toBe(204)
  })
})

describe('establishment-category routes reach errorHandler', () => {
  it('GET / answers 500 when the repository rejects', async () => {
    mockCategories.findAll.mockRejectedValue(dbDown())
    const res = await request(app).get('/api/establishment-categories').set(auth('rabbanut'))
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('GET / still lists categories', async () => {
    const categories = [{ id: 'c1', slug: 'bakery', nameHe: 'מאפייה' }]
    mockCategories.findAll.mockResolvedValue(categories)
    const res = await request(app).get('/api/establishment-categories').set(auth('rabbanut'))
    expect(res.status).toBe(200)
    expect(res.body).toEqual(categories)
  })
})

// ── Guard: no route ends in a bare async function ─────────────────────────────
// Express 4 internals: app._router.stack holds route layers (layer.route) and
// mounted routers (layer.handle.stack). The terminal handler of a route is the
// controller; it must be wrapped (asyncHandler returns a plain function) so a
// rejection is passed to next(). Middleware before it (authenticateJWT,
// rateLimit) is async too but catches its own errors.
interface ExpressLayer {
  name: string
  regexp?: RegExp
  handle: ((...args: unknown[]) => unknown) & { stack?: ExpressLayer[] }
  route?: { path: string; methods: Record<string, boolean>; stack: ExpressLayer[] }
}

// A mounted router keeps its path only as a regexp: /^\/api\/?(?=\/|$)/i -> '/api'.
function mountPath(layer: ExpressLayer): string {
  return (layer.regexp?.source ?? '')
    .replace(/\\\//g, '/')
    .replace(/^\^/, '')
    .replace(/\/\?\(\?=\/\|\$\)$/, '')
}

function terminalHandlers(
  stack: ExpressLayer[],
  prefix = '',
  out: { route: string; handler: ExpressLayer['handle'] }[] = [],
) {
  for (const layer of stack) {
    if (layer.route) {
      const handlers = layer.route.stack
      const methods = Object.keys(layer.route.methods).join(',').toUpperCase()
      const path = prefix && layer.route.path === '/' ? prefix : prefix + layer.route.path
      out.push({ route: `${methods} ${path}`, handler: handlers[handlers.length - 1].handle })
    } else if (layer.name === 'router' && layer.handle.stack) {
      terminalHandlers(layer.handle.stack, prefix + mountPath(layer), out)
    }
  }
  return out
}

const isAsyncFunction = (fn: unknown) =>
  typeof fn === 'function' && fn.constructor.name === 'AsyncFunction'

describe('route handler wrapping', () => {
  const routerStack = (app as unknown as { _router: { stack: ExpressLayer[] } })._router.stack
  const handlers = terminalHandlers(routerStack)

  it('walks the whole API (sanity check for the guard below)', () => {
    expect(handlers.length).toBeGreaterThan(50)
    expect(handlers.map(h => h.route)).toEqual(expect.arrayContaining([
      'GET /health',
      'GET /api/kashrut-levels',
      'DELETE /api/kashrut-levels/:id',
      'GET /api/establishment-categories',
      'GET /api/dashboard/summary',
      'GET /api/map/restaurants/:restaurantId',
    ]))
    // The detector itself recognises a bare async handler.
    expect(isAsyncFunction(async () => undefined)).toBe(true)
    expect(isAsyncFunction(() => undefined)).toBe(false)
  })

  it('every route ends in a handler that forwards rejections to next()', () => {
    const bare = handlers.filter(h => isAsyncFunction(h.handler)).map(h => h.route)
    expect(bare).toEqual([])
  })
})
