import { baseApi } from './baseApi'
import { REQUESTED_WITH_HEADERS } from '../sessionRefresh'
import type {
  MapAuthConfig,
  MapAuthProvider,
  MapAuthResponse,
  PasswordResetChannel,
  PasswordResetRequestResponse,
  MapReview,
  MapReviewsPayload,
  MapOwnReviewPayload,
  MapSuggestion,
  MapSuggestionPayload,
  MapUser,
} from '@/types'

interface OAuthLoginPayload {
  provider: MapAuthProvider
  idToken: string
}

interface RegisterPayload {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

interface PasswordLoginPayload {
  email: string
  password: string
}

interface PasswordResetRequestPayload {
  channel: PasswordResetChannel
  identifier: string
}

interface PasswordResetConfirmPayload {
  token: string
  password: string
}

interface SubmitReviewPayload {
  restaurantId: string
  rating: number
  text?: string | null
}

// Calls that set or clear the httpOnly refresh cookie. 'include' lets the
// cookie through when the API is on another origin (local dev); in production
// the API is same-origin behind the map host's /api proxy.
const WITH_COOKIE = { credentials: 'include' } as const

export const mapCommunityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMapAuthConfig: build.query<MapAuthConfig, void>({
      query: () => '/map-auth/config',
      providesTags: ['MapAuth'],
    }),
    oauthLogin: build.mutation<MapAuthResponse, OAuthLoginPayload>({
      query: (body) => ({
        url: '/map-auth/oauth',
        method: 'POST',
        body,
        ...WITH_COOKIE,
      }),
      invalidatesTags: ['MapAuth'],
    }),
    registerWithPassword: build.mutation<MapAuthResponse, RegisterPayload>({
      query: (body) => ({
        url: '/map-auth/register',
        method: 'POST',
        body,
        ...WITH_COOKIE,
      }),
      invalidatesTags: ['MapAuth'],
    }),
    loginWithPassword: build.mutation<MapAuthResponse, PasswordLoginPayload>({
      query: (body) => ({
        url: '/map-auth/login',
        method: 'POST',
        body,
        ...WITH_COOKIE,
      }),
      invalidatesTags: ['MapAuth'],
    }),
    requestPasswordReset: build.mutation<PasswordResetRequestResponse, PasswordResetRequestPayload>({
      query: (body) => ({
        url: '/map-auth/password-reset/request',
        method: 'POST',
        body,
      }),
    }),
    confirmPasswordReset: build.mutation<MapAuthResponse, PasswordResetConfirmPayload>({
      query: (body) => ({
        url: '/map-auth/password-reset/confirm',
        method: 'POST',
        body,
        ...WITH_COOKIE,
      }),
      invalidatesTags: ['MapAuth'],
    }),
    // Public: the token from the emailed link is the credential. Refetches
    // /me so a signed-in account shows up verified. alreadyVerified: the link
    // was used before, and the account is verified.
    verifyEmail: build.mutation<{ ok: boolean; alreadyVerified?: boolean }, string>({
      query: (token) => ({
        url: '/map-auth/verify-email',
        method: 'POST',
        body: { token },
      }),
      invalidatesTags: ['MapAuth'],
    }),
    resendEmailVerification: build.mutation<void, void>({
      query: () => ({ url: '/map-auth/verify-email/resend', method: 'POST' }),
    }),
    getMapMe: build.query<MapUser, void>({
      query: () => '/map-auth/me',
      providesTags: ['MapAuth'],
    }),
    logoutMap: build.mutation<void, void>({
      query: () => ({ url: '/map-auth/logout', method: 'POST', ...WITH_COOKIE, headers: REQUESTED_WITH_HEADERS }),
      invalidatesTags: ['MapAuth'],
    }),
    // Cursor-paginated, newest first. Invalidation (e.g. after saving a
    // review) refetches every loaded page from the first one, so the list
    // stays contiguous.
    getRestaurantReviews: build.infiniteQuery<MapReviewsPayload, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
      query: ({ queryArg: restaurantId, pageParam }) => ({
        url: `/map/restaurants/${restaurantId}/reviews`,
        params: pageParam ? { cursor: pageParam } : undefined,
      }),
      providesTags: (_result, _error, restaurantId) => [{ type: 'Review', id: restaurantId }],
    }),
    // userId only keys the cache, so one account never sees another's review
    // after a re-login; the server resolves the user from the token.
    getMyRestaurantReview: build.query<MapOwnReviewPayload, { restaurantId: string; userId: string }>({
      query: ({ restaurantId }) => `/map/restaurants/${restaurantId}/reviews/mine`,
      providesTags: (_result, _error, { restaurantId }) => [{ type: 'Review', id: restaurantId }],
    }),
    submitRestaurantReview: build.mutation<MapReview, SubmitReviewPayload>({
      query: ({ restaurantId, ...body }) => ({
        url: `/map/restaurants/${restaurantId}/reviews`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { restaurantId }) => [{ type: 'Review', id: restaurantId }],
    }),
    submitSuggestion: build.mutation<MapSuggestion, MapSuggestionPayload>({
      query: (body) => ({
        url: '/map/suggestions',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Suggestion'],
    }),
  }),
})

export const {
  useGetMapAuthConfigQuery,
  useOauthLoginMutation,
  useRegisterWithPasswordMutation,
  useLoginWithPasswordMutation,
  useRequestPasswordResetMutation,
  useConfirmPasswordResetMutation,
  useVerifyEmailMutation,
  useResendEmailVerificationMutation,
  useGetMapMeQuery,
  useLogoutMapMutation,
  useGetRestaurantReviewsInfiniteQuery,
  useGetMyRestaurantReviewQuery,
  useSubmitRestaurantReviewMutation,
  useSubmitSuggestionMutation,
} = mapCommunityApi
