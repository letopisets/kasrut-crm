function hasErrorCode(err: unknown, expectedStatus: number, code: string): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { status, data } = err as { status?: unknown; data?: unknown }
  return status === expectedStatus && typeof data === 'object' && data !== null &&
    (data as { code?: unknown }).code === code
}

// REQUIRE_OWNER_2FA: an owner who has not enrolled in 2FA yet may only finish
// setup or sign out; the API refuses everything else with this 403.
export function isTwoFactorSetupRequiredError(err: unknown): boolean {
  return hasErrorCode(err, 403, 'TWO_FACTOR_SETUP_REQUIRED')
}

// REQUIRE_OWNER_2FA: owners cannot switch 2FA off.
export function isTwoFactorRequiredForRoleError(err: unknown): boolean {
  return hasErrorCode(err, 403, 'TWO_FACTOR_REQUIRED_FOR_ROLE')
}

// POST /auth/2fa/setup re-checks the account password; a wrong one is a 400,
// so it does not read as a dead session.
export function isInvalidPasswordError(err: unknown): boolean {
  return hasErrorCode(err, 400, 'INVALID_PASSWORD')
}
