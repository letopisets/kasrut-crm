import type { Middleware } from '@reduxjs/toolkit'
import type { User } from '@/types'
import { baseApi } from './api/baseApi'

// Who the API scopes data to. twoFactorEnabled/name/email changes (2FA
// enable/disable re-dispatch setUser for the same account) keep the cache.
function sessionKey(user: User | null | undefined): string {
  if (!user) return ''
  return [user.id, user.role, user.rabbanutId ?? '', user.mashgiachId ?? ''].join('|')
}

// The API filters rabbanuts, hechsherim, restaurants… per tenant, but RTK
// Query keys its cache only by endpoint + args. Without a reset, a tenant user
// who signs in right after an owner in the same tab would be served the
// owner's cached all-tenant lists until they expire. Watching the auth state
// here covers every sign-in/sign-out path (login, 2FA, logout, 401 auto-logout).
export const resetApiOnSessionChange: Middleware<object, { auth: { user: User | null } }> =
  (store) => (next) => (action) => {
    const before = sessionKey(store.getState().auth.user)
    const result = next(action)
    if (sessionKey(store.getState().auth.user) !== before) {
      store.dispatch(baseApi.util.resetApiState())
    }
    return result
  }
