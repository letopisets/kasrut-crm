import bcrypt from 'bcryptjs'

// Cost-12 bcrypt hash (the cost CRM and map password hashes use) of a random
// value nobody knows. A sign-in for an account that has no password to check
// (unknown email, OAuth-only map account) is compared against it, so it costs
// the same bcrypt time as a wrong password and timing does not reveal whether
// the account exists.
export const DUMMY_PASSWORD_HASH = '$2a$12$SBGhhsdUS6dBzLBMkbeAoe/XTRFdGsPXPwjWthtpqJzxYnGVcbN22'

/** Spends one bcrypt compare against DUMMY_PASSWORD_HASH; always false. */
export async function dummyPasswordCompare(password: string): Promise<false> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
  return false
}
