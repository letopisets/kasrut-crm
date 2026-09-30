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
