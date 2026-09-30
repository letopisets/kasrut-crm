import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { Prisma } from '../generated/prisma/client'
import { encrypt, decrypt } from '../lib/crypto'
import type { User, Role } from '../models/types'
import type { User as PrismaUser } from '../generated/prisma/client'

export interface PageResult<T> { items: T[]; nextCursor: string | null }

/**
 * Fields update() may change. Deliberately narrow: password, 2FA state and
 * sessionVersion have dedicated methods (a 2FA secret must be encrypted, and
 * resetting sessionVersion would revive revoked tokens). Tenant links accept
 * `null` to clear them.
 */
export type UserPatch = Partial<Pick<User, 'name' | 'email' | 'role'>> & {
  rabbanutId?:  string | null
  mashgiachId?: string | null
}

/** Authorization state a patch was validated against. */
export interface UserAuthState {
  role:        Role
  rabbanutId:  string | null
  mashgiachId: string | null
}

/** The user's role/tenant links changed after they were read and validated. */
export class UserChangedError extends Error {
  constructor() {
    super('User was changed concurrently')
    this.name = 'UserChangedError'
  }
}

function toUser(u: PrismaUser): User {
  let twoFactorSecret: string | undefined
  if (u.twoFactorSecret) {
    // Decrypt stored secret; fall back to raw value for legacy unencrypted rows
    twoFactorSecret = decrypt(u.twoFactorSecret) ?? u.twoFactorSecret
  }
  return {
    id:                   u.id,
    name:                 u.name,
    email:                u.email,
    passwordHash:         u.passwordHash,
    role:                 u.role as Role,
    twoFactorEnabled:     u.twoFactorEnabled,
    twoFactorBackupCodes: u.twoFactorBackupCodes ?? [],
    sessionVersion:       u.sessionVersion,
    ...(u.rabbanutId    ? { rabbanutId: u.rabbanutId } : {}),
    ...(u.mashgiachId   ? { mashgiachId: u.mashgiachId } : {}),
    ...(twoFactorSecret ? { twoFactorSecret }          : {}),
  }
}

function hasActiveTenant(u: {
  role: string
  rabbanutId: string | null
  mashgiachId: string | null
  rabbanut: { active: boolean; deletedAt: Date | null } | null
  mashgiach: { active: boolean; rabbanutId: string } | null
}): boolean {
  if (u.role === 'owner') return true
  if (!u.rabbanutId || !u.rabbanut?.active || u.rabbanut.deletedAt !== null) return false
  if (u.role === 'mashgiach' && (
    !u.mashgiachId ||
    !u.mashgiach?.active ||
    u.mashgiach.rabbanutId !== u.rabbanutId
  )) return false
  return true
}

const authTenantSelect = {
  active: true,
  deletedAt: true,
} as const

const authMashgiachSelect = {
  active: true,
  rabbanutId: true,
} as const

export const usersRepo = {
  async findAll(filter?: { role?: Role }): Promise<User[]> {
    const rows = await prisma.user.findMany({
      where: filter?.role ? { role: filter.role } : undefined,
    })
    return rows.map(toUser)
  },

  async findPage(filter: { role?: Role; limit: number; cursor?: string }): Promise<PageResult<User>> {
    const rows = await prisma.user.findMany({
      where: filter.role ? { role: filter.role } : undefined,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    })
    const hasMore = rows.length > filter.limit
    const page    = hasMore ? rows.slice(0, filter.limit) : rows
    return { items: page.map(toUser), nextCursor: hasMore ? page[page.length - 1].id : null }
  },

  async findById(id: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { id } })
    return u ? toUser(u) : null
  },

  async findByEmail(email: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    return u ? toUser(u) : null
  },

  /**
   * Authentication lookups deliberately include the current tenant state.
   * Non-owner accounts must belong to a live, active rabbanut; otherwise both
   * fresh login and already-issued JWTs are rejected.
   */
  async findAuthById(id: string): Promise<User | null> {
    const u = await prisma.user.findUnique({
      where: { id },
      include: {
        rabbanut: { select: authTenantSelect },
        mashgiach: { select: authMashgiachSelect },
      },
    })
    return u && hasActiveTenant(u) ? toUser(u) : null
  },

  async findAuthByEmail(email: string): Promise<User | null> {
    const u = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        rabbanut: { select: authTenantSelect },
        mashgiach: { select: authMashgiachSelect },
      },
    })
    return u && hasActiveTenant(u) ? toUser(u) : null
  },

  verifyPassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash)
  },

  async validateTenantAssignment(input: {
    role: Role
    rabbanutId?: string
    mashgiachId?: string
  }): Promise<boolean> {
    if (input.role === 'owner') return !input.rabbanutId && !input.mashgiachId
    if (!input.rabbanutId) return false

    const rabbanut = await prisma.rabbanut.findFirst({
      where: { id: input.rabbanutId, active: true, deletedAt: null },
      select: { id: true },
    })
    if (!rabbanut) return false
    if (input.role === 'rabbanut') return !input.mashgiachId
    if (!input.mashgiachId) return false

    const mashgiach = await prisma.mashgiach.findFirst({
      where: {
        id: input.mashgiachId,
        rabbanutId: input.rabbanutId,
        active: true,
      },
      select: { id: true },
    })
    return Boolean(mashgiach)
  },

  async create(input: { name: string; email: string; password: string; role: Role; rabbanutId?: string; mashgiachId?: string }): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 12)
    const u = await prisma.user.create({
      data: {
        name:         input.name,
        email:        input.email.toLowerCase(),
        passwordHash,
        role:         input.role,
        rabbanutId:   input.rabbanutId,
        mashgiachId:  input.mashgiachId,
      },
    })
    return toUser(u)
  },

  /**
   * Applies `patch` only if the row still has the role/tenant links in
   * `expected` (what the caller validated against), so two concurrent PATCHes
   * cannot combine into a state nobody validated; throws UserChangedError
   * otherwise. A change of role, rabbanutId or mashgiachId bumps
   * sessionVersion, so tokens from before it stay dead even if the change is
   * later reverted (A -> B -> A).
   */
  async update(id: string, patch: UserPatch, expected: UserAuthState): Promise<User | null> {
    // Explicit whitelist: nothing else from a caller-supplied object is written.
    const data: Prisma.UserUncheckedUpdateInput = {}
    if (patch.name  !== undefined) data.name  = patch.name
    if (patch.email !== undefined) data.email = patch.email
    if (patch.role  !== undefined) data.role  = patch.role
    // undefined keeps the stored link; null writes NULL (clears it).
    if (patch.rabbanutId  !== undefined) data.rabbanutId  = patch.rabbanutId
    if (patch.mashgiachId !== undefined) data.mashgiachId = patch.mashgiachId

    const authChanged =
      (patch.role        !== undefined && patch.role        !== expected.role) ||
      (patch.rabbanutId  !== undefined && patch.rabbanutId  !== expected.rabbanutId) ||
      (patch.mashgiachId !== undefined && patch.mashgiachId !== expected.mashgiachId)
    if (authChanged) data.sessionVersion = { increment: 1 }

    try {
      const u = await prisma.user.update({
        where: {
          id,
          role:       expected.role,
          rabbanutId: expected.rabbanutId,
          // A unique field only takes a plain string at the top level of a
          // unique where; the IS NULL filter has to go through AND.
          AND: [{ mashgiachId: expected.mashgiachId }],
        },
        data,
      })
      return toUser(u)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        const stillThere = await prisma.user.findUnique({ where: { id }, select: { id: true } })
        if (stillThere) throw new UserChangedError()
        return null
      }
      throw e
    }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({ where: { id } })
      return true
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return false
      throw e
    }
  },

  async setTwoFactorSecret(id: string, secret: string): Promise<User | null> {
    try {
      return await prisma.$transaction(async tx => {
        const current = await tx.user.findUnique({ where: { id } })
        if (!current || current.twoFactorEnabled) return null
        const updated = await tx.user.update({
          where: { id },
          // A new secret starts a new code sequence: forget the old one's step.
          data: { twoFactorSecret: encrypt(secret), twoFactorBackupCodes: [], twoFactorLastStep: null },
        })
        return toUser(updated)
      }, { isolationLevel: 'Serializable' })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return null
      throw e
    }
  },

  async enableTwoFactor(id: string, expectedSecret: string, hashedCodes: string[]): Promise<User | null> {
    try {
      return await prisma.$transaction(async tx => {
        const current = await tx.user.findUnique({ where: { id } })
        if (!current || current.twoFactorEnabled || !current.twoFactorSecret) return null
        const storedSecret = decrypt(current.twoFactorSecret) ?? current.twoFactorSecret
        if (storedSecret !== expectedSecret) return null

        const updated = await tx.user.update({
          where: { id },
          data: {
            twoFactorEnabled: true,
            twoFactorBackupCodes: hashedCodes,
            sessionVersion: { increment: 1 },
          },
        })
        return toUser(updated)
      }, { isolationLevel: 'Serializable' })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') return null
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async disableTwoFactor(id: string): Promise<User | null> {
    try {
      const u = await prisma.user.update({
        where: { id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorBackupCodes: [],
          sessionVersion: { increment: 1 },
        },
      })
      return toUser(u)
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return null
      throw e
    }
  },

  async revokeSessions(id: string): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: { id },
      data: { sessionVersion: { increment: 1 } },
    })
    return result.count === 1
  },

  async consumeBackupCode(id: string, currentCodes: string[], remainingCodes: string[]): Promise<boolean> {
    const result = await prisma.user.updateMany({
      where: {
        id,
        twoFactorBackupCodes: { equals: currentCodes },
      },
      data: { twoFactorBackupCodes: remainingCodes },
    })
    return result.count === 1
  },
}
