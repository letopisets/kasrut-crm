import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { RootState } from '../index'
import { clearCredentials } from '../mapAuthSlice'
import { API_BASE_URL, refreshMapSession } from '../sessionRefresh'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).mapAuth?.token
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

// Calls whose 401 means wrong credentials or no session at all, never an
// expired access token, so a refresh cannot help.
const NO_REFRESH_PATHS = new Set([
  '/map-auth/config',
  '/map-auth/login',
  '/map-auth/register',
  '/map-auth/oauth',
  '/map-auth/password-reset/request',
  '/map-auth/password-reset/confirm',
  '/map-auth/refresh',
])

function requestPath(args: string | FetchArgs): string {
  const url = typeof args === 'string' ? args : args.url
  return url.split('?')[0]
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const auth = () => (api.getState() as RootState).mapAuth
  const sentWith = auth().token
  let result = await rawBaseQuery(args, api, extraOptions)

  // An expired access token: renew it once and retry. Concurrent 401s share
  // one refresh; a token that replaced ours meanwhile is used as it is.
  if (result.error?.status === 401 && auth().user && !NO_REFRESH_PATHS.has(requestPath(args))) {
    const current   = auth().token
    const retryWith = current && current !== sentWith ? current : await refreshMapSession(api.dispatch)
    if (retryWith) {
      result = await rawBaseQuery(args, api, extraOptions)
      // Refused even with a fresh token: the session is gone.
      if (result.error?.status === 401 && auth().token === retryWith) api.dispatch(clearCredentials())
    }
  }
  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Restaurant', 'MapOptions', 'Hechsher', 'Review', 'Suggestion', 'MapAuth'],
  endpoints: () => ({}),
})
