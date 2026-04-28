import { baseApi } from './baseApi'
import type { MapRestaurant, MapFilters, MapHechsher } from '@/types'

/** Build query string from filters */
function toQueryString(f: MapFilters): string {
  const params = new URLSearchParams()
  if (f.city && f.city !== 'Все')   params.set('city', f.city)
  if (f.hechsher.length)             params.set('hechsher',     f.hechsher.join(','))
  if (f.foodType.length)             params.set('foodType',     f.foodType.join(','))
  // Note: radius filtering is done on the frontend (Haversine) after receiving all candidates
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const restaurantsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMapRestaurants: build.query<MapRestaurant[], MapFilters>({
      query: (filters) => `/map/restaurants${toQueryString(filters)}`,
      providesTags: ['Restaurant'],
    }),
    getMapHechsherim: build.query<MapHechsher[], void>({
      query: () => '/map/hechsherim',
      providesTags: ['Restaurant'],
    }),
  }),
})

export const { useGetMapRestaurantsQuery, useGetMapHechsherimQuery } = restaurantsApi
