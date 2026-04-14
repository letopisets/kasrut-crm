import { prisma } from '../lib/prisma'
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
      where: filter?.active !== undefined ? { active: filter.active } : undefined,
      orderBy: { name: 'asc' },
    })
    return rows.map(toRabbanut)
  },

  async findById(id: string): Promise<Rabbanut | null> {
    const r = await prisma.rabbanut.findUnique({ where: { id } })
    return r ? toRabbanut(r) : null
  },

  async create(input: Omit<Rabbanut, 'id'>): Promise<Rabbanut> {
    const r = await prisma.rabbanut.create({ data: input })
    return toRabbanut(r)
  },

  async update(id: string, patch: Partial<Omit<Rabbanut, 'id'>>): Promise<Rabbanut | null> {
    try {
      const r = await prisma.rabbanut.update({ where: { id }, data: patch })
      return toRabbanut(r)
    } catch { return null }
  },

  async toggle(id: string): Promise<Rabbanut | null> {
    const current = await prisma.rabbanut.findUnique({ where: { id } })
    if (!current) return null
    const r = await prisma.rabbanut.update({ where: { id }, data: { active: !current.active } })
    return toRabbanut(r)
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.rabbanut.delete({ where: { id } })
      return true
    } catch { return false }
  },
}
