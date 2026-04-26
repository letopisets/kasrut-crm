import { env } from '../config/env'
import type { MapAuthProvider } from '../models/types'

type JoseModule = Pick<typeof import('jose'), 'createRemoteJWKSet' | 'jwtVerify'>
type RemoteJWKSet = ReturnType<JoseModule['createRemoteJWKSet']>

const importJose = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<JoseModule>
let josePromise: Promise<JoseModule> | null = null
const jwksCache: Partial<Record<MapAuthProvider, RemoteJWKSet>> = {}

export interface OAuthProfile {
  provider: MapAuthProvider
  providerUserId: string
  email: string
  name: string
  avatarUrl?: string
}

export class OAuthConfigError extends Error {}
export class OAuthTokenError extends Error {}

function loadJose(): Promise<JoseModule> {
  josePromise ??= importJose('jose')
  return josePromise
}

function getClientId(provider: MapAuthProvider): string {
  return provider === 'google' ? env.GOOGLE_CLIENT_ID : env.APPLE_CLIENT_ID
}

function getIssuer(provider: MapAuthProvider): string | string[] {
  return provider === 'google'
    ? ['https://accounts.google.com', 'accounts.google.com']
    : 'https://appleid.apple.com'
}

function getJwksUrl(provider: MapAuthProvider): string {
  return provider === 'google'
    ? 'https://www.googleapis.com/oauth2/v3/certs'
    : 'https://appleid.apple.com/auth/keys'
}

async function getJwks(provider: MapAuthProvider): Promise<RemoteJWKSet> {
  if (jwksCache[provider]) return jwksCache[provider]!
  const jose = await loadJose()
  const jwks = jose.createRemoteJWKSet(new URL(getJwksUrl(provider)))
  jwksCache[provider] = jwks
  return jwks
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function verifyOAuthIdToken(provider: MapAuthProvider, idToken: string): Promise<OAuthProfile> {
  const clientId = getClientId(provider)
  if (!clientId) {
    throw new OAuthConfigError(`${provider} OAuth is not configured`)
  }

  try {
    const jose = await loadJose()
    const { payload } = await jose.jwtVerify(idToken, await getJwks(provider), {
      audience: clientId,
      issuer: getIssuer(provider),
    })

    const providerUserId = stringClaim(payload.sub)
    const email = stringClaim(payload.email)
    if (!providerUserId || !email) {
      throw new OAuthTokenError('OAuth token does not contain required user claims')
    }

    const name = stringClaim(payload.name) ?? email.split('@')[0]
    const avatarUrl = provider === 'google' ? stringClaim(payload.picture) : undefined

    return { provider, providerUserId, email, name, avatarUrl }
  } catch (e) {
    if (e instanceof OAuthConfigError || e instanceof OAuthTokenError) throw e
    throw new OAuthTokenError('Invalid OAuth token')
  }
}

export function getEnabledMapAuthProviders() {
  return [
    { provider: 'google' as const, enabled: Boolean(env.GOOGLE_CLIENT_ID), clientId: env.GOOGLE_CLIENT_ID || null },
    { provider: 'apple' as const, enabled: Boolean(env.APPLE_CLIENT_ID), clientId: env.APPLE_CLIENT_ID || null },
  ]
}
