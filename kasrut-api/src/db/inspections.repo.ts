import { prisma } from '../lib/prisma'
import type { Inspection, InspectionResult, InspectionType } from '../models/types'
import type { Inspection as PrismaInspection } from '../generated/prisma/client'
import { Prisma } from '../generated/prisma/client'

function toInspection(i: PrismaInspection): Inspection {
  return {
    id:           i.id,
    restaurantId: i.restaurantId,
    mashgiachId:  i.mashgiachId ?? undefined,
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

// Hard ceiling for the unpaginated list endpoint. Large rabbanuts with
// thousands of inspections would otherwise load the full dataset on every
// request. Callers that need more should use findPage with cursor pagination.
const FIND_ALL_HARD_LIMIT = 500

export const inspectionsRepo = {
  async findAll(filter?: {
    restaurantId?: string
    mashgiachId?:  string
    result?:       string
    type?:         string
    rabbanutId?:   string
  }): Promise<Inspection[]> {
    const rows = await prisma.inspection.findMany({
      where: {
        ...(filter?.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        ...(filter?.mashgiachId  ? { mashgiachId:  filter.mashgiachId }  : {}),
        ...(filter?.result       ? { result: filter.result as InspectionResult } : {}),
        ...(filter?.type         ? { type:   filter.type   as InspectionType }   : {}),
        // Scopes inspections to a specific rabbanut via the restaurant FK so
        // the rabbanut role cannot read other organisations' inspection data.
        ...(filter?.rabbanutId   ? { restaurant: { rabbanutId: filter.rabbanutId } } : {}),
      },
      orderBy: { date: 'desc' },
      take: FIND_ALL_HARD_LIMIT,
    })
    return rows.map(toInspection)
  },

  async findPage(filter: {
    restaurantId?: string
    mashgiachId?:  string
    result?:       string
    type?:         string
    rabbanutId?:   string
    limit:         number
    cursor?:       string
  }): Promise<PageResult<Inspection>> {
    const rows = await prisma.inspection.findMany({
      where: {
        ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        ...(filter.mashgiachId  ? { mashgiachId:  filter.mashgiachId  } : {}),
        ...(filter.result       ? { result: filter.result as InspectionResult } : {}),
        ...(filter.type         ? { type:   filter.type   as InspectionType   } : {}),
        ...(filter.rabbanutId   ? { restaurant: { rabbanutId: filter.rabbanutId } } : {}),
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

  async findRabbanutIdByRestaurant(restaurantId: string): Promise<string | null> {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { rabbanutId: true },
    })
    return r?.rabbanutId ?? null
  },

  async validateOwnership(input: {
    rabbanutId:   string
    restaurantId: string
    mashgiachId?: string
  }): Promise<boolean> {
    const restaurantOk = await prisma.restaurant.count({
      where: { id: input.restaurantId, rabbanutId: input.rabbanutId },
    })
    if (restaurantOk !== 1) return false

    if (input.mashgiachId) {
      const mashgiachOk = await prisma.mashgiach.count({
        where: { id: input.mashgiachId, rabbanutId: input.rabbanutId },
      })
      return mashgiachOk === 1
    }
    return true
  },

  async create(input: Omit<Inspection, 'id'>): Promise<Inspection> {
    const i = await prisma.inspection.create({
      data: {
        restaurantId: input.restaurantId,
        mashgiachId:  input.mashgiachId ?? null,
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
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async update(id: string, patch: Partial<Omit<Inspection, 'id'>>): Promise<Inspection | null> {
    try {
      const { date, ...rest } = patch
      const i = await prisma.inspection.update({
        where: { id },
        data:  { ...rest, ...(date ? { date: new Date(date) } : {}) },
      })
      return toInspection(i)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.inspection.delete({ where: { id } })
      return true
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return false
      throw e
    }
  },
}
