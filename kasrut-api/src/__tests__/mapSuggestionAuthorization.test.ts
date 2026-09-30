import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { prisma } from '../lib/prisma'
import { ForbiddenScopeError } from '../lib/rabbanutScope'

jest.mock('../lib/prisma', () => ({
  prisma: {
    // findUnique backs the pre-transaction coordinate-resolution peek; the
    // default (undefined) makes reviewSuggestion skip geocoding in tests.
    mapRestaurantSuggestion: { findMany: jest.fn(), findUnique: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

const mockPrisma = prisma as unknown as {
  mapRestaurantSuggestion: { findMany: jest.Mock; findUnique: jest.Mock }
  restaurant: { findUnique: jest.Mock }
  $transaction: jest.Mock
}

const tx = {
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn(),
  mapRestaurantSuggestion: {
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  hechsher: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  rabbanut: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  establishmentCategory: {
    findUnique: jest.fn(),
  },
  kashrutLevel: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
}

function updateSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    type: 'update',
    status: 'pending',
    restaurantId: 'r1',
    mapUserId: 'mu1',
    proposedName: null,
    proposedAddress: null,
    proposedCity: null,
    proposedHechsher: null,
    proposedKashrutStatus: null,
    proposedFoodType: null,
    proposedCategory: null,
    proposedImageUrl: null,
    proposedLat: null,
    proposedLng: null,
    notes: null,
    reviewerNote: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// What reviewSuggestion's pre-transaction peek and in-transaction target read
// see. The peek carries the target's tenant; the target read also its
// visibility (a withdrawn place or rabbanut refuses approval).
function peekOf(s: ReturnType<typeof updateSuggestion>, rabbanutId: string | null = 'rb_mine') {
  return { ...s, restaurant: rabbanutId ? { rabbanutId } : null }
}

function liveTarget(rabbanutId = 'rb_mine', overrides: Record<string, unknown> = {}) {
  return {
    rabbanutId,
    city: 'Jerusalem',
    deletedAt: null,
    rabbanut: { active: true, deletedAt: null },
    ...overrides,
  }
}

function givenSuggestion(s: ReturnType<typeof updateSuggestion>, peekRabbanutId: string | null = 'rb_mine') {
  mockPrisma.mapRestaurantSuggestion.findUnique.mockResolvedValue(peekOf(s, peekRabbanutId))
  tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(s)
}

describe('map suggestion moderation tenant authorization', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    )
  })

  it('lists only update suggestions targeting the reviewer rabbanut', async () => {
    mockPrisma.mapRestaurantSuggestion.findMany.mockResolvedValue([])

    await mapCommunityRepo.listSuggestions({
      status: 'pending',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })

    expect(mockPrisma.mapRestaurantSuggestion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'pending',
          type: 'update',
          restaurant: { is: { rabbanutId: 'rb_mine' } },
        },
      }),
    )
  })

  it('fails closed when a rabbanut reviewer has no tenant id', async () => {
    await expect(mapCommunityRepo.listSuggestions({ reviewerRole: 'rabbanut' }))
      .rejects.toBeInstanceOf(ForbiddenScopeError)
    expect(mockPrisma.mapRestaurantSuggestion.findMany).not.toHaveBeenCalled()
  })

  it('keeps add suggestions owner-only: a tenant reviewer gets the not-found answer', async () => {
    givenSuggestion(updateSuggestion({ type: 'add', restaurantId: null }), null)

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).resolves.toBeNull()

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(tx.restaurant.create).not.toHaveBeenCalled()
  })

  it("answers another tenant's suggestion exactly like a missing one, before any geocoding", async () => {
    // An address change would otherwise be geocoded before the scope check.
    givenSuggestion(updateSuggestion({ proposedAddress: 'Herzl 5' }), 'rb_other')

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).resolves.toBeNull()

    mockPrisma.mapRestaurantSuggestion.findUnique.mockResolvedValue(null)
    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'rejected',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).resolves.toBeNull()

    expect(mockPrisma.restaurant.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it('fails closed when the target moved to another tenant after the peek', async () => {
    givenSuggestion(updateSuggestion())
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_other'))

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'rejected',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).rejects.toBeInstanceOf(ForbiddenScopeError)

    expect(tx.mapRestaurantSuggestion.update).not.toHaveBeenCalled()
  })

  it('repeats tenant predicates on both target and suggestion writes', async () => {
    givenSuggestion(updateSuggestion({ proposedName: 'New name' }))
    tx.restaurant.findUnique.mockResolvedValue(liveTarget())
    tx.restaurant.update.mockResolvedValue({ id: 'r1' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(updateSuggestion({ proposedName: 'New name' }))

    await mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })

    expect(tx.restaurant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r1', rabbanutId: 'rb_mine' },
    }))
    expect(tx.mapRestaurantSuggestion.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 's1',
        status: 'pending',
        type: 'update',
        restaurant: { is: { rabbanutId: 'rb_mine' } },
      },
    }))
  })

  it('scopes hechsher lookup to the reviewer tenant', async () => {
    givenSuggestion(updateSuggestion({
      proposedHechsher: 'Shared name',
      proposedCity: 'Jerusalem',
    }))
    tx.restaurant.findUnique.mockResolvedValue(liveTarget())
    tx.hechsher.findFirst.mockResolvedValue({ id: 'h1', rabbanutId: 'rb_mine', type: 'Rabbanut' })
    tx.kashrutLevel.findUnique.mockResolvedValue({ id: 'kl_regular' })
    tx.restaurant.update.mockResolvedValue({ id: 'r1' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(updateSuggestion())

    await mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })

    expect(tx.hechsher.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ rabbanutId: 'rb_mine' }),
    }))
  })

  it('checks and creates a pending suggestion under one per-user lock', async () => {
    tx.$executeRaw.mockResolvedValue(1)
    tx.mapRestaurantSuggestion.count.mockResolvedValue(4)
    tx.mapRestaurantSuggestion.create.mockResolvedValue(updateSuggestion())

    const result = await mapCommunityRepo.createSuggestionWithinQuota(
      'mu1',
      { type: 'update', restaurantId: 'r1', notes: 'Correction' },
      5,
    )

    // $executeRaw: pg_advisory_xact_lock returns void, which $queryRaw cannot
    // deserialize with the pg adapter (see mapCommunity.postgres.test.ts).
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1)
    expect(tx.$queryRaw).not.toHaveBeenCalled()
    const [strings, key] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, string]
    expect(strings.join('?')).toContain('pg_advisory_xact_lock')
    expect(key).toBe('map-suggestion:mu1')
    expect(tx.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(tx.mapRestaurantSuggestion.count.mock.invocationCallOrder[0])
    expect(tx.mapRestaurantSuggestion.count).toHaveBeenCalledWith({
      where: { mapUserId: 'mu1', status: 'pending' },
    })
    expect(tx.mapRestaurantSuggestion.create).toHaveBeenCalledTimes(1)
    expect(result).not.toBeNull()
  })

  it('does not create a suggestion after the atomic quota check reaches the cap', async () => {
    tx.$executeRaw.mockResolvedValue(1)
    tx.mapRestaurantSuggestion.count.mockResolvedValue(5)

    const result = await mapCommunityRepo.createSuggestionWithinQuota(
      'mu1',
      { type: 'update', restaurantId: 'r1', notes: 'Correction' },
      5,
    )

    expect(result).toBeNull()
    expect(tx.mapRestaurantSuggestion.create).not.toHaveBeenCalled()
  })
})

// Approval must never link a place to a withdrawn authority: a soft-deleted or
// inactive rabbanut, or an inactive hechsher (all hidden from the public map).
describe('map suggestion approval skips withdrawn rabbanuts and hechsherim', () => {
  const ACTIVE_RABBANUT = { active: true, deletedAt: null }

  function addSuggestion(overrides: Record<string, unknown> = {}) {
    return updateSuggestion({
      type: 'add',
      restaurantId: null,
      proposedName: 'Falafel',
      proposedAddress: 'Herzl 1',
      proposedCity: 'Haifa',
      ...overrides,
    })
  }

  const approveAsOwner = () => mapCommunityRepo.reviewSuggestion('s1', { status: 'approved', reviewerRole: 'owner' })
  const givenAdd = (s: ReturnType<typeof addSuggestion>) => givenSuggestion(s, null)

  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    )
    tx.kashrutLevel.findUnique.mockResolvedValue({ id: 'kl_regular' })
    tx.restaurant.create.mockResolvedValue({ id: 'r_new' })
    tx.restaurant.update.mockResolvedValue({ id: 'r1' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(addSuggestion({ status: 'approved' }))
  })

  it('resolves a named hechsher only among active hechsherim of active, non-deleted rabbanuts', async () => {
    givenAdd(addSuggestion({ proposedHechsher: 'Badatz X' }))
    tx.hechsher.findFirst.mockResolvedValueOnce({ id: 'h_x', rabbanutId: 'rb_x', type: 'Badatz' })

    await approveAsOwner()

    expect(tx.hechsher.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.hechsher.findFirst.mock.calls[0][0].where).toMatchObject({
      active: true,
      rabbanut: ACTIVE_RABBANUT,
    })
    expect(tx.restaurant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ hechsherId: 'h_x', rabbanutId: 'rb_x' }),
    }))
  })

  it('refuses the approval when the named hechsher exists only withdrawn', async () => {
    givenAdd(addSuggestion({ proposedHechsher: 'Old Hechsher' }))
    tx.hechsher.findFirst
      .mockResolvedValueOnce(null)              // no active match
      .mockResolvedValueOnce({ id: 'h_old' })   // but a withdrawn one by that name

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: hechsher "Old Hechsher" is inactive or its rabbanut is withdrawn',
    )
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.create).not.toHaveBeenCalled()
    expect(tx.mapRestaurantSuggestion.update).not.toHaveBeenCalled()
  })

  it('picks the city rabbanut only when it is active and not deleted', async () => {
    givenAdd(addSuggestion({ proposedHechsher: 'New Hechsher' }))
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findMany.mockResolvedValueOnce([
      { id: 'rb_haifa_old', active: false, deletedAt: null },
      { id: 'rb_haifa_gone', active: true, deletedAt: new Date() },
      { id: 'rb_haifa', active: true, deletedAt: null },
    ])
    tx.hechsher.create.mockResolvedValue({ id: 'h_new', rabbanutId: 'rb_haifa', type: 'Private' })

    await approveAsOwner()

    expect(tx.rabbanut.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { city: { equals: 'Haifa', mode: 'insensitive' } },
    }))
    expect(tx.rabbanut.findFirst).not.toHaveBeenCalled()
    expect(tx.hechsher.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'New Hechsher', rabbanutId: 'rb_haifa' }),
    }))
  })

  it("refuses rather than filing the place under another city's rabbanut when its own is withdrawn", async () => {
    givenAdd(addSuggestion())
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findMany.mockResolvedValueOnce([{ id: 'rb_haifa', active: false, deletedAt: null }])
    tx.rabbanut.findFirst.mockResolvedValue({ id: 'rb_other' })   // must not be consulted

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: the rabbanut of "Haifa" is inactive or removed',
    )
    expect(tx.rabbanut.findFirst).not.toHaveBeenCalled()
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.create).not.toHaveBeenCalled()
  })

  it('falls back to another active rabbanut only for a city no rabbanut covers', async () => {
    givenAdd(addSuggestion())
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findMany.mockResolvedValueOnce([])                   // none in the city
    tx.rabbanut.findFirst.mockResolvedValueOnce({ id: 'rb_other' })   // an active one elsewhere
    tx.hechsher.create.mockResolvedValue({ id: 'h_new', rabbanutId: 'rb_other', type: 'Private' })

    await approveAsOwner()

    expect(tx.rabbanut.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: ACTIVE_RABBANUT }))
  })

  it('refuses the approval when no active rabbanut exists', async () => {
    givenAdd(addSuggestion())
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findMany.mockResolvedValueOnce([])
    tx.rabbanut.findFirst.mockResolvedValue(null)

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: no active rabbanut exists for the new restaurant',
    )
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.create).not.toHaveBeenCalled()
  })

  it('refuses rather than reviving a withdrawn fallback hechsher', async () => {
    givenAdd(addSuggestion())
    tx.rabbanut.findMany.mockResolvedValueOnce([{ id: 'rb_haifa', active: true, deletedAt: null }])
    tx.hechsher.findFirst.mockResolvedValueOnce({
      id: 'h_community', rabbanutId: 'rb_haifa', type: 'Private', active: false,
    })

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: hechsher "Community review Haifa" is inactive or its rabbanut is withdrawn',
    )
    expect(tx.hechsher.create).not.toHaveBeenCalled()
  })

  it('refuses a tenant reviewer when the establishment or its rabbanut is withdrawn', async () => {
    givenSuggestion(updateSuggestion({ proposedHechsher: 'Brand new', proposedCity: 'Haifa' }))
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_mine', { rabbanut: { active: false, deletedAt: null } }))

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).rejects.toThrow('Cannot approve suggestion: the establishment or its rabbanut has been withdrawn')

    expect(tx.rabbanut.findFirst).not.toHaveBeenCalled()
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.update).not.toHaveBeenCalled()
  })
})

// An owner approving an update suggestion used to resolve its hechsher across
// all tenants and connect the place to the hechsher's rabbanut, so a map
// user's text could move an establishment (with its inspections) into another
// tenant, or out of a withdrawn one and back onto the public map.
describe('owner approval of an update suggestion keeps the establishment in its tenant', () => {
  const approveAsOwner = () => mapCommunityRepo.reviewSuggestion('s1', { status: 'approved', reviewerRole: 'owner' })

  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    )
    tx.kashrutLevel.findUnique.mockResolvedValue({ id: 'kl_regular' })
    tx.restaurant.update.mockResolvedValue({ id: 'r1' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(updateSuggestion({ status: 'approved' }))
  })

  it("resolves the named hechsher only inside the establishment's rabbanut and never connects a rabbanut", async () => {
    givenSuggestion(updateSuggestion({ proposedHechsher: 'Shared name' }), 'rb_a')
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_a'))
    tx.hechsher.findFirst.mockResolvedValueOnce({ id: 'h_a', rabbanutId: 'rb_a', type: 'Rabbanut' })

    await approveAsOwner()

    expect(tx.hechsher.findFirst.mock.calls[0][0].where).toMatchObject({ rabbanutId: 'rb_a' })
    const { where, data } = tx.restaurant.update.mock.calls[0][0]
    expect(where).toEqual({ id: 'r1', rabbanutId: 'rb_a' })
    expect(data.hechsher).toEqual({ connect: { id: 'h_a' } })
    expect(data).not.toHaveProperty('rabbanut')
  })

  it("creates an unknown hechsher in the establishment's own rabbanut, not the city's or the first one", async () => {
    givenSuggestion(updateSuggestion({ proposedHechsher: 'Brand New Hechsher' }), 'rb_a')
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_a', { city: 'Tzfat' }))
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findFirst.mockResolvedValueOnce({ id: 'rb_a' })
    tx.hechsher.create.mockResolvedValue({ id: 'h_new', rabbanutId: 'rb_a', type: 'Private' })

    await approveAsOwner()

    expect(tx.rabbanut.findMany).not.toHaveBeenCalled()
    expect(tx.rabbanut.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rb_a', active: true, deletedAt: null },
    }))
    expect(tx.hechsher.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Brand New Hechsher', city: 'Tzfat', rabbanutId: 'rb_a' }),
    }))
    expect(tx.restaurant.update.mock.calls[0][0].data).not.toHaveProperty('rabbanut')
  })

  it("refuses a hechsher that exists only in another tenant instead of moving the place or copying the name", async () => {
    givenSuggestion(updateSuggestion({ proposedHechsher: 'Badatz B' }), 'rb_a')
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_a'))
    tx.hechsher.findFirst
      .mockResolvedValueOnce(null)             // no active match in rb_a
      .mockResolvedValueOnce(null)             // no withdrawn one in rb_a either
      .mockResolvedValueOnce({ id: 'h_b' })    // but rb_b has it

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: hechsher "Badatz B" belongs to another rabbanut; move the establishment in the CRM instead',
    )
    expect(tx.hechsher.findFirst.mock.calls[2][0].where).toMatchObject({ rabbanutId: { not: 'rb_a' } })
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.update).not.toHaveBeenCalled()
  })

  it.each([
    ['soft-deleted', { deletedAt: new Date() }],
    ['of a switched-off rabbanut', { rabbanut: { active: false, deletedAt: null } }],
    ['of a removed rabbanut', { rabbanut: { active: true, deletedAt: new Date() } }],
  ])('refuses an establishment %s', async (_label, overrides) => {
    givenSuggestion(updateSuggestion({ proposedName: 'Renamed', proposedHechsher: 'Brand New' }), 'rb_b')
    tx.restaurant.findUnique.mockResolvedValue(liveTarget('rb_b', overrides))

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: the establishment or its rabbanut has been withdrawn',
    )
    expect(tx.hechsher.findFirst).not.toHaveBeenCalled()
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.update).not.toHaveBeenCalled()
    expect(tx.mapRestaurantSuggestion.update).not.toHaveBeenCalled()
  })

  it('refuses when the establishment no longer exists, but still lets it be rejected', async () => {
    givenSuggestion(updateSuggestion({ proposedName: 'Renamed' }), null)
    tx.restaurant.findUnique.mockResolvedValue(null)

    await expect(approveAsOwner()).rejects.toThrow('Cannot approve suggestion: the establishment no longer exists')

    await mapCommunityRepo.reviewSuggestion('s1', { status: 'rejected', reviewerRole: 'owner' })
    expect(tx.mapRestaurantSuggestion.update).toHaveBeenCalledTimes(1)
    expect(tx.restaurant.update).not.toHaveBeenCalled()
  })
})
