import { baseApi } from './baseApi'
import type { MapSuggestion, SuggestionStatus } from '@/types'

export const suggestionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSuggestions: build.query<MapSuggestion[], SuggestionStatus | 'all' | void>({
      query: (status) => `/map/suggestions${status && status !== 'all' ? `?status=${status}` : ''}`,
      providesTags: ['Suggestion'],
    }),
    reviewSuggestion: build.mutation<MapSuggestion, { id: string; status: 'approved' | 'rejected'; reviewerNote?: string }>({
      query: ({ id, ...body }) => ({ url: `/map/suggestions/${id}/review`, method: 'POST', body }),
      invalidatesTags: ['Suggestion'],
    }),
  }),
})

export const { useGetSuggestionsQuery, useReviewSuggestionMutation } = suggestionsApi
