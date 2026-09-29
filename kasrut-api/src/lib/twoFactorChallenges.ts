import { redis } from './redis'

const PREFIX = '2fa:challenge:used:'

export type TwoFactorChallengeConsumeResult = 'consumed' | 'already_used' | 'unavailable'

/**
 * Atomically consume a successful pre-2FA challenge.
 *
 * Redis SET NX ensures that two concurrent valid factor submissions cannot
 * both mint sessions. Unlike best-effort rate limiting, this security check
 * fails closed when Redis is unavailable.
 */
export async function consumeTwoFactorChallenge(
  jti: string,
  ttlSeconds: number,
): Promise<TwoFactorChallengeConsumeResult> {
  if (!jti || ttlSeconds <= 0) return 'already_used'

  try {
    const result = await redis.set(`${PREFIX}${jti}`, '1', 'EX', ttlSeconds, 'NX')
    return result === 'OK' ? 'consumed' : 'already_used'
  } catch {
    console.warn('[twoFactorChallenges] Redis unavailable, refusing to consume challenge')
    return 'unavailable'
  }
}
