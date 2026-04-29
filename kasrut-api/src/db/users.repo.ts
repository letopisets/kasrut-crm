import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { encrypt, decrypt } from '../lib/crypto'
import type { User, Role } from '../models/types'
import type { User as PrismaUser } from '../generated/prisma/client'

// Cast extended until `prisma generate` picks up the new twoFactorBackupCodes column
type PrismaUserExtended = PrismaUser & { twoFactorBackupCodes?: string[] }

function toUser(u: PrismaUserExtended): User {
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
    ...(u.rabbanutId    ? { rabbanutId: u.rabbanutId } : {}),
    ...(twoFactorSecret ? { twoFactorSecret }          : {}),
  }
}

export const usersRepo = {
  async findAll(filter?: { role?: Role }): Promise<User[]> {
    const rows = await prisma.user.findMany({
      where: filter?.role ? { role: filter.role } : undefined,
    })
    return rows.map(toUser)
  },

  async findById(id: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { id } })
    return u ? toUser(u) : null
  },

  async findByEmail(email: string): Promise<User | null> {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    return u ? toUser(u) : null
  },

  verifyPassword(user: User, password: string): boolean {
    return bcrypt.compareSync(password, user.passwordHash)
  },

  async create(input: { name: string; email: string; password: string; role: Role; rabbanutId?: string }): Promise<User> {
    const u = await prisma.user.create({
      data: {
        name:         input.name,
        email:        input.email.toLowerCase(),
        passwordHash: bcrypt.hashSync(input.password, 12),
        role:         input.role,
        rabbanutId:   input.rabbanutId,
      },
    })
    return toUser(u)
  },

  async update(id: string, patch: Partial<Omit<User, 'id' | 'passwordHash'>>): Promise<User | null> {
    try {
      const u = await prisma.user.update({ where: { id }, data: patch })
      return toUser(u)
    } catch { return null }
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({ where: { id } })
      return true
    } catch { return false }
  },

  async setTwoFactorSecret(id: string, secret: string): Promise<User | null> {
    try {
      const u = await prisma.user.update({ where: { id }, data: { twoFactorSecret: encrypt(secret), twoFactorEnabled: false } })
      return toUser(u)
    } catch { return null }
  },

  async enableTwoFactor(id: string): Promise<User | null> {
    try {
      const u = await prisma.user.update({ where: { id }, data: { twoFactorEnabled: true } })
      return toUser(u)
    } catch { return null }
  },

  async disableTwoFactor(id: string): Promise<User | null> {
    try {
      const u = await prisma.user.update({
        where: { id },
        data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackupCodes: [] },
      })
      return toUser(u as PrismaUserExtended)
    } catch { return null }
  },

  async setBackupCodes(id: string, hashedCodes: string[]): Promise<void> {
    await (prisma.user as unknown as { update: (args: object) => Promise<unknown> }).update({
      where: { id },
      data: { twoFactorBackupCodes: hashedCodes },
    })
  },

  async consumeBackupCode(id: string, remainingCodes: string[]): Promise<void> {
    await (prisma.user as unknown as { update: (args: object) => Promise<unknown> }).update({
      where: { id },
      data: { twoFactorBackupCodes: remainingCodes },
    })
  },
}
