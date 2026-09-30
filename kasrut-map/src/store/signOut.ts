import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'
import type { MapUser } from '@/types'
import { mapCommunityApi } from './api/mapCommunityApi'
import { clearCredentials } from './mapAuthSlice'

type SignOutThunk = ThunkAction<
  Promise<boolean>,
  { mapAuth: { user: MapUser | null; token: string | null } },
  unknown,
  UnknownAction
>

/**
 * Signs the visitor out on the API first, then locally. The session's real
 * credential is the httpOnly refresh cookie, which only the API can revoke: a
 * sign-out that only cleared local state would leave it usable in this
 * browser for up to REFRESH_TOKEN_TTL_DAYS. The call carries the access token
 * when there is one (an expired one is renewed first by the base query) and
 * the cookie alone otherwise. When the access token is refused and cannot be
 * renewed, the base query has dropped it, so a second call goes with the
 * cookie alone, which is all the API needs.
 *
 * Resolves to true once signed out; to false when the API could not be
 * reached, and then the stored sign-in is kept (the cookie may still be
 * good).
 */
export function signOutMap(): SignOutThunk {
  return async (dispatch, getState) => {
    const logout = () => dispatch(mapCommunityApi.endpoints.logoutMap.initiate()).unwrap()
    let ended = true
    try {
      await logout()
    } catch (err) {
      const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : undefined
      ended = false
      if (status === 401 && getState().mapAuth.token === null) {
        try {
          await logout()
          ended = true
        } catch { /* ended stays false */ }
      }
    }
    if (ended) dispatch(clearCredentials())
    return ended
  }
}
