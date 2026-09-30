import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { prisma } from '../lib/prisma'

jest.mock('../lib/prisma', () => ({
  prisma: { $transaction: jest.fn(), mapUser: { create: jest.fn() } },
}))

// Just enough of map_users and map_email_verification_tokens to run the repo's
// transactions, with Prisma's semantics for the filters it uses.
interface TokenRow { id: string; mapUserId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }
interface UserRow { id: string; email: string; emailVerifiedAt: Date | null }

let tokens: TokenRow[]
let users: UserRow[]
let seq: number

function matchesToken(row: TokenRow, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && row.id !== where.id) return false
  if (where.mapUserId !== undefined && row.mapUserId !== where.mapUserId) return false
  if ('usedAt' in where && where.usedAt === null && row.usedAt !== null) return false
  const expires = where.expiresAt as { gt: Date } | undefined
  if (expires && !(row.expiresAt > expires.gt)) return false
  return true
}

const tx = {
  $executeRaw: jest.fn(async () => 1),
  mapEmailVerificationToken: {
    // Includes the account, as the repo's select asks.
    findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
      const row = tokens.find(t => t.tokenHash === where.tokenHash)
      const owner = row && users.find(u => u.id === row.mapUserId)
      return row && owner ? { ...row, mapUser: { ...owner } } : null
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
      const hit = tokens.filter(row => matchesToken(row, where))
      hit.forEach(row => { row.usedAt = data.usedAt })
      return { count: hit.length }
    }),
    create: jest.fn(async ({ data }: { data: Omit<TokenRow, 'id' | 'usedAt'> }) => {
      const row = { id: `t${seq++}`, usedAt: null, ...data }
      tokens.push(row)
      return row
    }),
  },
  mapUser: {
    updateMany: jest.fn(async ({ where, data }: { where: { id: string; emailVerifiedAt: null }; data: { emailVerifiedAt: Date } }) => {
      const hit = users.filter(u => u.id === where.id && u.emailVerifiedAt === null)
      hit.forEach(u => { u.emailVerifiedAt = data.emailVerifiedAt })
      return { count: hit.length }
    }),
    findUnique: jest.fn(),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
  },
  mapOAuthIdentity: { findUnique: jest.fn() },
  mapPasswordResetToken: { updateMany: jest.fn() },
}

const mockPrisma = prisma as unknown as { $transaction: jest.Mock; mapUser: { create: jest.Mock } }

const HOUR_MS = 60 * 60 * 1000
const user = (id: string, emailVerifiedAt: Date | null = null): UserRow => ({ id, email: `${id}@example.com`, emailVerifiedAt })
const addToken = (tokenHash: string, mapUserId: string, expiresInMs: number) => {
  tokens.push({ id: `t${seq++}`, mapUserId, tokenHash, expiresAt: new Date(Date.now() + expiresInMs), usedAt: null })
}

beforeEach(() => {
  tokens = []
  users = []
  seq = 0
  mockPrisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx))
})

const status = async (tokenHash: string) => (await mapCommunityRepo.consumeEmailVerificationToken(tokenHash)).status

describe('consumeEmailVerificationToken', () => {
  it('verifies the account once; the same link then only reports it', async () => {
    users.push(user('u1'))
    addToken('hash-1', 'u1', 24 * HOUR_MS)

    await expect(mapCommunityRepo.consumeEmailVerificationToken('hash-1')).resolves.toEqual({
      status: 'verified',
      user: { id: 'u1', email: 'u1@example.com' },
    })
    const verifiedAt = users[0].emailVerifiedAt
    const usedAt = tokens[0].usedAt
    expect(verifiedAt).toBeInstanceOf(Date)
    expect(usedAt).toBeInstanceOf(Date)

    await expect(status('hash-1')).resolves.toBe('already_verified')
    expect(users[0].emailVerifiedAt).toBe(verifiedAt)
    expect(tokens[0].usedAt).toBe(usedAt)
  })

  it('lets only one of two simultaneous uses through', async () => {
    users.push(user('u1'))
    addToken('hash-1', 'u1', 24 * HOUR_MS)

    // Both read the link before either claims it; the claim decides.
    const results = await Promise.all([status('hash-1'), status('hash-1')])

    expect(results.sort()).toEqual(['invalid', 'verified'])
    expect(tx.mapUser.updateMany).toHaveBeenCalledTimes(1)
  })

  it('refuses an expired link and leaves the account unverified', async () => {
    users.push(user('u1'))
    addToken('hash-old', 'u1', -1000)

    await expect(mapCommunityRepo.consumeEmailVerificationToken('hash-old')).resolves.toEqual({
      status: 'invalid',
      user: { id: 'u1', email: 'u1@example.com' },
    })
    expect(users[0].emailVerifiedAt).toBeNull()
    expect(tokens[0].usedAt).toBeNull()
  })

  it('refuses a link a newer one replaced', async () => {
    users.push(user('u1'))
    addToken('hash-1', 'u1', HOUR_MS)
    tokens[0].usedAt = new Date()

    await expect(status('hash-1')).resolves.toBe('invalid')
    expect(users[0].emailVerifiedAt).toBeNull()
  })

  it('refuses an unknown link', async () => {
    await expect(mapCommunityRepo.consumeEmailVerificationToken('nope')).resolves.toEqual({ status: 'invalid', user: null })
    expect(tx.mapUser.updateMany).not.toHaveBeenCalled()
  })

  it('reports an account verified meanwhile (OAuth claim) without touching it', async () => {
    const original = new Date('2026-09-01T00:00:00Z')
    users.push(user('u1', original))
    addToken('hash-1', 'u1', -1000)

    await expect(status('hash-1')).resolves.toBe('already_verified')
    expect(users[0].emailVerifiedAt).toBe(original)
    expect(tx.mapEmailVerificationToken.updateMany).not.toHaveBeenCalled()
  })

  it('treats a serialization failure as a lost race', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('write conflict'), { code: 'P2034' }))
    await expect(mapCommunityRepo.consumeEmailVerificationToken('hash-1')).resolves.toEqual({ status: 'invalid', user: null })
  })

  it('passes other errors on', async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error('connection lost'))
    await expect(mapCommunityRepo.consumeEmailVerificationToken('hash-1')).rejects.toThrow('connection lost')
  })
})

describe('createEmailVerificationToken', () => {
  it('retires the unused links of that account only', async () => {
    users.push(user('u1'), user('u2'))
    addToken('first', 'u1', 24 * HOUR_MS)
    addToken('other-user', 'u2', 24 * HOUR_MS)

    await mapCommunityRepo.createEmailVerificationToken({ mapUserId: 'u1', tokenHash: 'second', expiresAt: new Date(Date.now() + 24 * HOUR_MS) })

    await expect(status('first')).resolves.toBe('invalid')
    await expect(status('other-user')).resolves.toBe('verified')
    await expect(status('second')).resolves.toBe('verified')
  })

  it('takes the per-account lock first, in a transaction without Serializable', async () => {
    users.push(user('u1'))

    await mapCommunityRepo.createEmailVerificationToken({ mapUserId: 'u1', tokenHash: 'next', expiresAt: new Date(Date.now() + HOUR_MS) })

    const [strings, key] = tx.$executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, string]
    expect(strings.join('?')).toContain('pg_advisory_xact_lock')
    expect(key).toBe('map-email-verification:u1')
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.mapEmailVerificationToken.updateMany.mock.invocationCallOrder[0])
    // A second argument would carry an isolation level.
    expect(mockPrisma.$transaction.mock.calls[0]).toHaveLength(1)
  })
})

describe('createPasswordUser', () => {
  it('creates the account unverified together with its token', async () => {
    const expiresAt = new Date(Date.now() + 24 * HOUR_MS)
    await mapCommunityRepo.createPasswordUser({
      firstName: 'New', lastName: 'User', email: 'new@example.com', phone: '+972500000001', passwordHash: 'hash',
      emailVerification: { tokenHash: 'token-hash', expiresAt },
    })

    const { data } = mockPrisma.mapUser.create.mock.calls[0][0]
    expect(data.emailVerifiedAt).toBeNull()
    expect(data.emailVerificationTokens).toEqual({ create: { tokenHash: 'token-hash', expiresAt } })
  })

  it('creates no token when none is given', async () => {
    await mapCommunityRepo.createPasswordUser({
      firstName: 'New', lastName: 'User', email: 'new@example.com', phone: '+972500000001', passwordHash: 'hash',
      emailVerification: null,
    })

    const { data } = mockPrisma.mapUser.create.mock.calls[0][0]
    expect(data.emailVerifiedAt).toBeNull()
    expect(data).not.toHaveProperty('emailVerificationTokens')
  })
})

describe('upsertUserFromIdentity marks OAuth accounts verified', () => {
  const profile = { provider: 'google' as const, providerUserId: 'google-sub-1', email: 'g@example.com', name: 'G User' }

  it('a new account', async () => {
    tx.mapOAuthIdentity.findUnique.mockResolvedValue(null)
    tx.mapUser.findUnique.mockResolvedValue(null)

    await mapCommunityRepo.upsertUserFromIdentity(profile)

    expect(tx.mapUser.create.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date)
  })

  it('a claimed password account, retiring its pending links', async () => {
    users.push(user('u1'))
    addToken('pending', 'u1', 24 * HOUR_MS)
    tx.mapOAuthIdentity.findUnique.mockResolvedValue(null)
    tx.mapUser.findUnique.mockResolvedValue({ id: 'u1', email: profile.email, avatarUrl: null, emailVerifiedAt: null })

    await mapCommunityRepo.upsertUserFromIdentity(profile)

    expect(tx.mapUser.update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date)
    expect(tokens[0].usedAt).toBeInstanceOf(Date)
  })

  it('an existing identity, keeping an earlier verification time', async () => {
    const original = new Date('2026-07-15T08:30:00Z')
    tx.mapOAuthIdentity.findUnique.mockResolvedValue({ mapUserId: 'u1', mapUser: { avatarUrl: null, emailVerifiedAt: original } })

    await mapCommunityRepo.upsertUserFromIdentity(profile)

    expect(tx.mapUser.update.mock.calls[0][0].data.emailVerifiedAt).toBe(original)
  })

  it('an existing identity whose account was never marked', async () => {
    tx.mapOAuthIdentity.findUnique.mockResolvedValue({ mapUserId: 'u1', mapUser: { avatarUrl: null, emailVerifiedAt: null } })

    await mapCommunityRepo.upsertUserFromIdentity(profile)

    expect(tx.mapUser.update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date)
  })
})
