import { baseApi } from './baseApi'
import type { ModeratedReviewsPage } from '@/types'

export const reviewsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Cursor-paginated, most recently written first; the server scopes a
    // rabbanut to its own establishments. Invalidating 'Review' refetches every
    // loaded page from the first one, so the list stays contiguous after a
    // delete. The arg is never sent: it names the signed-in viewer and scope so
    // each gets a cache entry of its own, and a rabbanut signing in on the same
    // tab is never shown the list cached for the previous user.
    getModerationReviews: build.infiniteQuery<ModeratedReviewsPage, string, string | null>({
      infiniteQueryOptions: {
        initialPageParam: null,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
      query: ({ pageParam }) => ({
        url: '/map/reviews',
        params: pageParam ? { cursor: pageParam } : undefined,
      }),
      providesTags: ['Review'],
    }),
    // Array-form tags also invalidate on failure, so a review someone else
    // already removed (404) drops out of the list too.
    deleteReview: build.mutation<void, string>({
      query: (id) => ({ url: `/map/reviews/${encodeURIComponent(id)}`, method: 'DELETE' }),
      invalidatesTags: ['Review'],
    }),
  }),
})

export const { useGetModerationReviewsInfiniteQuery, useDeleteReviewMutation } = reviewsApi
