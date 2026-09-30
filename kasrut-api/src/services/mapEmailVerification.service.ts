import { createHash, randomBytes } from 'crypto'
import type { Request } from 'express'
import { env } from '../config/env'
import { sendMapEmailVerification } from '../lib/mailer'
import { logger } from '../lib/logger'
import { clientAddressBucket, consumeRateLimit, type RateLimitResult } from '../middleware/rateLimit'

const HOUR_MS = 60 * 60 * 1000
const VERIFICATION_TOKEN_TTL_MS = 24 * HOUR_MS

// Every verification email draws from both budgets, whether registration or a
// resend sends it. Registration alone would otherwise mail any inbox as fast
// as the sign-up limit allows: throwaway accounts for victim+1@…, victim+2@…
// each get a fresh per-account resend budget.
const MAIL_PER_CLIENT  = { keyPrefix: 'map-verify-mail', windowMs: HOUR_MS, max: 10 }
const MAIL_PER_MAILBOX = { keyPrefix: 'map-verify-mailbox', windowMs: 24 * HOUR_MS, max: 5 }

type VerificationConfig = Pick<typeof env,
  'NODE_ENV' | 'SMTP_CONFIGURED' | 'MAP_EMAIL_VERIFICATION' | 'MAP_EMAIL_VERIFICATION_DEFAULTED_OFF'>

/** The warning to log at startup for this configuration, if any. */
export function emailVerificationStartupWarning(config: VerificationConfig): string | null {
  if (config.NODE_ENV !== 'production') return null
  if (config.MAP_EMAIL_VERIFICATION_DEFAULTED_OFF) {
    return 'SMTP_HOST is not set: map email verification is off, so unverified map users can post reviews and suggestions. Configure SMTP_* to turn it on'
  }
  if (config.MAP_EMAIL_VERIFICATION === 'required' && !config.SMTP_CONFIGURED) {
    return 'MAP_EMAIL_VERIFICATION=required but SMTP_HOST is not set: verification emails cannot be delivered, so new map users cannot post reviews or suggestions'
  }
  return null
}

const startupWarning = emailVerificationStartupWarning(env)
if (startupWarning) logger.warn(startupWarning)

/** Whether reviews and suggestions need a verified email (read per request). */
export function isEmailVerificationRequired(): boolean {
  return env.MAP_EMAIL_VERIFICATION === 'required'
}

// Links are sent whenever someone could follow them: with verification on, or
// with a mail server while it is off (users can then verify ahead of time).
// Off without SMTP_HOST, nothing is issued; resend covers those accounts once
// a mail server is configured.
export function isVerificationMailEnabled(): boolean {
  return isEmailVerificationRequired() || env.SMTP_CONFIGURED
}

export interface EmailVerificationToken {
  /** Goes into the emailed link only; never stored or logged. */
  token: string
  tokenHash: string
  expiresAt: Date
}

export function hashEmailVerificationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newEmailVerificationToken(): EmailVerificationToken {
  const token = randomBytes(32).toString('base64url')
  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  }
}

export function emailVerificationLink(token: string): string {
  return `${env.MAP_PUBLIC_URL}/?verifyEmail=${encodeURIComponent(token)}`
}

/**
 * The inbox an address delivers to, for the per-mailbox budget: the +tag is
 * dropped, and for Gmail the dots too. Hashed, so rate-limit keys never hold
 * an email address.
 */
export function mailboxKey(email: string): string {
  const at = email.lastIndexOf('@')
  let local = email.slice(0, at).trim().toLowerCase().split('+')[0]
  let domain = email.slice(at + 1).trim().toLowerCase()
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return createHash('sha256').update(`${local}@${domain}`).digest('hex')
}

/**
 * Takes one verification email from the client address's budget and the
 * recipient mailbox's budget. Not allowed: send nothing.
 */
export async function reserveVerificationMail(req: Request, email: string): Promise<RateLimitResult> {
  const client = await consumeRateLimit(MAIL_PER_CLIENT, clientAddressBucket(req))
  if (!client.allowed) return client
  return consumeRateLimit(MAIL_PER_MAILBOX, mailboxKey(email))
}

/**
 * Emails the verification link without holding up the response. Delivery
 * failures are logged with the account id, never with the token or the link.
 */
export function deliverEmailVerification(user: { id: string; email: string }, token: string): void {
  void sendMapEmailVerification({
    recipientEmail: user.email,
    link: emailVerificationLink(token),
  }).catch(err => {
    logger.error({ err, mapUserId: user.id }, 'Map email verification delivery failed')
  })
}
