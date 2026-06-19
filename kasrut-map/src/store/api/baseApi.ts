import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import type { RootState } from '../index'
import { clearCredentials } from '../mapAuthSlice'

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).mapAuth?.token
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return headers
  },
})

function isPublicAuthRequest(args: string | FetchArgs): boolean {
  const url = typeof args === 'string' ? args : args.url
  return url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/oauth') ||
    url.includes('/auth/password-reset')
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, api, extraOptions)
  if (result.error?.status === 401 && !isPublicAuthRequest(args)) {
    api.dispatch(clearCredentials())
  }
  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Restaurant', 'MapOptions', 'Hechsher', 'Review', 'Suggestion', 'MapAuth'],
  endpoints: () => ({}),
})
