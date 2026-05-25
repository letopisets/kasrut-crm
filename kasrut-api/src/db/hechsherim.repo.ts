import { prisma } from '../lib/prisma'
import type { Hechsher, HechsherType } from '../models/types'
import type { Hechsher as PrismaHechsher } from '../generated/prisma/client'
import { Prisma } from '../generated/prisma/client'

export interface PageResult<T> { items: T[]; nextCursor: string | null }

function toHechsher(h: PrismaHechsher): Hechsher {
  return {
    id:           h.id,
    name:         h.name,
    shortName:    h.shortName,
    city:         h.city,
    contact:      h.contact,
    phone:        h.phone,
    email:        h.email,
    type:         h.type as HechsherType,
    color:        h.color,
    rabbanutId:   h.rabbanutId,
    active:       h.active,
    settlementId: h.settlementId ?? undefined,
    createdAt:    h.createdAt.toISOString(),
  }
}

export const hechsherimRepo = {
  async findAll(filter?: { rabbanutId?: string; active?: boolean }): Promise<Hechsher[]> {
    const rows = await prisma.hechsher.findMany({
      where: {
        ...(filter?.rabbanutId !== undefined ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter?.active     !== undefined ? { active:     filter.active }     : {}),
      },
      orderBy: { name: 'asc' },
    })
    return rows.map(toHechsher)
  },

  async findById(id: string): Promise<Hechsher | null> {
    const h = await prisma.hechsher.findUnique({ where: { id } })
    return h ? toHechsher(h) : null
  },

  async findPage(filter: {
    rabbanutId?: string
    active?:     boolean
    limit:       number
    cursor?:     string
  }): Promise<PageResult<Hechsher>> {
    const rows = await prisma.hechsher.findMany({
      where: {
        ...(filter.rabbanutId !== undefined ? { rabbanutId: filter.rabbanutId } : {}),
        ...(filter.active     !== undefined ? { active:     filter.active }     : {}),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const page    = hasMore ? rows.slice(0, filter.limit) : rows
    return { items: page.map(toHechsher), nextCursor: hasMore ? page[page.length - 1].id : null }
  },

  async create(input: Omit<Hechsher, 'id'>): Promise<Hechsher> {
    const h = await prisma.hechsher.create({
      data: {
        name:         input.name,
        shortName:    input.shortName,
        city:         input.city    ?? '',
        contact:      input.contact ?? '',
        phone:        input.phone   ?? '',
        email:        input.email   ?? '',
        type:         input.type,
        color:        input.color,
        rabbanutId:   input.rabbanutId,
        active:       input.active,
        ...(input.settlementId ? { settlementId: input.settlementId } : {}),
      },
    })
    return toHechsher(h)
  },

  async update(id: string, patch: Partial<Omit<Hechsher, 'id'>>): Promise<Hechsher | null> {
    try {
      const h = await prisma.hechsher.update({ where: { id }, data: patch })
      return toHechsher(h)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async remove(id: string): Promise<'deleted' | 'not_found' | 'conflict'> {
    const exists = await prisma.hechsher.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return 'not_found'
    try {
      await prisma.hechsher.delete({ where: { id } })
      return 'deleted'
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') return 'conflict'
      throw e
    }
  },
}
