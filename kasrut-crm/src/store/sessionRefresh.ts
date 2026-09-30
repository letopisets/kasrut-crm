import type { Dispatch } from '@reduxjs/toolkit'
import type { User } from '@/types'
import { clearPersistedAuth, logout, sessionUnavailable, tokenRefreshed } from './authSlice'

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// Sent with the cookie calls (refresh, logout); the API refuses a refresh
// without it. A form on another site cannot send a custom header; pages on
// the API's other origins can, so the API also checks the request's origin.
export const REQUESTED_WITH_HEADERS = { 'X-Requested-With': 'kashrut' } as const

// The tabs of one browser share the refresh cookie. Every refresh replaces
// it, and the API treats a replaced cookie presented again as a copy (it ends
// the session, or every session of the account when the copy is older than a
// minute), so tabs take turns instead of refreshing at the same moment.
// Browsers without Web Locks refresh unguarded.
const REFRESH_LOCK = 'kashrut-crm-refresh'

interface RefreshResponse {
  user:  User
  token: string
  twoFactorSetupRequired?: boolean
}

type RefreshResult =
  | { kind: 'session'; session: RefreshResponse }
  | { kind: 'rejected' }      // no cookie, or the API refused it
  | { kind: 'unavailable' }   // offline, rate limited or a server error

function isRefreshResponse(value: unknown): value is RefreshResponse {
  if (typeof value !== 'object' || value === null) return false
  const { user, token } = value as { user?: unknown; token?: unknown }
  return typeof token === 'string' && token.length > 0 && typeof user === 'object' && user !== null
}

async function requestRefresh(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method:      'POST',
      credentials: 'include',
      headers:     REQUESTED_WITH_HEADERS,
    })
    if (res.status === 401 || res.status === 403) return { kind: 'rejected' }
    if (!res.ok) return { kind: 'unavailable' }
    const body: unknown = await res.json()
    return isRefreshResponse(body) ? { kind: 'session', session: body } : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

async function lockedRefresh(): Promise<RefreshResult> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? await locks.request(REFRESH_LOCK, requestRefresh) : requestRefresh()
}

let inFlight: Promise<string | null> | null = null

/**
 * Trades the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request. Resolves to the new token, or to null: after
 * signing the session out when the API refused the cookie, or leaving it as
 * it is when the API could not be reached (the cookie may still be good).
 */
export function refreshSession(dispatch: Dispatch): Promise<string | null> {
  inFlight ??= lockedRefresh()
    .then(result => {
      if (result.kind === 'session') {
        dispatch(tokenRefreshed({
          user:  result.session.user,
          token: result.session.token,
          twoFactorSetupRequired: result.session.twoFactorSetupRequired === true,
        }))
        return result.session.token
      }
      if (result.kind === 'rejected') {
        dispatch(logout())
        clearPersistedAuth()
      } else {
        dispatch(sessionUnavailable())
      }
      return null
    })
    .finally(() => { inFlight = null })
  return inFlight
}
