import { prisma } from '../lib/prisma'
import type { FoodType } from '../generated/prisma/client'

export interface MapHechsherRow {
  id:        string
  name:      string
  shortName: string
}

export type KashrutLevel = 'mehadrin' | 'badatz' | 'regular'

export interface MapRestaurantRow {
  id:           string
  name:         string
  address:      string
  city:         string
  lat:          number
  lng:          number
  foodType:     string
  kashrutLevel: KashrutLevel
  hechsher:     string
  phone:        string | undefined
  hours:        string | undefined
}

/** Maps Prisma HechsherType → public kashrutLevel string */
function toKashrutLevel(type: string): KashrutLevel {
  if (type === 'Mehadrin') return 'mehadrin'
  if (type === 'Badatz')   return 'badatz'
  return 'regular'
}

export interface MapFilter {
  city?:         string
  kashrutLevel?: KashrutLevel[]
  hechsher?:     string[]
  foodType?:     string[]
}

export const mapRepo = {
  async findHechsherim(): Promise<MapHechsherRow[]> {
    return await prisma.hechsher.findMany({
      select: { id: true, name: true, shortName: true },
      orderBy: { name: 'asc' },
    })
  },

  async findForMap(filter: MapFilter): Promise<MapRestaurantRow[]> {
    const rows = await prisma.restaurant.findMany({
      where: {
        lat:      { not: null },
        lng:      { not: null },
        ...(filter.city && filter.city !== 'Все' ? { city: filter.city } : {}),
        ...(filter.foodType?.length
          ? { foodType: { in: filter.foodType as FoodType[] } }
          : {}),
        ...(filter.hechsher?.length
          ? { hechsher: { name: { in: filter.hechsher } } }
          : {}),
      },
      select: {
        id:       true,
        name:     true,
        address:  true,
        city:     true,
        lat:      true,
        lng:      true,
        foodType: true,
        phone:    true,
        hours:    true,
        hechsher: { select: { name: true, type: true } },
      },
      orderBy: { name: 'asc' },
    })

    let result: MapRestaurantRow[] = rows.map(r => ({
      id:           r.id,
      name:         r.name,
      address:      r.address,
      city:         r.city,
      lat:          r.lat!,
      lng:          r.lng!,
      foodType:     r.foodType,
      kashrutLevel: toKashrutLevel(r.hechsher.type),
      hechsher:     r.hechsher.name,
      phone:        r.phone ?? undefined,
      hours:        r.hours ?? undefined,
    }))

    // Post-filter by kashrutLevel (derived field, not stored)
    if (filter.kashrutLevel?.length) {
      result = result.filter(r => filter.kashrutLevel!.includes(r.kashrutLevel))
    }

    return result
  },
}
