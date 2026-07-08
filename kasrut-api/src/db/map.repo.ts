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
  category:     string | null   // EstablishmentCategory.slug — вид заведения (restaurant/bakery/cafe)
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

export interface MapCategoryOption {
  id:     string
  slug:   string
  nameHe: string
  nameEn: string | null
  nameRu: string | null
}

export interface MapOptionsRow {
  cities: string[]
  hechshers: string[]
  categories: MapCategoryOption[]
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

// Map clients round the query centre to a ~110 m grid (3 decimals) to align
// with the response cache, so the centre can be up to ~56 m off the user's
// true position per axis. Pad the box so establishments near the radius edge
// survive that rounding — clients re-filter by exact distance anyway.
const CENTER_ROUNDING_SLACK_METERS = 80

function getRadiusBounds(center: MapPoint, radius: number): MapBounds {
  const paddedRadius = radius + CENTER_ROUNDING_SLACK_METERS
  const latDelta = paddedRadius / 111_320
  const lngDelta = paddedRadius / (111_320 * Math.max(Math.cos(center.lat * Math.PI / 180), 0.01))

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

// The public surface must only touch establishments that are (a) not
// soft-deleted in the CRM and (b) still holding a valid certificate — so a
// removed or expired teuda is never presented as kosher. Shared by the map
// queries here AND the public community surface (reviews / suggestions in
// mapCommunity.repo) so the visibility rule lives in exactly one place.
// `expires` is a DATE at 00:00Z; `gte: now` keeps a cert visible through its
// expiry day and hides it once past, matching calcStatus' 'critical' cutoff.
export function publicRestaurantVisibilityWhere(): Prisma.RestaurantWhereInput {
  return {
    deletedAt: null,
    expires:   { gte: new Date() },
  }
}

// Map rows additionally need coordinates to be placeable.
function mappableRestaurantWhere(): Prisma.RestaurantWhereInput {
  return {
    ...publicRestaurantVisibilityWhere(),
    lat: { not: null },
    lng: { not: null },
  }
}

export function buildMapWhere(filter: MapFilter): Prisma.RestaurantWhereInput {
  let where: Prisma.RestaurantWhereInput = {
    ...mappableRestaurantWhere(),
    ...(filter.city && filter.city !== 'Все' ? { city: filter.city } : {}),
    ...(filter.foodType?.length
      ? { foodType: { in: filter.foodType as FoodType[] } }
      : {}),
    ...(filter.category?.length
      ? { category: { slug: { in: filter.category } } }
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

  // Free-text search over name / address / city. ANDed with everything else
  // (a separate OR key would collide with the antimeridian bounds OR above).
  if (filter.q) {
    const q = filter.q
    where = {
      AND: [
        where,
        {
          OR: [
            { name:    { contains: q, mode: 'insensitive' } },
            { address: { contains: q, mode: 'insensitive' } },
            { city:    { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    }
  }

  return where
}

export interface MapFilter {
  city?:         string
  kashrutLevel?: KashrutLevel[]
  hechsher?:     string[]
  foodType?:     string[]
  category?:     string[]   // EstablishmentCategory.slug values
  q?:            string     // free-text search over name/address/city
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
    // Same visibility rule as the map itself, so a city/hechsher/вид whose only
    // establishments are deleted or expired never appears as a filter option.
    const visible = mappableRestaurantWhere()
    const [cityRows, hechsherRows, categoryRows] = await Promise.all([
      prisma.restaurant.findMany({
        where: visible,
        distinct: ['city'],
        select: { city: true },
        orderBy: { city: 'asc' },
      }),
      prisma.hechsher.findMany({
        where: {
          restaurants: {
            some: visible,
          },
        },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
      // Only categories that actually have mappable establishments, so the
      // filter never offers a вид with zero results.
      prisma.establishmentCategory.findMany({
        where: {
          restaurants: {
            some: visible,
          },
        },
        select: { id: true, slug: true, nameHe: true, nameEn: true, nameRu: true },
        orderBy: { nameHe: 'asc' },
      }),
    ])

    return {
      cities: cityRows.map(r => r.city).filter(Boolean),
      hechshers: hechsherRows.map(r => r.name).filter(Boolean),
      categories: categoryRows,
    }
  },

  // Single establishment for a shared/deep link. Same visibility rule as the
  // map, so a link to a removed or expired place 404s instead of showing it.
  async findById(id: string): Promise<MapRestaurantRow | null> {
    const r = await prisma.restaurant.findFirst({
      where: { id, ...mappableRestaurantWhere() },
      select: {
        id: true, name: true, address: true, city: true,
        lat: true, lng: true, foodType: true, phone: true, hours: true,
        category: { select: { slug: true } },
        hechsher: { select: { name: true, type: true } },
      },
    })
    if (!r) return null
    return {
      id:           r.id,
      name:         r.name,
      address:      r.address,
      city:         r.city,
      lat:          r.lat!,
      lng:          r.lng!,
      foodType:     r.foodType,
      category:     r.category?.slug ?? null,
      kashrutLevel: toKashrutLevel(r.hechsher.type),
      hechsher:     r.hechsher.name,
      phone:        r.phone ?? undefined,
      hours:        r.hours ?? undefined,
    }
  },

  async findForMap(filter: MapFilter): Promise<MapRestaurantPage> {
    const where = buildMapWhere(filter)

    // Fetch limit + 1 so we can detect "more rows exist" without a separate
    // count(*). Only when we actually overflow do we pay for a real count —
    // most queries fit comfortably under the limit.
    const rows = await prisma.restaurant.findMany({
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
        category: { select: { slug: true } },
        hechsher: { select: { name: true, type: true } },
      },
      orderBy: { name: 'asc' },
      take: filter.limit + 1,
    })

    const limited = rows.length > filter.limit
    const visibleRows = limited ? rows.slice(0, filter.limit) : rows

    const restaurants: MapRestaurantRow[] = visibleRows.map(r => ({
      id:           r.id,
      name:         r.name,
      address:      r.address,
      city:         r.city,
      lat:          r.lat!,
      lng:          r.lng!,
      foodType:     r.foodType,
      category:     r.category?.slug ?? null,
      kashrutLevel: toKashrutLevel(r.hechsher.type),
      hechsher:     r.hechsher.name,
      phone:        r.phone ?? undefined,
      hours:        r.hours ?? undefined,
    }))

    const total = limited
      ? await prisma.restaurant.count({ where })
      : restaurants.length

    return {
      restaurants,
      total,
      limit: filter.limit,
      limited,
    }
  },
}
