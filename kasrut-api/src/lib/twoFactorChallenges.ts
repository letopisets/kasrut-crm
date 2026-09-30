import { prisma } from './prisma'
import { logger } from './logger'

/**
 * Single use for the second sign-in factor, kept in Postgres.
 *
 * Both checks used to depend on Redis (a SET NX key) and failed closed, so
 * with owner 2FA mandatory a Redis outage stopped every CRM sign-in. Postgres
 * is needed for any sign-in anyway, so keeping them there adds no dependency.
 */

export type TwoFactorChallengeConsumeResult = 'consumed' | 'already_used' | 'unavailable'

/**
 * Atomically consumes a successful pre-2FA challenge (the jti of a 2fa-pending
 * token), so two concurrent valid factor submissions for one password step
 * cannot both mint sessions. The row lives until the pending token itself
 * expires; lib/tokenPurge.ts removes it after that.
 */
export async function consumeTwoFactorChallenge(
  jti: string,
  ttlSeconds: number,
): Promise<TwoFactorChallengeConsumeResult> {
  if (!jti || ttlSeconds <= 0) return 'already_used'

  try {
    const { count } = await prisma.twoFactorChallenge.createMany({
      data: [{ jti, expiresAt: new Date(Date.now() + ttlSeconds * 1000) }],
      skipDuplicates: true,
    })
    return count === 1 ? 'consumed' : 'already_used'
  } catch (err) {
    logger.warn({ err }, '[twoFactorChallenges] challenge store unavailable, refusing to consume challenge')
    return 'unavailable'
  }
}

/**
 * Records `step` as the account's last accepted TOTP time step. True only
 * when it is later than every step accepted before (RFC 6238 section 5.2): a
 * code that already signed someone in, enabled or disabled 2FA is refused for
 * the rest of its window, whichever pending token it arrives with.
 */
export async function claimTotpTimeStep(userId: string, step: number): Promise<boolean> {
  const { count } = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ twoFactorLastStep: null }, { twoFactorLastStep: { lt: step } }],
    },
    data: { twoFactorLastStep: step },
  })
  return count === 1
}
