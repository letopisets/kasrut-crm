import { prisma } from '../lib/prisma'
import type { Hechsher, HechsherType } from '../models/types'
import type { Hechsher as PrismaHechsher } from '../generated/prisma/client'

function toHechsher(h: PrismaHechsher): Hechsher {
  return {
    id:         h.id,
    name:       h.name,
    shortName:  h.shortName,
    city:       h.city,
    contact:    h.contact,
    phone:      h.phone,
    email:      h.email,
    type:       h.type as HechsherType,
    color:      h.color,
    rabbanutId: h.rabbanutId,
  }
}

export const hechsherimRepo = {
  async findAll(filter?: { rabbanutId?: string }): Promise<Hechsher[]> {
    const rows = await prisma.hechsher.findMany({
      where: filter?.rabbanutId ? { rabbanutId: filter.rabbanutId } : undefined,
      orderBy: { name: 'asc' },
    })
    return rows.map(toHechsher)
  },

  async findById(id: string): Promise<Hechsher | null> {
    const h = await prisma.hechsher.findUnique({ where: { id } })
    return h ? toHechsher(h) : null
  },

  async create(input: Omit<Hechsher, 'id'>): Promise<Hechsher> {
    const h = await prisma.hechsher.create({ data: input })
    return toHechsher(h)
  },

  async update(id: string, patch: Partial<Omit<Hechsher, 'id'>>): Promise<Hechsher | null> {
    try {
      const h = await prisma.hechsher.update({ where: { id }, data: patch })
      return toHechsher(h)
    } catch { return null }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.hechsher.delete({ where: { id } })
      return true
    } catch { return false }
  },
}
