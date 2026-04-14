import { baseApi } from './baseApi'
import type { User } from '@/types'

type LoginResponse =
  | { user: User; token: string; requiresTwoFactor?: false }
  | { requiresTwoFactor: true; tempToken: string }

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    getMe: build.query<User, void>({
      query: () => '/auth/me',
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
    verify2fa: build.mutation<{ user: User; token: string }, { tempToken: string; code: string }>({
      query: (body) => ({ url: '/auth/2fa/verify', method: 'POST', body }),
    }),
    setup2fa: build.mutation<{ secret: string; qrDataUrl: string }, void>({
      query: () => ({ url: '/auth/2fa/setup', method: 'POST' }),
    }),
    enable2fa: build.mutation<{ user: User }, { code: string }>({
      query: (body) => ({ url: '/auth/2fa/enable', method: 'POST', body }),
    }),
    disable2fa: build.mutation<{ user: User }, { code: string }>({
      query: (body) => ({ url: '/auth/2fa/disable', method: 'POST', body }),
    }),
  }),
})

export const {
  useLoginMutation,
  useGetMeQuery,
  useLogoutMutation,
  useVerify2faMutation,
  useSetup2faMutation,
  useEnable2faMutation,
  useDisable2faMutation,
} = authApi
