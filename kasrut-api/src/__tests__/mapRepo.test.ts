import { buildMapWhere, publicRestaurantVisibilityWhere } from '../db/map.repo'

// The public map must never surface soft-deleted or expired establishments.
// buildMapWhere is the single chokepoint, so assert the visibility predicate is
// always present — with and without a bounds clause wrapping it.
jest.mock('../lib/prisma')

describe('buildMapWhere visibility predicate', () => {
  it('excludes soft-deleted and expired establishments', () => {
    const where = buildMapWhere({ limit: 750 }) as Record<string, unknown>
    expect(where.deletedAt).toBeNull()
    expect(where.expires).toEqual({ gte: expect.any(Date) })
    // expiry cutoff is "now", not some far-past constant
    const gte = (where.expires as { gte: Date }).gte
    expect(Math.abs(gte.getTime() - Date.now())).toBeLessThan(5000)
  })

  it('keeps the visibility predicate when a bounds clause is applied', () => {
    const where = buildMapWhere({
      limit: 750,
      bounds: { north: 33, south: 32, east: 35, west: 34 },
    }) as { AND?: Array<Record<string, unknown>> }
    expect(Array.isArray(where.AND)).toBe(true)
    const base = where.AND![0]
    expect(base.deletedAt).toBeNull()
    expect(base.expires).toEqual({ gte: expect.any(Date) })
  })

  it('keeps the visibility predicate with a radius clause', () => {
    const where = buildMapWhere({
      limit: 750,
      center: { lat: 32, lng: 34 },
      radius: 5000,
    }) as { AND?: Array<Record<string, unknown>> }
    expect(Array.isArray(where.AND)).toBe(true)
    expect(where.AND![0].deletedAt).toBeNull()
  })
})

describe('buildMapWhere free-text search', () => {
  it('adds a name/address/city OR match, ANDed with visibility', () => {
    const where = buildMapWhere({ limit: 750, q: 'pizza' }) as { AND?: Array<Record<string, unknown>> }
    expect(Array.isArray(where.AND)).toBe(true)
    // base predicate (with visibility) survives as the first AND arm
    const base = where.AND![0] as Record<string, unknown>
    expect(base.deletedAt).toBeNull()
    // the search arm ORs over name/address/city
    const searchArm = where.AND![1] as { OR?: Array<Record<string, unknown>> }
    const fields = (searchArm.OR ?? []).map(c => Object.keys(c)[0])
    expect(fields).toEqual(['name', 'address', 'city'])
    expect(searchArm.OR![0]).toEqual({ name: { contains: 'pizza', mode: 'insensitive' } })
  })

  it('omits the search arm when q is absent', () => {
    const where = buildMapWhere({ limit: 750 }) as Record<string, unknown>
    expect(where.AND).toBeUndefined()
  })
})

describe('publicRestaurantVisibilityWhere (shared with community surface)', () => {
  it('hides soft-deleted and expired establishments', () => {
    const where = publicRestaurantVisibilityWhere() as Record<string, unknown>
    expect(where.deletedAt).toBeNull()
    expect(where.expires).toEqual({ gte: expect.any(Date) })
  })
})
