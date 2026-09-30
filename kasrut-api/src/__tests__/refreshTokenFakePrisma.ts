import type { RefreshTokenAudience } from '../generated/prisma/client'

// In-memory stand-in for the parts of PrismaClient that db/refreshTokens.repo
// uses, so the refresh flow can be exercised end to end without Postgres. It
// enforces what the database would: the unique tokenHash, the CHECK that ties
// the owner column to the audience, and all-or-nothing transactions.
// Accounts are reduced to their sessionVersion.

export interface FakeRefreshTokenRow {
  id:             string
  tokenHash:      string
  familyId:       string
  audience:       RefreshTokenAudience
  userId:         string | null
  mapUserId:      string | null
  sessionVersion: number
  createdAt:      Date
  expiresAt:      Date
  usedAt:         Date | null
  revokedAt:      Date | null
  userAgent:      string | null
}

type Where = Record<string, unknown>
type DateFilter = { gt?: Date; lt?: Date; lte?: Date }

function matches(row: FakeRefreshTokenRow, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key as keyof FakeRefreshTokenRow]
    if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
      return value instanceof Date && condition instanceof Date
        ? value.getTime() === condition.getTime()
        : value === condition
    }
    if (!(value instanceof Date)) return false
    const { gt, lt, lte } = condition as DateFilter
    return (gt === undefined || value > gt) &&
      (lt === undefined || value < lt) &&
      (lte === undefined || value <= lte)
  })
}

export function createFakePrisma() {
  const refreshTokens = new Map<string, FakeRefreshTokenRow>()
  const sessionVersions = { user: new Map<string, number>(), mapUser: new Map<string, number>() }
  let seq = 0

  const refreshToken = {
    async create({ data }: { data: Partial<FakeRefreshTokenRow> & Pick<FakeRefreshTokenRow, 'tokenHash' | 'audience'> }) {
      if ([...refreshTokens.values()].some(row => row.tokenHash === data.tokenHash)) {
        throw new Error('Unique constraint failed on the fields: (`tokenHash`)')
      }
      const userId = data.userId ?? null
      const mapUserId = data.mapUserId ?? null
      const ownerMatches = data.audience === 'crm'
        ? userId !== null && mapUserId === null
        : mapUserId !== null && userId === null
      if (!ownerMatches) throw new Error('violates check constraint "refresh_tokens_owner_matches_audience"')

      seq += 1
      const row: FakeRefreshTokenRow = {
        id:             `rt-${seq}`,
        familyId:       data.familyId ?? '',
        sessionVersion: data.sessionVersion ?? 0,
        createdAt:      new Date(),
        expiresAt:      data.expiresAt ?? new Date(),
        usedAt:         null,
        revokedAt:      null,
        userAgent:      data.userAgent ?? null,
        tokenHash:      data.tokenHash,
        audience:       data.audience,
        userId,
        mapUserId,
      }
      refreshTokens.set(row.id, row)
      return { id: row.id }
    },

    async findUnique({ where }: { where: { tokenHash: string } }) {
      const row = [...refreshTokens.values()].find(candidate => candidate.tokenHash === where.tokenHash)
      return row ? { ...row } : null
    },

    async updateMany({ where, data }: { where: Where; data: Partial<FakeRefreshTokenRow> }) {
      let count = 0
      for (const row of refreshTokens.values()) {
        if (!matches(row, where)) continue
        Object.assign(row, data)
        count += 1
      }
      return { count }
    },

    async deleteMany({ where }: { where: Where }) {
      let count = 0
      for (const [id, row] of refreshTokens) {
        if (!matches(row, where)) continue
        refreshTokens.delete(id)
        count += 1
      }
      return { count }
    },
  }

  function accountDelegate(versions: Map<string, number>) {
    return {
      async updateMany({ where, data }: {
        where: { id: string; sessionVersion?: number }
        data:  { sessionVersion: { increment: number } }
      }) {
        const current = versions.get(where.id)
        if (current === undefined) return { count: 0 }
        if (where.sessionVersion !== undefined && where.sessionVersion !== current) return { count: 0 }
        versions.set(where.id, current + data.sessionVersion.increment)
        return { count: 1 }
      },
    }
  }

  // Transactions run one at a time. Postgres only serialises those touching
  // the same rows (a conditional UPDATE waits for the row lock and re-checks
  // its WHERE), which for these tests amounts to the same thing.
  let transactionQueue: Promise<void> = Promise.resolve()

  const prisma = {
    refreshToken,
    user:    accountDelegate(sessionVersions.user),
    mapUser: accountDelegate(sessionVersions.mapUser),
    async $transaction<T>(run: (tx: unknown) => Promise<T>): Promise<T> {
      const previous = transactionQueue
      let release = () => {}
      transactionQueue = new Promise(resolve => { release = resolve })
      await previous

      const rows = new Map([...refreshTokens].map(([id, row]) => [id, { ...row }]))
      const users = new Map(sessionVersions.user)
      const mapUsers = new Map(sessionVersions.mapUser)
      try {
        return await run(prisma)
      } catch (error) {
        refreshTokens.clear()
        rows.forEach((row, id) => refreshTokens.set(id, row))
        sessionVersions.user.clear()
        users.forEach((version, id) => sessionVersions.user.set(id, version))
        sessionVersions.mapUser.clear()
        mapUsers.forEach((version, id) => sessionVersions.mapUser.set(id, version))
        throw error
      } finally {
        release()
      }
    },
  }

  return {
    prisma,
    refreshTokens,
    sessionVersions,
    reset(): void {
      refreshTokens.clear()
      sessionVersions.user.clear()
      sessionVersions.mapUser.clear()
    },
  }
}

// One shared instance: the jest.mock factory for ../lib/prisma hands out its
// `prisma`, and the test inspects the same rows.
export const fakeDb = createFakePrisma()
