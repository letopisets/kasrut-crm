import { baseApi } from './baseApi'
import type { RootState } from '../index'
import { setTwoFactorSetupRequired } from '../authSlice'
import type { User } from '@/types'

// twoFactorSetupRequired: the session is confined to 2FA setup (REQUIRE_OWNER_2FA).
type LoginResponse =
  | { user: User; token: string; requiresTwoFactor?: false; twoFactorSetupRequired?: boolean }
  | { requiresTwoFactor: true; tempToken: string }

export type MeResponse = User & { twoFactorSetupRequired?: boolean }

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<LoginResponse, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),
    getMe: build.query<MeResponse, void>({
      query: () => '/auth/me',
      // Keeps the forced 2FA setup screen in step with the server, e.g. after
      // a reload or once the policy no longer applies. An answer for a token
      // that has since been replaced (2FA just enabled) is ignored.
      async onQueryStarted(_arg, { dispatch, getState, queryFulfilled }) {
        const token = (getState() as RootState).auth.token
        try {
          const { data } = await queryFulfilled
          if ((getState() as RootState).auth.token !== token) return
          dispatch(setTwoFactorSetupRequired(data.twoFactorSetupRequired === true))
        } catch { /* errors are handled by the base query */ }
      },
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),
    verify2fa: build.mutation<{ user: User; token: string }, { tempToken: string; code: string }>({
      query: (body) => ({ url: '/auth/2fa/verify', method: 'POST', body }),
    }),
    setup2fa: build.mutation<{ secret: string; qrDataUrl: string }, { password: string }>({
      query: (body) => ({ url: '/auth/2fa/setup', method: 'POST', body }),
    }),
    enable2fa: build.mutation<{ user: User; token: string; backupCodes: string[] }, { code: string }>({
      query: (body) => ({ url: '/auth/2fa/enable', method: 'POST', body }),
    }),
    disable2fa: build.mutation<{ user: User; token: string }, { code: string }>({
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
