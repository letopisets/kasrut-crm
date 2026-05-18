import { prisma } from '../lib/prisma'
import type { Restaurant, CertStatus, FoodType } from '../models/types'
import type { FoodType as PrismaFoodType } from '../generated/prisma/client'
import { Prisma } from '../generated/prisma/client'

// Translates a status filter to an expires date-range predicate so that
// filtering is always based on the live expires value rather than the stale
// status column, which can only be refreshed by a cron job.
function statusToExpiresFilter(status?: string): Prisma.RestaurantWhereInput {
  if (!status) return {}
  const now          = new Date()
  const warnBoundary = new Date(now.getTime() + 30 * 86_400_000)
  if (status === 'ok')       return { expires: { gt: warnBoundary } }
  if (status === 'warning')  return { expires: { gt: now, lte: warnBoundary } }
  if (status === 'critical') return { expires: { lte: now } }
  return {}
}

function calcStatus(expires: Date): CertStatus {
  const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

type RestaurantWithLatestInspection = {
  id: string; name: string; address: string; city: string
  levelId: string; level: { id: string; name: string }
  hechsherId: string; mashgiachId: string | null; kitniyot: boolean
  foodType: PrismaFoodType; expires: Date; status: string; rabbanutId: string
  notes: string | null; lat: number | null; lng: number | null
  phone: string | null; hours: string | null
  settlementId: string | null; createdAt: Date; deletedAt: Date | null
  inspections?: { date: Date }[]
}

// `status` lives in the DB but is also recomputed from `expires` on every read
// because the DB value goes stale without a cron. Single source of truth: the
// computed value. Callers don't need to override the field after this returns.
// `lastInspection` is derived from the included inspections relation, never the
// stale denormalized column, so deleting an inspection automatically corrects it.
function toRestaurant(r: RestaurantWithLatestInspection): Restaurant {
  const latestDate = r.inspections?.[0]?.date
  return {
    id:              r.id,
    name:            r.name,
    address:         r.address,
    city:            r.city,
    levelId:         r.level.id,
    level:           r.level.name,
    hechsherId:      r.hechsherId,
    mashgiachId:     r.mashgiachId ?? undefined,
    kitniyot:        r.kitniyot,
    foodType:        r.foodType as FoodType,
    expires:         r.expires.toISOString().slice(0, 10),
    status:          calcStatus(r.expires),
    rabbanutId:      r.rabbanutId,
    notes:           r.notes ?? undefined,
    lastInspection:  latestDate?.toISOString().slice(0, 10),
    settlementId:    r.settlementId ?? undefined,
    createdAt:       r.createdAt.toISOString(),
  }
}

const includeLatestInspection = {
  inspections: { orderBy: { date: 'desc' as const }, take: 1 },
  level: true as const,
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
}

export const restaurantsRepo = {
  async findAll(filter?: { rabbanutId?: string; status?: string }): Promise<Restaurant[]> {
    const rows = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        ...(filter?.rabbanutId ? { rabbanutId: filter.rabbanutId } : {}),
        ...statusToExpiresFilter(filter?.status),
      },
      orderBy: { name: 'asc' },
      include: includeLatestInspection,
    })
    return rows.map(toRestaurant)
  },

  async findPage(filter: {
    rabbanutId?: string
    status?:     string
    limit:       number
    cursor?:     string
  }): Promise<PageResult<Restaurant>> {
    const rows = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        ...(filter.rabbanutId ? { rabbanutId: filter.rabbanutId } : {}),
        ...statusToExpiresFilter(filter.status),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: includeLatestInspection,
    })

    const hasMore   = rows.length > filter.limit
    const pageRows  = hasMore ? rows.slice(0, filter.limit) : rows
    const items     = pageRows.map(toRestaurant)
    const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null

    return { items, nextCursor }
  },

  async findById(id: string): Promise<Restaurant | null> {
    const r = await prisma.restaurant.findUnique({ where: { id, deletedAt: null }, include: includeLatestInspection })
    return r ? toRestaurant(r) : null
  },

  async findByMashgiach(mashgiachId: string): Promise<Restaurant[]> {
    const rows = await prisma.restaurant.findMany({
      where: { mashgiachId, deletedAt: null },
      include: includeLatestInspection,
    })
    return rows.map(toRestaurant)
  },

  async create(input: Omit<Restaurant, 'id' | 'status' | 'level'>): Promise<Restaurant> {
    const expires = new Date(input.expires)
    const r = await prisma.restaurant.create({
      data: {
        name:         input.name,
        address:      input.address,
        city:         input.city,
        levelId:      input.levelId,
        hechsherId:   input.hechsherId,
        mashgiachId:  input.mashgiachId ?? null,
        kitniyot:     input.kitniyot,
        ...(input.foodType    ? { foodType: input.foodType as PrismaFoodType } : {}),
        ...(input.settlementId ? { settlementId: input.settlementId } : {}),
        expires,
        status:       calcStatus(expires),
        rabbanutId:   input.rabbanutId,
        notes:        input.notes,
      },
      include: includeLatestInspection,
    })
    return toRestaurant(r)
  },

  async update(id: string, patch: Partial<Omit<Restaurant, 'id'>>): Promise<Restaurant | null> {
    try {
      const { expires, lastInspection: _ignored, foodType, level: _levelName, ...rest } = patch
      const r = await prisma.restaurant.update({
        where: { id },
        data: {
          ...rest,
          ...(foodType ? { foodType: foodType as PrismaFoodType } : {}),
          ...(expires  ? { expires: new Date(expires), status: calcStatus(new Date(expires)) } : {}),
        },
        include: includeLatestInspection,
      })
      return toRestaurant(r)
    } catch (e) {
      // P2025 = record not found; surface as null. Anything else (DB down,
      // unique-violation, FK error) must propagate so the API returns a real
      // error code instead of a misleading 404.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async validateOwnership(input: {
    rabbanutId: string
    hechsherId: string
    mashgiachId?: string
  }): Promise<boolean> {
    const hechsherOk = await prisma.hechsher.count({
      where: { id: input.hechsherId, rabbanutId: input.rabbanutId },
    })
    if (hechsherOk !== 1) return false

    if (input.mashgiachId) {
      const mashgiachOk = await prisma.mashgiach.count({
        where: { id: input.mashgiachId, rabbanutId: input.rabbanutId },
      })
      if (mashgiachOk !== 1) return false
    }

    return true
  },

  async remove(id: string): Promise<'deleted' | 'not_found'> {
    const existing = await prisma.restaurant.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
    if (!existing || existing.deletedAt !== null) return 'not_found'
    await prisma.restaurant.update({ where: { id }, data: { deletedAt: new Date() } })
    return 'deleted'
  },
}
