import type { NextFunction, Request, Response } from 'express'
import { mapRepo } from '../db/map.repo'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { rabbanutRepo } from '../db/rabbanuts.repo'
import { hechsherimRepo } from '../db/hechsherim.repo'
import { rabbanutController } from '../controllers/rabbanut.controller'
import { hechsherController } from '../controllers/hechsher.controller'
import { invalidateMapCache } from '../lib/mapCache'
import { prisma } from '../lib/prisma'
import type { Hechsher, Rabbanut } from '../models/types'

// A rabbanut switched off / removed, or a hechsher switched off, withdraws its
// certificates: none of its establishments may stay on ANY public path (list,
// deep link, prerender, sitemap, filter options, hechsher list, community), and
// the CRM mutation that flips the switch must drop the cached map responses.
jest.mock('../lib/prisma', () => ({
  prisma: {
    restaurant:            { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    hechsher:              { findMany: jest.fn() },
    establishmentCategory: { findMany: jest.fn() },
  },
}))
jest.mock('../db/rabbanuts.repo')
jest.mock('../db/hechsherim.repo')
jest.mock('../lib/mapCache', () => ({ invalidateMapCache: jest.fn() }))
jest.mock('../lib/cache', () => ({
  withCache: jest.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  withNamespaceCache: jest.fn((_ns: string, _key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
  invalidateNamespace: jest.fn(async () => undefined),
  invalidateKeys: jest.fn(async () => undefined),
}))

type Mocked = { [model: string]: { [op: string]: jest.Mock } }
const db = prisma as unknown as Mocked
const mockRb = rabbanutRepo as jest.Mocked<typeof rabbanutRepo>
const mockH = hechsherimRepo as jest.Mocked<typeof hechsherimRepo>
const mockInvalidateMap = invalidateMapCache as jest.MockedFunction<typeof invalidateMapCache>

const PUBLIC_RABBANUT = { active: true, deletedAt: null }
const PUBLIC_HECHSHER = { active: true }

const whereOf = (mock: jest.Mock, call = 0) => mock.mock.calls[call][0].where

beforeEach(() => {
  db.restaurant.findMany.mockResolvedValue([])
  db.restaurant.findFirst.mockResolvedValue(null)
  db.restaurant.count.mockResolvedValue(0)
  db.hechsher.findMany.mockResolvedValue([])
  db.establishmentCategory.findMany.mockResolvedValue([])
  mockInvalidateMap.mockResolvedValue(undefined)
})

describe('public map paths hide withdrawn tenants and hechsherim', () => {
  it('map list', async () => {
    await mapRepo.findForMap({ limit: 750 })
    const where = whereOf(db.restaurant.findMany)
    expect(where.rabbanut).toEqual(PUBLIC_RABBANUT)
    expect(where.hechsher).toEqual(PUBLIC_HECHSHER)
  })

  it('detail / prerender lookup by id', async () => {
    await mapRepo.findById('r1')
    const where = whereOf(db.restaurant.findFirst)
    expect(where.id).toBe('r1')
    expect(where.rabbanut).toEqual(PUBLIC_RABBANUT)
    expect(where.hechsher).toEqual(PUBLIC_HECHSHER)
  })

  it('sitemap', async () => {
    await mapRepo.findSitemapEntries()
    const where = whereOf(db.restaurant.findMany)
    expect(where.rabbanut).toEqual(PUBLIC_RABBANUT)
    expect(where.hechsher).toEqual(PUBLIC_HECHSHER)
  })

  it('filter options (cities, hechsherim, categories)', async () => {
    await mapRepo.findMapOptions()
    const cities = whereOf(db.restaurant.findMany)
    expect(cities.rabbanut).toEqual(PUBLIC_RABBANUT)
    expect(cities.hechsher).toEqual(PUBLIC_HECHSHER)
    for (const mock of [db.hechsher.findMany, db.establishmentCategory.findMany]) {
      const some = whereOf(mock).restaurants.some
      expect(some.rabbanut).toEqual(PUBLIC_RABBANUT)
      expect(some.hechsher).toEqual(PUBLIC_HECHSHER)
    }
  })

  it('/map/hechsherim lists only active hechsherim of active, non-deleted rabbanuts', async () => {
    await mapRepo.findHechsherim()
    expect(whereOf(db.hechsher.findMany)).toEqual({ active: true, rabbanut: PUBLIC_RABBANUT })
  })

  it('community existence check (reviews / suggestions)', async () => {
    await expect(mapCommunityRepo.restaurantExists('r1')).resolves.toBe(false)
    const where = whereOf(db.restaurant.findFirst)
    expect(where.id).toBe('r1')
    expect(where.rabbanut).toEqual(PUBLIC_RABBANUT)
    expect(where.hechsher).toEqual(PUBLIC_HECHSHER)
  })
})

type Handler = (req: Request, res: Response, next: NextFunction) => void

// Drive a controller without the HTTP stack; resolves on the first response.
function run(handler: Handler, req: Record<string, unknown>): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this },
      json()               { resolve({ status: this.statusCode }); return this },
      send()               { resolve({ status: this.statusCode }); return this },
    }
    handler(
      { params: {}, query: {}, body: {}, user: { role: 'owner' }, ...req } as unknown as Request,
      res as unknown as Response,
      reject,
    )
  })
}

const rabbanut: Rabbanut = {
  id: 'rb_a', name: 'R', city: 'City', contact: '', phone: '', email: '', active: false, color: '#000',
}
const hechsher: Hechsher = {
  id: 'h1', name: 'H', shortName: 'H', type: 'Rabbanut', color: '#fff', rabbanutId: 'rb_a', active: false,
}

describe('rabbanut mutations invalidate the public map cache', () => {
  it('update', async () => {
    mockRb.update.mockResolvedValue(rabbanut)
    const res = await run(rabbanutController.update, { params: { id: 'rb_a' }, body: { active: false } })
    expect(res.status).toBe(200)
    expect(mockInvalidateMap).toHaveBeenCalledTimes(1)
  })

  it('toggle', async () => {
    mockRb.toggle.mockResolvedValue(rabbanut)
    const res = await run(rabbanutController.toggle, { params: { id: 'rb_a' } })
    expect(res.status).toBe(200)
    expect(mockInvalidateMap).toHaveBeenCalledTimes(1)
  })

  it('remove', async () => {
    mockRb.remove.mockResolvedValue('deleted')
    const res = await run(rabbanutController.remove, { params: { id: 'rb_a' } })
    expect(res.status).toBe(204)
    expect(mockInvalidateMap).toHaveBeenCalledTimes(1)
  })

  it('leaves the cache alone when the rabbanut does not exist', async () => {
    mockRb.update.mockResolvedValue(null)
    mockRb.toggle.mockResolvedValue(null)
    mockRb.remove.mockResolvedValue('not_found')
    expect((await run(rabbanutController.update, { params: { id: 'x' }, body: { active: false } })).status).toBe(404)
    expect((await run(rabbanutController.toggle, { params: { id: 'x' } })).status).toBe(404)
    expect((await run(rabbanutController.remove, { params: { id: 'x' } })).status).toBe(404)
    expect(mockInvalidateMap).not.toHaveBeenCalled()
  })
})

describe('hechsher mutations invalidate the public map cache', () => {
  it('update (e.g. switching it off)', async () => {
    mockH.findById.mockResolvedValue({ ...hechsher, active: true })
    mockH.update.mockResolvedValue(hechsher)
    const res = await run(hechsherController.update, { params: { id: 'h1' }, body: { active: false } })
    expect(res.status).toBe(200)
    expect(mockInvalidateMap).toHaveBeenCalledTimes(1)
  })

  it('remove', async () => {
    mockH.remove.mockResolvedValue('deleted')
    const res = await run(hechsherController.remove, { params: { id: 'h1' } })
    expect(res.status).toBe(204)
    expect(mockInvalidateMap).toHaveBeenCalledTimes(1)
  })
})
