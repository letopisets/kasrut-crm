import { randomUUID } from 'crypto'
import { prisma } from '../lib/prisma'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { MAP_TOKEN_PURGE_GRACE_MS, purgeExpiredTokens } from '../lib/tokenPurge'

// Runs repository code against a real Postgres through the real Prisma client
// and pg adapter, which the mocked suites cannot do: they never see what the
// driver returns. Opt-in, and meant for a THROWAWAY database with every
// migration applied (the tests insert and delete rows):
//   docker run -d --rm --name kwt-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16-alpine
//   DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55432/postgres npx prisma migrate deploy
//   POSTGRES_TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:55432/postgres npx jest mapCommunity.postgres
// Skipped otherwise.
const DATABASE_URL = process.env.POSTGRES_TEST_DATABASE_URL

jest.mock('../lib/prisma', () => {
  const { PrismaClient } = jest.requireActual('../generated/prisma/client')
  const { PrismaPg } = jest.requireActual('@prisma/adapter-pg')
  const url = process.env.POSTGRES_TEST_DATABASE_URL ?? 'postgresql://unused:unused@127.0.0.1:1/unused'
  return { prisma: new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) }
})
// No Redis in this suite; the cache falls through to the loader.
jest.mock('../lib/redis', () => ({ redis: { status: 'end' } }))

const describeWithPostgres = DATABASE_URL ? describe : describe.skip

describeWithPostgres('mapCommunity repository against a real Postgres', () => {
  const run = randomUUID().slice(0, 8)
  const mapUserIds: string[] = []

  async function createMapUser(): Promise<string> {
    const user = await prisma.mapUser.create({
      data: { email: `pg-${run}-${mapUserIds.length}@example.com`, name: 'PG test', emailVerifiedAt: new Date() },
      select: { id: true },
    })
    mapUserIds.push(user.id)
    return user.id
  }

  const rabbanutIds: string[] = []

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { mapUserId: { in: mapUserIds } } })
    await prisma.mapRestaurantSuggestion.deleteMany({ where: { mapUserId: { in: mapUserIds } } })
    await prisma.mapUser.deleteMany({ where: { id: { in: mapUserIds } } })
    await prisma.restaurant.deleteMany({ where: { rabbanutId: { in: rabbanutIds } } })
    await prisma.hechsher.deleteMany({ where: { rabbanutId: { in: rabbanutIds } } })
    await prisma.rabbanut.deleteMany({ where: { id: { in: rabbanutIds } } })
    await prisma.$disconnect()
  })

  describe('createSuggestionWithinQuota', () => {
    // Regression: the per-user advisory lock ran through $queryRaw, whose
    // result the pg adapter cannot deserialize (pg_advisory_xact_lock returns
    // void) — P2010, so every POST /api/map/suggestions answered 500.
    it('creates a pending suggestion under the per-user lock', async () => {
      const mapUserId = await createMapUser()

      const created = await mapCommunityRepo.createSuggestionWithinQuota(
        mapUserId,
        { type: 'add', proposedName: 'Falafel', proposedAddress: 'Herzl 1', proposedCity: 'Haifa' },
        5,
      )

      expect(created).toMatchObject({ mapUserId, status: 'pending', proposedName: 'Falafel' })
    })

    it('holds the cap under parallel requests from one user', async () => {
      const mapUserId = await createMapUser()

      const results = await Promise.all(Array.from({ length: 6 }, (_, i) =>
        mapCommunityRepo.createSuggestionWithinQuota(
          mapUserId,
          { type: 'add', proposedName: `Place ${i}`, proposedCity: 'Haifa' },
          2,
        )))

      expect(results.filter(Boolean)).toHaveLength(2)
      expect(await prisma.mapRestaurantSuggestion.count({ where: { mapUserId, status: 'pending' } })).toBe(2)
    })
  })

  describe('purgeExpiredTokens', () => {
    it('deletes only expired refresh tokens and map links past the grace period', async () => {
      const mapUserId = await createMapUser()
      const now = new Date()
      const ago = (ms: number) => new Date(now.getTime() - ms)
      const ahead = (ms: number) => new Date(now.getTime() + ms)
      const HOUR = 3_600_000
      const tag = (name: string) => `${run}-${name}`

      await prisma.refreshToken.createMany({
        data: [
          { tokenHash: tag('rt-expired'), familyId: tag('f1'), audience: 'map', mapUserId, sessionVersion: 0, expiresAt: ago(1000) },
          { tokenHash: tag('rt-used-live'), familyId: tag('f2'), audience: 'map', mapUserId, sessionVersion: 0, expiresAt: ahead(HOUR), usedAt: ago(HOUR) },
        ],
      })
      await prisma.mapEmailVerificationToken.createMany({
        data: [
          { mapUserId, tokenHash: tag('ev-old'), expiresAt: ago(MAP_TOKEN_PURGE_GRACE_MS + HOUR), usedAt: ago(2 * MAP_TOKEN_PURGE_GRACE_MS) },
          { mapUserId, tokenHash: tag('ev-in-grace'), expiresAt: ago(HOUR) },
          { mapUserId, tokenHash: tag('ev-live'), expiresAt: ahead(HOUR) },
        ],
      })
      await prisma.mapPasswordResetToken.createMany({
        data: [
          { mapUserId, channel: 'email', tokenHash: tag('pr-old'), expiresAt: ago(MAP_TOKEN_PURGE_GRACE_MS + HOUR) },
          { mapUserId, channel: 'email', tokenHash: tag('pr-live'), expiresAt: ahead(HOUR) },
        ],
      })

      const result = await purgeExpiredTokens(now)

      expect(result.failed).toEqual({})
      expect(result.deleted.refresh_tokens).toBeGreaterThanOrEqual(1)
      const left = async () => ({
        refresh: (await prisma.refreshToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
        verification: (await prisma.mapEmailVerificationToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
        reset: (await prisma.mapPasswordResetToken.findMany({ where: { mapUserId }, select: { tokenHash: true } })).map(r => r.tokenHash),
      })
      const rows = await left()
      expect(rows.refresh).toEqual([tag('rt-used-live')])
      expect(rows.verification.sort()).toEqual([tag('ev-in-grace'), tag('ev-live')].sort())
      expect(rows.reset).toEqual([tag('pr-live')])
    })
  })

  describe('suggestion approval against withdrawn authorities', () => {
    // An update suggestion that only names a hechsher needs no geocoding, so
    // this runs the real resolveHechsher / resolveRabbanutId queries offline.
    // Names sort as created unless `label` says otherwise ('0…' sorts first);
    // each fixture gets its own city unless `city` shares one.
    async function fixture(opts: { label?: string; city?: string } = {}) {
      const n = rabbanutIds.length
      const rabbanut = await prisma.rabbanut.create({
        data: {
          name: `PG ${run} ${opts.label ?? `R${String(n).padStart(2, '0')}`}`,
          city: opts.city ?? `PGCity${run}-${n}`,
          contact: '', phone: '', email: '', color: '#000',
        },
      })
      rabbanutIds.push(rabbanut.id)
      const base = { city: rabbanut.city, contact: '', phone: '', email: '', type: 'Rabbanut' as const, color: '#000', rabbanutId: rabbanut.id }
      const tag = `${run}-${n}`
      const current = await prisma.hechsher.create({ data: { ...base, name: `Current ${tag}`, shortName: `C${tag}` } })
      const withdrawn = await prisma.hechsher.create({ data: { ...base, name: `Withdrawn ${tag}`, shortName: `W${tag}`, active: false } })
      const replacement = await prisma.hechsher.create({ data: { ...base, name: `Replacement ${tag}`, shortName: `R${tag}` } })
      const restaurant = await prisma.restaurant.create({
        data: {
          name: 'Falafel', address: 'Herzl 1', city: rabbanut.city, levelId: 'kl_regular',
          hechsherId: current.id, rabbanutId: rabbanut.id, expires: new Date('2030-01-01'),
        },
      })
      const mapUserId = await createMapUser()
      const suggest = (proposedHechsher: string) => prisma.mapRestaurantSuggestion.create({
        data: { mapUserId, type: 'update', restaurantId: restaurant.id, proposedHechsher },
      })
      return { rabbanut, current, withdrawn, replacement, restaurant, suggest }
    }

    it('refuses to relink a place to a withdrawn hechsher, and relinks to an active one', async () => {
      const { withdrawn, replacement, restaurant, suggest } = await fixture()

      const toWithdrawn = await suggest(withdrawn.name)
      await expect(mapCommunityRepo.reviewSuggestion(toWithdrawn.id, { status: 'approved', reviewerRole: 'owner' }))
        .rejects.toThrow(/^Cannot approve suggestion: hechsher .* is inactive/)
      expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).hechsherId).not.toBe(withdrawn.id)
      expect(await prisma.hechsher.count({ where: { name: withdrawn.name } })).toBe(1)

      const toActive = await suggest(replacement.name)
      const approved = await mapCommunityRepo.reviewSuggestion(toActive.id, { status: 'approved', reviewerRole: 'owner' })
      expect(approved?.status).toBe('approved')
      expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).hechsherId).toBe(replacement.id)
    })

    it("refuses a tenant reviewer whose own rabbanut has been switched off", async () => {
      const { rabbanut, restaurant, suggest } = await fixture()
      await prisma.rabbanut.update({ where: { id: rabbanut.id }, data: { active: false } })

      const suggestion = await suggest(`Brand new ${run}`)
      await expect(mapCommunityRepo.reviewSuggestion(suggestion.id, {
        status: 'approved', reviewerRole: 'rabbanut', reviewerRabbanutId: rabbanut.id,
      })).rejects.toThrow('Cannot approve suggestion: the establishment or its rabbanut has been withdrawn')
      expect(await prisma.hechsher.count({ where: { name: `Brand new ${run}` } })).toBe(0)
      expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: restaurant.id } })).rabbanutId).toBe(rabbanut.id)
    })

    // Regression: an owner's approval resolved the named hechsher across every
    // tenant (or created it in the city's / the first active rabbanut) and
    // connected the place to that hechsher's rabbanut, moving it, with its
    // inspections, into another tenant, even out of a withdrawn one.
    describe('owner approval keeps the establishment in its tenant', () => {
      it("creates an unknown hechsher inside the establishment's own rabbanut", async () => {
        // The old code filed the new hechsher under the first active rabbanut
        // by name: make that another tenant.
        await fixture({ label: '0-first' })
        const a = await fixture()
        const name = `Brand New Hechsher ${run}`

        const approved = await mapCommunityRepo.reviewSuggestion((await a.suggest(name)).id, { status: 'approved', reviewerRole: 'owner' })

        expect(approved?.status).toBe('approved')
        const place = await prisma.restaurant.findUniqueOrThrow({ where: { id: a.restaurant.id }, include: { hechsher: true } })
        expect(place.rabbanutId).toBe(a.rabbanut.id)
        expect(place.hechsher).toMatchObject({ name, rabbanutId: a.rabbanut.id })
      })

      it("refuses a hechsher of another tenant and leaves the place where it is", async () => {
        const a = await fixture()
        const b = await fixture()

        const suggestion = await a.suggest(b.replacement.name)
        await expect(mapCommunityRepo.reviewSuggestion(suggestion.id, { status: 'approved', reviewerRole: 'owner' }))
          .rejects.toThrow(/^Cannot approve suggestion: hechsher .* belongs to another rabbanut/)

        const place = await prisma.restaurant.findUniqueOrThrow({ where: { id: a.restaurant.id } })
        expect(place).toMatchObject({ rabbanutId: a.rabbanut.id, hechsherId: a.current.id })
        expect(await prisma.hechsher.count({ where: { name: b.replacement.name } })).toBe(1)
        expect((await prisma.mapRestaurantSuggestion.findUniqueOrThrow({ where: { id: suggestion.id } })).status).toBe('pending')
      })

      it('refuses a place of a switched-off rabbanut, so it stays off the map', async () => {
        await fixture({ label: '0-first' })
        const b = await fixture()
        await prisma.rabbanut.update({ where: { id: b.rabbanut.id }, data: { active: false } })

        const suggestion = await b.suggest(`Revival ${run}`)
        await expect(mapCommunityRepo.reviewSuggestion(suggestion.id, { status: 'approved', reviewerRole: 'owner' }))
          .rejects.toThrow('Cannot approve suggestion: the establishment or its rabbanut has been withdrawn')

        expect((await prisma.restaurant.findUniqueOrThrow({ where: { id: b.restaurant.id } })).rabbanutId).toBe(b.rabbanut.id)
        expect(await prisma.hechsher.count({ where: { name: `Revival ${run}` } })).toBe(0)
      })

      it("refuses a new place in a city whose rabbanut is withdrawn instead of filing it elsewhere", async () => {
        await fixture({ label: '0-first' })   // an active rabbanut in another city
        const { rabbanut } = await fixture()
        await prisma.rabbanut.update({ where: { id: rabbanut.id }, data: { active: false } })
        const mapUserId = await createMapUser()
        const suggestion = await prisma.mapRestaurantSuggestion.create({
          data: { mapUserId, type: 'add', proposedName: `New place ${run}`, proposedAddress: 'Herzl 1', proposedCity: rabbanut.city },
        })

        // No proposed hechsher and no pin: the add path geocodes the address,
        // which a test must not do over the network.
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'))
        try {
          await expect(mapCommunityRepo.reviewSuggestion(suggestion.id, { status: 'approved', reviewerRole: 'owner' }))
            .rejects.toThrow(`Cannot approve suggestion: the rabbanut of "${rabbanut.city}" is inactive or removed`)
        } finally {
          jest.restoreAllMocks()
        }
        expect(await prisma.restaurant.count({ where: { name: `New place ${run}` } })).toBe(0)
      })
    })
  })
})
