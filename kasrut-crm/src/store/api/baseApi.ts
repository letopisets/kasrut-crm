import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { RootState } from '../index'
import { clearPersistedAuth, logout as logoutAction, setTwoFactorSetupRequired } from '../authSlice'
import { API_BASE_URL, refreshSession } from '../sessionRefresh'
import { isTwoFactorSetupRequiredError } from '@/lib/twoFactorErrors'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

// Calls whose 401 means wrong credentials or no session at all, never an
// expired access token, so a refresh cannot help.
const NO_REFRESH_PATHS = new Set(['/auth/login', '/auth/2fa/verify', '/auth/2fa/verify-backup', '/auth/refresh'])

function requestPath(args: string | FetchArgs): string {
  const url = typeof args === 'string' ? args : args.url
  return url.split('?')[0]
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const auth = () => (api.getState() as RootState).auth
  const sentWith = auth().token
  let result   = await rawBaseQuery(args, api, extraOptions)
  let usedWith = sentWith

  // An expired access token: renew it once and retry. Concurrent 401s share
  // one refresh; a token that replaced ours meanwhile (another refresh, or
  // enabling/disabling 2FA) is used as it is.
  if (result.error?.status === 401 && auth().user && !NO_REFRESH_PATHS.has(requestPath(args))) {
    const current   = auth().token
    const retryWith = current && current !== sentWith ? current : await refreshSession(api.dispatch)
    if (retryWith) {
      usedWith = retryWith
      result   = await rawBaseQuery(args, api, extraOptions)
      // Refused even with a fresh token: the session is gone.
      if (result.error?.status === 401 && auth().token === retryWith) {
        api.dispatch(logoutAction())
        clearPersistedAuth()
      }
    }
  }
  // The session is confined to 2FA setup: switch to the forced setup screen.
  // An answer to a token that has since been replaced says nothing about it.
  if (usedWith && auth().token === usedWith && isTwoFactorSetupRequiredError(result.error)) {
    api.dispatch(setTwoFactorSetupRequired(true))
  }

  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Restaurant', 'Inspection', 'Mashgiach', 'Hechsher', 'Rabbanut', 'Document', 'User', 'Suggestion', 'ServiceLog', 'KashrutLevel', 'EstablishmentCategory'],
  endpoints: () => ({}),
})
