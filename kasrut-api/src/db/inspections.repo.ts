import { prisma } from '../lib/prisma'
import type { Inspection, InspectionResult, InspectionType } from '../models/types'
import type { Inspection as PrismaInspection } from '../generated/prisma/client'

function toInspection(i: PrismaInspection): Inspection {
  return {
    id:           i.id,
    restaurantId: i.restaurantId,
    mashgiachId:  i.mashgiachId,
    date:         i.date.toISOString().slice(0, 10),
    type:         i.type   as InspectionType,
    result:       i.result as InspectionResult,
    notes:        i.notes ?? undefined,
  }
}

export interface PageResult<T> {
  items: T[]
  nextCursor: string | null
}

export const inspectionsRepo = {
  async findAll(filter?: { restaurantId?: string; mashgiachId?: string; result?: string; type?: string }): Promise<Inspection[]> {
    const rows = await prisma.inspection.findMany({
      where: {
        ...(filter?.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        ...(filter?.mashgiachId  ? { mashgiachId:  filter.mashgiachId }  : {}),
        ...(filter?.result       ? { result: filter.result as InspectionResult } : {}),
        ...(filter?.type         ? { type:   filter.type   as InspectionType }   : {}),
      },
      orderBy: { date: 'desc' },
    })
    return rows.map(toInspection)
  },

  async findPage(filter: {
    restaurantId?: string
    mashgiachId?:  string
    result?:       string
    type?:         string
    limit:         number
    cursor?:       string
  }): Promise<PageResult<Inspection>> {
    const rows = await prisma.inspection.findMany({
      where: {
        ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        ...(filter.mashgiachId  ? { mashgiachId:  filter.mashgiachId  } : {}),
        ...(filter.result       ? { result: filter.result as InspectionResult } : {}),
        ...(filter.type         ? { type:   filter.type   as InspectionType   } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const page    = hasMore ? rows.slice(0, filter.limit) : rows
    return {
      items: page.map(toInspection),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    }
  },

  async findById(id: string): Promise<Inspection | null> {
    const i = await prisma.inspection.findUnique({ where: { id } })
    return i ? toInspection(i) : null
  },

  async create(input: Omit<Inspection, 'id'>): Promise<Inspection> {
    const i = await prisma.inspection.create({
      data: {
        restaurantId: input.restaurantId,
        mashgiachId:  input.mashgiachId,
        date:         new Date(input.date),
        type:         input.type,
        result:       input.result,
        notes:        input.notes,
      },
    })
    return toInspection(i)
  },

  async setResult(id: string, result: InspectionResult): Promise<Inspection | null> {
    try {
      const i = await prisma.inspection.update({ where: { id }, data: { result } })
      return toInspection(i)
    } catch { return null }
  },

  async update(id: string, patch: Partial<Omit<Inspection, 'id'>>): Promise<Inspection | null> {
    try {
      const { date, ...rest } = patch
      const i = await prisma.inspection.update({
        where: { id },
        data:  { ...rest, ...(date ? { date: new Date(date) } : {}) },
      })
      return toInspection(i)
    } catch { return null }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.inspection.delete({ where: { id } })
      return true
    } catch { return false }
  },
}
