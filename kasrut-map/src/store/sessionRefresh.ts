import type { Dispatch } from '@reduxjs/toolkit'
import type { MapAuthResponse } from '@/types'
import { clearCredentials, sessionUnavailable, setCredentials } from './mapAuthSlice'

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
const REFRESH_LOCK = 'kashrut-map-refresh'

type RefreshResult =
  | { kind: 'session'; session: MapAuthResponse }
  | { kind: 'rejected' }      // no cookie, or the API refused it
  | { kind: 'unavailable' }   // offline, rate limited or a server error

function isAuthResponse(value: unknown): value is MapAuthResponse {
  if (typeof value !== 'object' || value === null) return false
  const { user, token } = value as { user?: unknown; token?: unknown }
  return typeof token === 'string' && token.length > 0 && typeof user === 'object' && user !== null
}

async function requestRefresh(): Promise<RefreshResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/map-auth/refresh`, {
      method:      'POST',
      credentials: 'include',
      headers:     REQUESTED_WITH_HEADERS,
    })
    if (res.status === 401 || res.status === 403) return { kind: 'rejected' }
    if (!res.ok) return { kind: 'unavailable' }
    const body: unknown = await res.json()
    return isAuthResponse(body) ? { kind: 'session', session: body } : { kind: 'unavailable' }
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
 * callers share one request. Resolves to the new token, or to null after
 * signing the visitor out: for good when the API refused the cookie, for this
 * page load only when it could not be reached.
 */
export function refreshMapSession(dispatch: Dispatch): Promise<string | null> {
  inFlight ??= lockedRefresh()
    .then(result => {
      if (result.kind === 'session') {
        dispatch(setCredentials({ user: result.session.user, token: result.session.token }))
        return result.session.token
      }
      dispatch(result.kind === 'rejected' ? clearCredentials() : sessionUnavailable())
      return null
    })
    .finally(() => { inFlight = null })
  return inFlight
}
