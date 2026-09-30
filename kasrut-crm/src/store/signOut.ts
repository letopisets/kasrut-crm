import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'
import type { AuthState } from './authSlice'
import { authApi } from './api/authApi'
import { clearPersistedAuth, logout } from './authSlice'

type SignOutThunk = ThunkAction<Promise<boolean>, { auth: Pick<AuthState, 'user'> }, unknown, UnknownAction>

/**
 * Signs out on the API first, then locally. The session's real credential is
 * the httpOnly refresh cookie, which only the API can revoke: a sign-out that
 * only cleared local state would leave it usable in this browser for up to
 * REFRESH_TOKEN_TTL_DAYS. The call carries the access token when there is one
 * (an expired one is renewed first by the base query) and the cookie alone
 * otherwise.
 *
 * Resolves to true once signed out. A 401 after which the base query has
 * already signed the session out means the API refused the refresh cookie as
 * well, so nothing is left to end. Any other failure (network, 5xx, 429, or a
 * renewal that could not reach the API) resolves to false and keeps the
 * session, so the user is not shown the login page over a session that is
 * still alive.
 */
export function signOut(): SignOutThunk {
  return async (dispatch, getState) => {
    let ended = true
    try {
      await dispatch(authApi.endpoints.logout.initiate()).unwrap()
    } catch (err) {
      const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined
      ended = status === 401 && getState().auth.user === null
    }
    if (!ended) return false
    dispatch(logout())
    clearPersistedAuth()
    return true
  }
}
