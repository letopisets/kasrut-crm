import { prisma } from '../lib/prisma'
import type { Mashgiach } from '../models/types'

export interface PageResult<T> { items: T[]; nextCursor: string | null }

// Prisma row with included relations
type MashgiachWithRels = {
  id: string; name: string; phone: string; email: string
  area: string; active: boolean; rabbanutId: string
  hechsherim:  { hechsherId: string }[]
  restaurants: { id: string }[]
}

function toMashgiach(m: MashgiachWithRels): Mashgiach {
  return {
    id:                    m.id,
    name:                  m.name,
    phone:                 m.phone,
    email:                 m.email,
    area:                  m.area,
    active:                m.active,
    rabbanutId:            m.rabbanutId,
    hechsherimIds:         m.hechsherim.map(h => h.hechsherId),
    assignedRestaurantIds: m.restaurants.map(r => r.id),
  }
}

const include = {
  hechsherim:  { select: { hechsherId: true } },
  restaurants: { select: { id: true } },
} as const

export const mashgichimRepo = {
  async findAll(filter?: { rabbanutId?: string; active?: boolean }): Promise<Mashgiach[]> {
    const rows = await prisma.mashgiach.findMany({
      where: {
        ...(filter?.rabbanutId !== undefined ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter?.active     !== undefined ? { active:     filter.active }     : {}),
      },
      include,
      orderBy: { name: 'asc' },
    })
    return rows.map(toMashgiach)
  },

  async findPage(filter: {
    rabbanutId?: string
    active?:     boolean
    limit:       number
    cursor?:     string
  }): Promise<PageResult<Mashgiach>> {
    const rows = await prisma.mashgiach.findMany({
      where: {
        ...(filter.rabbanutId !== undefined ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter.active     !== undefined ? { active:     filter.active }     : {}),
      },
      include,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const page    = hasMore ? rows.slice(0, filter.limit) : rows
    return { items: page.map(toMashgiach), nextCursor: hasMore ? page[page.length - 1].id : null }
  },

  async findById(id: string): Promise<Mashgiach | null> {
    const m = await prisma.mashgiach.findUnique({ where: { id }, include })
    return m ? toMashgiach(m) : null
  },

  async create(input: Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>): Promise<Mashgiach> {
    const { hechsherimIds, ...rest } = input
    const m = await prisma.mashgiach.create({
      data: {
        ...rest,
        hechsherim: { create: hechsherimIds.map(hid => ({ hechsherId: hid })) },
      },
      include,
    })
    return toMashgiach(m)
  },

  async update(id: string, patch: Partial<Omit<Mashgiach, 'id'>>): Promise<Mashgiach | null> {
    try {
      const { hechsherimIds, assignedRestaurantIds, ...rest } = patch
      // If hechsherimIds are provided, replace the entire join table
      const hechsherimUpdate = hechsherimIds
        ? { deleteMany: {}, create: hechsherimIds.map(hid => ({ hechsherId: hid })) }
        : undefined

      const m = await prisma.mashgiach.update({
        where: { id },
        data:  { ...rest, ...(hechsherimUpdate ? { hechsherim: hechsherimUpdate } : {}) },
        include,
      })
      return toMashgiach(m)
    } catch { return null }
  },

  async toggle(id: string): Promise<Mashgiach | null> {
    const current = await prisma.mashgiach.findUnique({ where: { id } })
    if (!current) return null
    const m = await prisma.mashgiach.update({ where: { id }, data: { active: !current.active }, include })
    return toMashgiach(m)
  },

  async assignRestaurant(id: string, restaurantId: string): Promise<Mashgiach | null> {
    // assignedRestaurantIds is derived from Restaurant.mashgiachId — update the restaurant
    try {
      await prisma.restaurant.update({ where: { id: restaurantId }, data: { mashgiachId: id } })
      return this.findById(id)
    } catch { return null }
  },

  async remove(id: string): Promise<'deleted' | 'not_found' | 'conflict'> {
    const exists = await prisma.mashgiach.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return 'not_found'
    try {
      await prisma.mashgiach.delete({ where: { id } })
      return 'deleted'
    } catch { return 'conflict' }
  },
}
