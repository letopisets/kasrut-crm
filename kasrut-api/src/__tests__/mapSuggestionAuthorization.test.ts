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

  it('keeps add suggestions owner-only', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(updateSuggestion({
      type: 'add',
      restaurantId: null,
    }))

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).rejects.toBeInstanceOf(ForbiddenScopeError)

    expect(tx.restaurant.create).not.toHaveBeenCalled()
    expect(tx.mapRestaurantSuggestion.update).not.toHaveBeenCalled()
  })

  it('rejects a guessed suggestion id targeting another tenant inside the transaction', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(updateSuggestion())
    tx.restaurant.findUnique.mockResolvedValue({ rabbanutId: 'rb_other' })

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'rejected',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).rejects.toBeInstanceOf(ForbiddenScopeError)

    expect(tx.mapRestaurantSuggestion.update).not.toHaveBeenCalled()
  })

  it('repeats tenant predicates on both target and suggestion writes', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(updateSuggestion({ proposedName: 'New name' }))
    tx.restaurant.findUnique.mockResolvedValue({ rabbanutId: 'rb_mine' })
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
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(updateSuggestion({
      proposedHechsher: 'Shared name',
      proposedCity: 'Jerusalem',
    }))
    tx.restaurant.findUnique.mockResolvedValue({ rabbanutId: 'rb_mine' })
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

  beforeEach(() => {
    jest.resetAllMocks()
    mockPrisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    )
    tx.kashrutLevel.findUnique.mockResolvedValue({ id: 'kl_regular' })
    tx.restaurant.create.mockResolvedValue({ id: 'r_new' })
    tx.mapRestaurantSuggestion.update.mockResolvedValue(addSuggestion({ status: 'approved' }))
  })

  it('resolves a named hechsher only among active hechsherim of active, non-deleted rabbanuts', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion({ proposedHechsher: 'Badatz X' }))
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
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion({ proposedHechsher: 'Old Hechsher' }))
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
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion({ proposedHechsher: 'New Hechsher' }))
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findFirst.mockResolvedValueOnce({ id: 'rb_haifa' })
    tx.hechsher.create.mockResolvedValue({ id: 'h_new', rabbanutId: 'rb_haifa', type: 'Private' })

    await approveAsOwner()

    expect(tx.rabbanut.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...ACTIVE_RABBANUT, city: { equals: 'Haifa', mode: 'insensitive' } },
    }))
    expect(tx.hechsher.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'New Hechsher', rabbanutId: 'rb_haifa' }),
    }))
  })

  it('falls back to another active rabbanut, never to an inactive or deleted one', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion())
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findFirst
      .mockResolvedValueOnce(null)                 // none in the city
      .mockResolvedValueOnce({ id: 'rb_other' })   // an active one elsewhere
    tx.hechsher.create.mockResolvedValue({ id: 'h_new', rabbanutId: 'rb_other', type: 'Private' })

    await approveAsOwner()

    expect(tx.rabbanut.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: ACTIVE_RABBANUT }))
  })

  it('refuses the approval when no active rabbanut exists', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion())
    tx.hechsher.findFirst.mockResolvedValue(null)
    // Only withdrawn rabbanuts exist: every active lookup misses. The old
    // code then took any rabbanut at all.
    tx.rabbanut.findFirst.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      args.where?.active === true ? null : { id: 'rb_withdrawn' })

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: no active rabbanut exists for the new restaurant',
    )
    expect(tx.rabbanut.findFirst).toHaveBeenCalledTimes(2)
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.create).not.toHaveBeenCalled()
  })

  it('refuses rather than reviving a withdrawn fallback hechsher', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(addSuggestion())
    tx.rabbanut.findFirst.mockResolvedValueOnce({ id: 'rb_haifa' })
    tx.hechsher.findFirst.mockResolvedValueOnce({
      id: 'h_community', rabbanutId: 'rb_haifa', type: 'Private', active: false,
    })

    await expect(approveAsOwner()).rejects.toThrow(
      'Cannot approve suggestion: hechsher "Community review Haifa" is inactive or its rabbanut is withdrawn',
    )
    expect(tx.hechsher.create).not.toHaveBeenCalled()
  })

  it('never moves a tenant reviewer to another rabbanut when its own is withdrawn', async () => {
    tx.mapRestaurantSuggestion.findUnique.mockResolvedValue(updateSuggestion({
      proposedHechsher: 'Brand new',
      proposedCity: 'Haifa',
    }))
    tx.restaurant.findUnique.mockResolvedValue({ rabbanutId: 'rb_mine' })
    tx.hechsher.findFirst.mockResolvedValue(null)
    tx.rabbanut.findFirst.mockResolvedValue(null)   // rb_mine is inactive or deleted

    await expect(mapCommunityRepo.reviewSuggestion('s1', {
      status: 'approved',
      reviewerRole: 'rabbanut',
      reviewerRabbanutId: 'rb_mine',
    })).rejects.toThrow('Cannot approve suggestion: your rabbanut is inactive or removed')

    expect(tx.rabbanut.findFirst).toHaveBeenCalledTimes(1)
    expect(tx.rabbanut.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'rb_mine', ...ACTIVE_RABBANUT },
    }))
    expect(tx.hechsher.create).not.toHaveBeenCalled()
    expect(tx.restaurant.update).not.toHaveBeenCalled()
  })
})
