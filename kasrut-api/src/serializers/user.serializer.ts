import type { User } from '../models/types'

// Strip passwordHash from all user responses
export const serializeUser = (u: User) => ({
  id:               u.id,
  name:             u.name,
  email:            u.email,
  role:             u.role,
  twoFactorEnabled: u.twoFactorEnabled,
  ...(u.rabbanutId ? { rabbanutId: u.rabbanutId } : {}),
})

export const serializeUsers = (us: User[]) => us.map(serializeUser)
