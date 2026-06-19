import { prisma } from '../lib/prisma'
import { Prisma } from '../generated/prisma/client'
import type { Rabbanut } from '../models/types'
import type { Rabbanut as PrismaRabbanut } from '../generated/prisma/client'

function toRabbanut(r: PrismaRabbanut): Rabbanut {
  return {
    id:      r.id,
    name:    r.name,
    city:    r.city,
    contact: r.contact,
    phone:   r.phone,
    email:   r.email,
    active:  r.active,
    color:   r.color,
  }
}

export const rabbanutRepo = {
  async findAll(filter?: { active?: boolean }): Promise<Rabbanut[]> {
    const rows = await prisma.rabbanut.findMany({
      where: {
        deletedAt: null,
        ...(filter?.active !== undefined ? { active: filter.active } : {}),
      },
      orderBy: { name: 'asc' },
    })
    return rows.map(toRabbanut)
  },

  async findById(id: string): Promise<Rabbanut | null> {
    const r = await prisma.rabbanut.findUnique({ where: { id, deletedAt: null } })
    return r ? toRabbanut(r) : null
  },

  async create(input: Omit<Rabbanut, 'id'>): Promise<Rabbanut> {
    const r = await prisma.rabbanut.create({ data: input })
    return toRabbanut(r)
  },

  async update(id: string, patch: Partial<Omit<Rabbanut, 'id'>>): Promise<Rabbanut | null> {
    try {
      const r = await prisma.rabbanut.update({ where: { id, deletedAt: null }, data: patch })
      return toRabbanut(r)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async toggle(id: string): Promise<Rabbanut | null> {
    const current = await prisma.rabbanut.findUnique({ where: { id, deletedAt: null } })
    if (!current) return null
    const r = await prisma.rabbanut.update({ where: { id }, data: { active: !current.active } })
    return toRabbanut(r)
  },

  async remove(id: string): Promise<'deleted' | 'not_found'> {
    const existing = await prisma.rabbanut.findUnique({ where: { id }, select: { id: true, deletedAt: true } })
    if (!existing || existing.deletedAt !== null) return 'not_found'
    await prisma.rabbanut.update({ where: { id }, data: { deletedAt: new Date() } })
    return 'deleted'
  },
}
