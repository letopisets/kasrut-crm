import { env } from '../config/env'
import type { Role, User } from '../models/types'

/**
 * REQUIRE_OWNER_2FA: owners are global admins, so their accounts must carry a
 * second factor. While the flag is on an owner cannot switch 2FA off.
 */
export function isTwoFactorRequiredForRole(role: Role): boolean {
  return env.REQUIRE_OWNER_2FA && role === 'owner'
}

/**
 * The policy covers the account but it has not enrolled yet: until it does,
 * authenticateJWT lets it do nothing but finish 2FA setup or sign out.
 */
export function isTwoFactorSetupRequired(user: Pick<User, 'role' | 'twoFactorEnabled'>): boolean {
  return isTwoFactorRequiredForRole(user.role) && !user.twoFactorEnabled
}
