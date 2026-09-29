import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { prisma } from '../lib/prisma'
import { geocodeAddressDetailed } from '../lib/nominatim'

// Approving a suggestion stores coordinates with the same accuracy rule as the
// re-geocode job: only an address-level server point is 'exact'.
jest.mock('../lib/prisma', () => ({
  prisma: {
    mapRestaurantSuggestion: { findMany: jest.fn(), findUnique: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('../lib/nominatim', () => ({
  ...jest.requireActual('../lib/nominatim'),
  geocodeAddressDetailed: jest.fn(),
}))

const mockPrisma = prisma as unknown as {
  mapRestaurantSuggestion: { findUnique: jest.Mock }
  restaurant: { findUnique: jest.Mock }
  $transaction: jest.Mock
}
const mockGeocode = geocodeAddressDetailed as jest.Mock

const tx = {
  mapRestaurantSuggestion: { findUnique: jest.fn(), update: jest.fn() },
  restaurant: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  hechsher: { findFirst: jest.fn(), create: jest.fn() },
  establishmentCategory: { findUnique: jest.fn() },
  kashrutLevel: { findUnique: jest.fn(), findFirst: jest.fn() },
}

function suggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1', type: 'add', status: 'pending', restaurantId: null, mapUserId: 'mu1',
    proposedName: 'Falafel', proposedAddress: 'יפו 42', proposedCity: 'ירושלים',
    proposedHechsher: 'Rabbanut Yerushalayim', proposedKashrutStatus: null, proposedFoodType: null,
    proposedCategory: null, proposedImageUrl: null, proposedLat: null, proposedLng: null,
    notes: null, reviewerNote: null, reviewedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  }
}

const HOUSE = { lat: 31.782057, lng: 35.21984, addresstype: 'house', displayName: 'יפו 42 ירושלים', provider: 'govmap' }
const ROAD  = { lat: 31.7801, lng: 35.2175, addresstype: 'road', displayName: 'יפו ירושלים', provider: 'govmap' }
const settled = (point: unknown) => ({ point, govmapTransient: false, fallbackTransient: false })

function given(s: ReturnType<typeof suggestion>) {
  mockPrisma.mapRestaurantSuggestion.findUnique.mockResolvedValue(s)
  tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(s)
}

const approve = () => mapCommunityRepo.reviewSuggestion('s1', { status: 'approved', reviewerRole: 'owner' })
const created = () => tx.restaurant.create.mock.calls[0][0].data
const patched = () => tx.restaurant.update.mock.calls[0][0].data

describe('suggestion approval coordinates', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation((cb: (client: typeof tx) => Promise<unknown>) => cb(tx))
    tx.hechsher.findFirst.mockResolvedValue({ id: 'h1', rabbanutId: 'rb1', type: 'Rabbanut' })
    tx.kashrutLevel.findUnique.mockResolvedValue({ id: 'kl1' })
    tx.restaurant.create.mockResolvedValue({ id: 'r_new' })
    tx.restaurant.update.mockResolvedValue({ id: 'r1' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(suggestion())
  })

  it('add: a server house point is exact', async () => {
    given(suggestion())
    mockGeocode.mockResolvedValue(settled(HOUSE))
    await approve()
    expect(mockGeocode).toHaveBeenCalledWith('יפו 42', 'ירושלים', 'IL')
    expect(created()).toMatchObject({ lat: HOUSE.lat, lng: HOUSE.lng, geoAccuracy: 'exact', geocodeAttemptedAt: expect.any(Date) })
  })

  it('add: a street midpoint moves the pin but stays approximate', async () => {
    given(suggestion())
    mockGeocode.mockResolvedValue(settled(ROAD))
    await approve()
    expect(created()).toMatchObject({ lat: ROAD.lat, lng: ROAD.lng, geoAccuracy: 'approximate', geocodeAttemptedAt: expect.any(Date) })
  })

  it('add: the server re-geocodes even with a proposed point, and its point wins', async () => {
    given(suggestion({ proposedLat: 31.9, proposedLng: 35.1 }))
    mockGeocode.mockResolvedValue(settled(HOUSE))
    await approve()
    expect(created()).toMatchObject({ lat: HOUSE.lat, lng: HOUSE.lng, geoAccuracy: 'exact' })
  })

  it('add: a proposed point the server cannot confirm is kept as approximate and left for the re-geocode job', async () => {
    given(suggestion({ proposedLat: 31.9, proposedLng: 35.1 }))
    mockGeocode.mockResolvedValue(settled(null))
    await approve()
    expect(created()).toMatchObject({ lat: 31.9, lng: 35.1, geoAccuracy: 'approximate', geocodeAttemptedAt: null })
  })

  it('add: a fallback house taken while GovMap was down is approximate and unstamped', async () => {
    given(suggestion())
    mockGeocode.mockResolvedValue({ point: { ...HOUSE, provider: 'nominatim' }, govmapTransient: true, fallbackTransient: false })
    await approve()
    expect(created()).toMatchObject({ lat: HOUSE.lat, geoAccuracy: 'approximate', geocodeAttemptedAt: null })
  })

  it('update with a new address: a street-level server point is approximate, not exact', async () => {
    given(suggestion({ type: 'update', restaurantId: 'r1', proposedAddress: 'יפו', proposedHechsher: null }))
    mockPrisma.restaurant.findUnique.mockResolvedValue({ address: 'יפו 42', city: 'ירושלים', lat: HOUSE.lat, lng: HOUSE.lng })
    mockGeocode.mockResolvedValue(settled(ROAD))
    await approve()
    expect(patched()).toMatchObject({ address: 'יפו', lat: ROAD.lat, lng: ROAD.lng, geoAccuracy: 'approximate' })
  })

  it('update echoing the stored pin (the edit form) does not geocode or touch the coordinates', async () => {
    given(suggestion({ type: 'update', restaurantId: 'r1', proposedName: 'New', proposedAddress: null, proposedCity: null, proposedHechsher: null, proposedLat: HOUSE.lat, proposedLng: HOUSE.lng }))
    mockPrisma.restaurant.findUnique.mockResolvedValue({ address: 'יפו 42', city: 'ירושלים', lat: HOUSE.lat, lng: HOUSE.lng })
    await approve()
    expect(mockGeocode).not.toHaveBeenCalled()
    expect(patched()).toEqual({ name: 'New' })
  })

  it('update moving the pin: the server point for the address wins; without one the pin is approximate', async () => {
    const moved = suggestion({ type: 'update', restaurantId: 'r1', proposedName: null, proposedAddress: null, proposedCity: null, proposedHechsher: null, proposedLat: 31.79, proposedLng: 35.22 })
    given(moved)
    mockPrisma.restaurant.findUnique.mockResolvedValue({ address: 'יפו 42', city: 'ירושלים', lat: HOUSE.lat, lng: HOUSE.lng })
    mockGeocode.mockResolvedValue(settled(HOUSE))
    await approve()
    expect(patched()).toMatchObject({ lat: HOUSE.lat, lng: HOUSE.lng, geoAccuracy: 'exact' })

    tx.restaurant.update.mockClear()
    mockGeocode.mockResolvedValue(settled(null))
    await approve()
    expect(patched()).toMatchObject({ lat: 31.79, lng: 35.22, geoAccuracy: 'approximate', geocodeAttemptedAt: null })
  })

  it('update moving the pin of an EXACT row: only another address-level point replaces it', async () => {
    const moved = suggestion({ type: 'update', restaurantId: 'r1', proposedName: 'New', proposedAddress: null, proposedCity: null, proposedHechsher: null, proposedLat: 31.79, proposedLng: 35.22 })
    given(moved)
    mockPrisma.restaurant.findUnique.mockResolvedValue({ address: 'יפו 42', city: 'ירושלים', lat: 31.7825, lng: 35.2201, geoAccuracy: 'exact' })

    // a street midpoint (or nothing, or a fallback house while GovMap was down)
    // is weaker evidence than the exact pin: the stored pin and accuracy stay
    for (const outcome of [
      settled(ROAD),
      settled(null),
      { point: { ...HOUSE, provider: 'nominatim' }, govmapTransient: true, fallbackTransient: false },
    ]) {
      tx.restaurant.update.mockClear()
      mockGeocode.mockResolvedValue(outcome)
      await approve()
      expect(patched()).toEqual({ name: 'New' })
    }

    // a settled house for the address does replace it, still exact
    tx.restaurant.update.mockClear()
    mockGeocode.mockResolvedValue(settled(HOUSE))
    await approve()
    expect(patched()).toMatchObject({ name: 'New', lat: HOUSE.lat, lng: HOUSE.lng, geoAccuracy: 'exact' })
  })

  it('update moving the pin of an approximate row: a street point still wins over the bare pin', async () => {
    given(suggestion({ type: 'update', restaurantId: 'r1', proposedName: null, proposedAddress: null, proposedCity: null, proposedHechsher: null, proposedLat: 31.79, proposedLng: 35.22 }))
    mockPrisma.restaurant.findUnique.mockResolvedValue({ address: 'יפו 42', city: 'ירושלים', lat: 31.77, lng: 35.2, geoAccuracy: 'approximate' })
    mockGeocode.mockResolvedValue(settled(ROAD))
    await approve()
    expect(patched()).toMatchObject({ lat: ROAD.lat, lng: ROAD.lng, geoAccuracy: 'approximate' })
  })
})
