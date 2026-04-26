import { baseApi } from './baseApi'
import type {
  MapAuthConfig,
  MapAuthProvider,
  MapAuthResponse,
  PasswordResetChannel,
  PasswordResetRequestResponse,
  MapReview,
  MapReviewsPayload,
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
      }),
      invalidatesTags: ['MapAuth'],
    }),
    registerWithPassword: build.mutation<MapAuthResponse, RegisterPayload>({
      query: (body) => ({
        url: '/map-auth/register',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MapAuth'],
    }),
    loginWithPassword: build.mutation<MapAuthResponse, PasswordLoginPayload>({
      query: (body) => ({
        url: '/map-auth/login',
        method: 'POST',
        body,
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
      }),
      invalidatesTags: ['MapAuth'],
    }),
    getMapMe: build.query<MapUser, void>({
      query: () => '/map-auth/me',
      providesTags: ['MapAuth'],
    }),
    getRestaurantReviews: build.query<MapReviewsPayload, string>({
      query: (restaurantId) => `/map/restaurants/${restaurantId}/reviews`,
      providesTags: (_result, _error, restaurantId) => [{ type: 'Review', id: restaurantId }],
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
  useGetMapMeQuery,
  useGetRestaurantReviewsQuery,
  useSubmitRestaurantReviewMutation,
  useSubmitSuggestionMutation,
} = mapCommunityApi
