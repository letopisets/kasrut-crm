import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { refreshTokensRepo } from '../db/refreshTokens.repo'

// Expired map links stay one extra day, so someone who reopens yesterday's
// verification mail still hears "already verified" rather than "invalid"
// (consumeEmailVerificationToken answers from the row). Refresh tokens go as
// soon as they expire: used and revoked rows are kept only until then, for
// reuse detection.
export const MAP_TOKEN_PURGE_GRACE_MS = 24 * 60 * 60 * 1000

export type PurgedTable = 'refresh_tokens' | 'map_email_verification_tokens' | 'map_password_reset_tokens'

export interface TokenPurgeResult {
  deleted: Partial<Record<PurgedTable, number>>
  /** A purge that failed, with its error; the other one still ran. */
  failed:  Partial<Record<'refresh_tokens' | 'map_tokens', unknown>>
}

/** Deletes expired refresh tokens and expired map email/password links. */
export async function purgeExpiredTokens(now: Date = new Date()): Promise<TokenPurgeResult> {
  const mapCutoff = new Date(now.getTime() - MAP_TOKEN_PURGE_GRACE_MS)
  const [refresh, map] = await Promise.allSettled([
    refreshTokensRepo.purgeExpired(now),
    mapCommunityRepo.purgeExpiredMapTokens(mapCutoff),
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
  return result
}
