import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { RootState } from '../index'
import { clearPersistedAuth, logout as logoutAction } from '../authSlice'

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
  const result = await rawBaseQuery(args, api, extraOptions)

  if (result.error?.status === 401 && !isPublicAuthRequest(args)) {
    api.dispatch(logoutAction())
    clearPersistedAuth()
  }

  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Restaurant', 'Inspection', 'Mashgiach', 'Hechsher', 'Rabbanut', 'Document', 'User', 'Suggestion', 'ServiceLog', 'KashrutLevel'],
  endpoints: () => ({}),
})
