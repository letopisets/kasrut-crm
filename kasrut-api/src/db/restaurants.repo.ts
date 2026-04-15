import { prisma } from '../lib/prisma'
import type { Restaurant, CertStatus } from '../models/types'
import type { Restaurant as PrismaRestaurant } from '../generated/prisma/client'

function calcStatus(expires: Date): CertStatus {
  const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

function toRestaurant(r: PrismaRestaurant): Restaurant {
  return {
    id:             r.id,
    name:           r.name,
    address:        r.address,
    city:           r.city,
    level:          r.level as 'Regular' | 'Mehadrin',
    hechsherId:     r.hechsherId,
    mashgiachId:    r.mashgiachId,
    kitniyot:       r.kitniyot,
    expires:        r.expires.toISOString().slice(0, 10),
    status:         r.status as CertStatus,
    rabbanutId:     r.rabbanutId,
    notes:          r.notes ?? undefined,
    lastInspection: r.lastInspection?.toISOString().slice(0, 10),
  }
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
    return rows.map(r => ({ ...toRestaurant(r), status: calcStatus(r.expires) }))
  },

  async findById(id: string): Promise<Restaurant | null> {
    const r = await prisma.restaurant.findUnique({ where: { id } })
    return r ? { ...toRestaurant(r), status: calcStatus(r.expires) } : null
  },

  async findByMashgiach(mashgiachId: string): Promise<Restaurant[]> {
    const rows = await prisma.restaurant.findMany({ where: { mashgiachId } })
    return rows.map(r => ({ ...toRestaurant(r), status: calcStatus(r.expires) }))
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
        mashgiachId:    input.mashgiachId,
        kitniyot:       input.kitniyot,
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
      const { expires, lastInspection, ...rest } = patch
      const r = await prisma.restaurant.update({
        where: { id },
        data: {
          ...rest,
          ...(expires        ? { expires: new Date(expires), status: calcStatus(new Date(expires)) } : {}),
          ...(lastInspection ? { lastInspection: new Date(lastInspection) } : {}),
        },
      })
      return toRestaurant(r)
    } catch { return null }
  },

  async remove(id: string): Promise<'deleted' | 'not_found' | 'conflict'> {
    const exists = await prisma.restaurant.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return 'not_found'
    try {
      await prisma.restaurant.delete({ where: { id } })
      return 'deleted'
    } catch { return 'conflict' }
  },
}
