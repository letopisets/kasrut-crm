import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { RootState } from '../index'
import { clearPersistedAuth, logout as logoutAction, setTwoFactorSetupRequired } from '../authSlice'
import { isTwoFactorSetupRequiredError } from '@/lib/twoFactorErrors'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

function getRequestUrl(args: string | FetchArgs): string {
  return typeof args === 'string' ? args : args.url
}

function isPublicAuthRequest(args: string | FetchArgs): boolean {
  const url = getRequestUrl(args)
  return url.includes('/auth/login') ||
    url.includes('/auth/2fa/verify') ||
    url.includes('/auth/2fa/verify-backup')
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const token  = (api.getState() as RootState).auth.token
  const result = await rawBaseQuery(args, api, extraOptions)
  // A request sent with a token that has since been replaced (enabling or
  // disabling 2FA issues a new one) says nothing about the current session.
  const sameSession = (api.getState() as RootState).auth.token === token

  if (result.error?.status === 401 && sameSession && !isPublicAuthRequest(args)) {
    api.dispatch(logoutAction())
    clearPersistedAuth()
  }
  // The session is confined to 2FA setup: switch to the forced setup screen.
  if (token && sameSession && isTwoFactorSetupRequiredError(result.error)) {
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
