import { baseApi } from './baseApi'
import type { Restaurant } from '@/types'

type CreateInput = Omit<Restaurant, 'id' | 'status'>

export const restaurantsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRestaurants: build.query<Restaurant[], { rabbanutId?: string; status?: string } | void>({
      query: (params) => {
        const q = new URLSearchParams()
        if (params?.rabbanutId) q.set('rabbanutId', params.rabbanutId)
        if (params?.status)     q.set('status', params.status)
        return `/restaurants${q.toString() ? `?${q}` : ''}`
      },
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Restaurant' as const, id })), 'Restaurant']
          : ['Restaurant'],
    }),
    getRestaurant: build.query<Restaurant, string>({
      query: (id) => `/restaurants/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Restaurant', id }],
    }),
    createRestaurant: build.mutation<Restaurant, CreateInput>({
      query: (body) => ({ url: '/restaurants', method: 'POST', body }),
      invalidatesTags: ['Restaurant'],
    }),
    updateRestaurant: build.mutation<Restaurant, { id: string; patch: Partial<Restaurant> }>({
      query: ({ id, patch }) => ({ url: `/restaurants/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Restaurant', id }, 'Restaurant'],
    }),
    deleteRestaurant: build.mutation<void, string>({
      query: (id) => ({ url: `/restaurants/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Restaurant'],
    }),
  }),
})

export const {
  useGetRestaurantsQuery,
  useGetRestaurantQuery,
  useCreateRestaurantMutation,
  useUpdateRestaurantMutation,
  useDeleteRestaurantMutation,
} = restaurantsApi
