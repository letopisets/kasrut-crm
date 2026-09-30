import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { refreshTokensRepo } from '../db/refreshTokens.repo'
import { prisma } from './prisma'

// Expired map links stay one extra day, so someone who reopens yesterday's
// verification mail still hears "already verified" rather than "invalid"
// (consumeEmailVerificationToken answers from the row). Refresh tokens go as
// soon as they expire: used and revoked rows are kept only until then, for
// reuse detection. A consumed 2FA challenge only matters while its pending
// token could still be presented, so it goes once that token has expired.
export const MAP_TOKEN_PURGE_GRACE_MS = 24 * 60 * 60 * 1000

export type PurgedTable =
  | 'refresh_tokens'
  | 'map_email_verification_tokens'
  | 'map_password_reset_tokens'
  | 'two_factor_challenges'

export interface TokenPurgeResult {
  deleted: Partial<Record<PurgedTable, number>>
  /** A purge that failed, with its error; the others still ran. */
  failed:  Partial<Record<'refresh_tokens' | 'map_tokens' | 'two_factor_challenges', unknown>>
}

/** Deletes expired refresh tokens, 2FA challenges and map email/password links. */
export async function purgeExpiredTokens(now: Date = new Date()): Promise<TokenPurgeResult> {
  const mapCutoff = new Date(now.getTime() - MAP_TOKEN_PURGE_GRACE_MS)
  const [refresh, map, challenges] = await Promise.allSettled([
    refreshTokensRepo.purgeExpired(now),
    mapCommunityRepo.purgeExpiredMapTokens(mapCutoff),
    prisma.twoFactorChallenge.deleteMany({ where: { expiresAt: { lte: now } } }),
  ])

  const result: TokenPurgeResult = { deleted: {}, failed: {} }
  if (refresh.status === 'fulfilled') result.deleted.refresh_tokens = refresh.value
  else result.failed.refresh_tokens = refresh.reason
  if (map.status === 'fulfilled') {
    result.deleted.map_email_verification_tokens = map.value.emailVerification
    result.deleted.map_password_reset_tokens = map.value.passwordReset
  } else {
    result.failed.map_tokens = map.reason
  }
  if (challenges.status === 'fulfilled') result.deleted.two_factor_challenges = challenges.value.count
  else result.failed.two_factor_challenges = challenges.reason
  return result
}
