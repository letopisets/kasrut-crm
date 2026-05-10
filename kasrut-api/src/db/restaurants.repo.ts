import { prisma } from '../lib/prisma'
import type { Restaurant, CertStatus, FoodType } from '../models/types'
import type { Restaurant as PrismaRestaurant, FoodType as PrismaFoodType } from '../generated/prisma/client'
import { Prisma } from '../generated/prisma/client'

function calcStatus(expires: Date): CertStatus {
  const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

// `status` lives in the DB but is also recomputed from `expires` on every read
// because the DB value goes stale without a cron. Single source of truth: the
// computed value. Callers don't need to override the field after this returns.
function toRestaurant(r: PrismaRestaurant): Restaurant {
  return {
    id:             r.id,
    name:           r.name,
    address:        r.address,
    city:           r.city,
    level:          r.level as 'Regular' | 'Mehadrin',
    hechsherId:     r.hechsherId,
    mashgiachId:    r.mashgiachId ?? undefined,
    kitniyot:       r.kitniyot,
    foodType:       r.foodType as FoodType,
    expires:        r.expires.toISOString().slice(0, 10),
    status:         calcStatus(r.expires),
    rabbanutId:     r.rabbanutId,
    notes:          r.notes ?? undefined,
    lastInspection: r.lastInspection?.toISOString().slice(0, 10),
  }
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
}

export const restaurantsRepo = {
  async findAll(filter?: { rabbanutId?: string; status?: string }): Promise<Restaurant[]> {
    const rows = await prisma.restaurant.findMany({
      where: {
        ...(filter?.rabbanutId ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter?.status     ? { status:     filter.status as CertStatus } : {}),
      },
      orderBy: { name: 'asc' },
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
        ...(filter.rabbanutId ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter.status     ? { status: filter.status as CertStatus } : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })

    const hasMore   = rows.length > filter.limit
    const pageRows  = hasMore ? rows.slice(0, filter.limit) : rows
    const items     = pageRows.map(toRestaurant)
    const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null

    return { items, nextCursor }
  },

  async findById(id: string): Promise<Restaurant | null> {
    const r = await prisma.restaurant.findUnique({ where: { id } })
    return r ? toRestaurant(r) : null
  },

  async findByMashgiach(mashgiachId: string): Promise<Restaurant[]> {
    const rows = await prisma.restaurant.findMany({ where: { mashgiachId } })
    return rows.map(toRestaurant)
  },

  async create(input: Omit<Restaurant, 'id' | 'status'>): Promise<Restaurant> {
    const expires = new Date(input.expires)
    const r = await prisma.restaurant.create({
      data: {
        name:           input.name,
        address:        input.address,
        city:           input.city,
        level:          input.level,
        hechsherId:     input.hechsherId,
        mashgiachId:    input.mashgiachId ?? null,
        kitniyot:       input.kitniyot,
        ...(input.foodType ? { foodType: input.foodType as PrismaFoodType } : {}),
        expires,
        status:         calcStatus(expires),
        rabbanutId:     input.rabbanutId,
        notes:          input.notes,
        lastInspection: input.lastInspection ? new Date(input.lastInspection) : undefined,
      },
    })
    return toRestaurant(r)
  },

  async update(id: string, patch: Partial<Omit<Restaurant, 'id'>>): Promise<Restaurant | null> {
    try {
      const { expires, lastInspection, foodType, ...rest } = patch
      const r = await prisma.restaurant.update({
        where: { id },
        data: {
          ...rest,
          ...(foodType       ? { foodType: foodType as PrismaFoodType } : {}),
          ...(expires        ? { expires: new Date(expires), status: calcStatus(new Date(expires)) } : {}),
          ...(lastInspection ? { lastInspection: new Date(lastInspection) } : {}),
        },
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

  async remove(id: string): Promise<'deleted' | 'not_found' | 'conflict'> {
    try {
      await prisma.restaurant.delete({ where: { id } })
      return 'deleted'
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') return 'not_found'
        if (e.code === 'P2003') return 'conflict'  // FK constraint
      }
      throw e
    }
  },
}
