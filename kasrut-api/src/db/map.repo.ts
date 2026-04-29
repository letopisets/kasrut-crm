import { prisma } from '../lib/prisma'
import type { FoodType, HechsherType, Prisma } from '../generated/prisma/client'

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

export interface MapBounds {
  north: number
  south: number
  east: number
  west: number
}

export interface MapPoint {
  lat: number
  lng: number
}

export interface MapRestaurantPage {
  restaurants: MapRestaurantRow[]
  total: number
  limit: number
  limited: boolean
}

export interface MapOptionsRow {
  cities: string[]
  hechshers: string[]
}

/** Maps Prisma HechsherType → public kashrutLevel string */
function toKashrutLevel(type: string): KashrutLevel {
  if (type === 'Mehadrin') return 'mehadrin'
  if (type === 'Badatz')   return 'badatz'
  return 'regular'
}

function toHechsherTypes(levels: KashrutLevel[] | undefined): HechsherType[] | undefined {
  if (!levels?.length) return undefined

  const types = new Set<HechsherType>()
  for (const level of levels) {
    if (level === 'mehadrin') types.add('Mehadrin')
    else if (level === 'badatz') types.add('Badatz')
    else {
      types.add('Rabbanut')
      types.add('Private')
    }
  }
  return [...types]
}

function getRadiusBounds(center: MapPoint, radius: number): MapBounds {
  const latDelta = radius / 111_320
  const lngDelta = radius / (111_320 * Math.max(Math.cos(center.lat * Math.PI / 180), 0.01))

  return {
    north: Math.min(90, center.lat + latDelta),
    south: Math.max(-90, center.lat - latDelta),
    east: Math.min(180, center.lng + lngDelta),
    west: Math.max(-180, center.lng - lngDelta),
  }
}

function buildBoundsWhere(bounds: MapBounds): Prisma.RestaurantWhereInput {
  const boundsWhere: Prisma.RestaurantWhereInput = {
    lat: {
      not: null,
      gte: bounds.south,
      lte: bounds.north,
    },
  }

  if (bounds.west <= bounds.east) {
    boundsWhere.lng = {
      not: null,
      gte: bounds.west,
      lte: bounds.east,
    }
  } else {
    boundsWhere.lng = { not: null }
    boundsWhere.OR = [
      { lng: { gte: bounds.west } },
      { lng: { lte: bounds.east } },
    ]
  }

  return boundsWhere
}

function applyBounds(where: Prisma.RestaurantWhereInput, bounds: MapBounds): Prisma.RestaurantWhereInput {
  return {
    AND: [
      where,
      buildBoundsWhere(bounds),
    ],
  }
}

function buildMapWhere(filter: MapFilter): Prisma.RestaurantWhereInput {
  let where: Prisma.RestaurantWhereInput = {
    lat: { not: null },
    lng: { not: null },
    ...(filter.city && filter.city !== 'Все' ? { city: filter.city } : {}),
    ...(filter.foodType?.length
      ? { foodType: { in: filter.foodType as FoodType[] } }
      : {}),
  }

  const hechsherWhere: Prisma.HechsherWhereInput = {}
  if (filter.hechsher?.length) hechsherWhere.name = { in: filter.hechsher }

  const hechsherTypes = toHechsherTypes(filter.kashrutLevel)
  if (hechsherTypes?.length) hechsherWhere.type = { in: hechsherTypes }

  if (Object.keys(hechsherWhere).length > 0) {
    where.hechsher = hechsherWhere
  }

  if (filter.bounds) {
    where = applyBounds(where, filter.bounds)
  }

  if (filter.center && filter.radius) {
    where = applyBounds(where, getRadiusBounds(filter.center, filter.radius))
  }

  return where
}

export interface MapFilter {
  city?:         string
  kashrutLevel?: KashrutLevel[]
  hechsher?:     string[]
  foodType?:     string[]
  bounds?:        MapBounds
  center?:        MapPoint
  radius?:        number
  limit:          number
}

export const mapRepo = {
  async findHechsherim(): Promise<MapHechsherRow[]> {
    return await prisma.hechsher.findMany({
      select: { id: true, name: true, shortName: true },
      orderBy: { name: 'asc' },
    })
  },

  async findMapOptions(): Promise<MapOptionsRow> {
    const [cityRows, hechsherRows] = await Promise.all([
      prisma.restaurant.findMany({
        where: { lat: { not: null }, lng: { not: null } },
        distinct: ['city'],
        select: { city: true },
        orderBy: { city: 'asc' },
      }),
      prisma.hechsher.findMany({
        where: {
          restaurants: {
            some: { lat: { not: null }, lng: { not: null } },
          },
        },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ])

    return {
      cities: cityRows.map(r => r.city).filter(Boolean),
      hechshers: hechsherRows.map(r => r.name).filter(Boolean),
    }
  },

  async findForMap(filter: MapFilter): Promise<MapRestaurantPage> {
    const where = buildMapWhere(filter)

    const [total, rows] = await Promise.all([
      prisma.restaurant.count({ where }),
      prisma.restaurant.findMany({
        where,
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
        take: filter.limit,
      }),
    ])

    const restaurants: MapRestaurantRow[] = rows.map(r => ({
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

    return {
      restaurants,
      total,
      limit: filter.limit,
      limited: total > restaurants.length,
    }
  },
}
