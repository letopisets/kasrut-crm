import { prisma } from '../lib/prisma'
import { Prisma } from '../generated/prisma/client'
import type { KashrutLevel } from '../models/types'

export const kashrutLevelsRepo = {
  async findAll(): Promise<KashrutLevel[]> {
    const rows = await prisma.kashrutLevel.findMany({ orderBy: { sortOrder: 'asc' } })
    return rows.map(r => ({
      id:          r.id,
      name:        r.name,
      description: r.description ?? undefined,
      sortOrder:   r.sortOrder,
    }))
  },

  async findById(id: string): Promise<KashrutLevel | null> {
    const r = await prisma.kashrutLevel.findUnique({ where: { id } })
    if (!r) return null
    return { id: r.id, name: r.name, description: r.description ?? undefined, sortOrder: r.sortOrder }
  },

  async create(data: Omit<KashrutLevel, 'id'>): Promise<KashrutLevel> {
    const r = await prisma.kashrutLevel.create({
      data: { name: data.name, description: data.description, sortOrder: data.sortOrder },
    })
    return { id: r.id, name: r.name, description: r.description ?? undefined, sortOrder: r.sortOrder }
  },

  async update(id: string, data: Partial<Omit<KashrutLevel, 'id'>>): Promise<KashrutLevel | null> {
    try {
      const r = await prisma.kashrutLevel.update({ where: { id }, data })
      return { id: r.id, name: r.name, description: r.description ?? undefined, sortOrder: r.sortOrder }
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async remove(id: string): Promise<'deleted' | 'not_found' | 'conflict'> {
    try {
      await prisma.kashrutLevel.delete({ where: { id } })
      return 'deleted'
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') return 'not_found'
        if (e.code === 'P2003') return 'conflict'  // FK violation — level is in use
      }
      throw e
    }
  },
}
