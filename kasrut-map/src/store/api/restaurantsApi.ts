import { baseApi } from './baseApi'
import type { MapHechsher, MapOptions, MapRestaurantQuery, MapRestaurantsResponse } from '@/types'

/** Build query string from filters */
function toQueryString(f: MapRestaurantQuery): string {
  const params = new URLSearchParams()
  if (f.city && f.city !== 'Все')   params.set('city', f.city)
  if (f.hechsher.length)             params.set('hechsher',     f.hechsher.join(','))
  if (f.foodType.length)             params.set('foodType',     f.foodType.join(','))
  if (f.limit)                       params.set('limit',        String(f.limit))
  if (f.radius && f.userPosition) {
    params.set('lat',                String(f.userPosition[0]))
    params.set('lng',                String(f.userPosition[1]))
    params.set('radius',             String(f.radius))
  }
  if (f.viewport) {
    params.set('north',              String(f.viewport.bounds.north))
    params.set('south',              String(f.viewport.bounds.south))
    params.set('east',               String(f.viewport.bounds.east))
    params.set('west',               String(f.viewport.bounds.west))
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export const restaurantsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMapRestaurants: build.query<MapRestaurantsResponse, MapRestaurantQuery>({
      query: (filters) => `/map/restaurants${toQueryString(filters)}`,
      providesTags: ['Restaurant'],
    }),
    getMapOptions: build.query<MapOptions, void>({
      query: () => '/map/options',
      providesTags: ['Restaurant'],
    }),
    getMapHechsherim: build.query<MapHechsher[], void>({
      query: () => '/map/hechsherim',
      providesTags: ['Restaurant'],
    }),
  }),
})

export const {
  useGetMapRestaurantsQuery,
  useGetMapOptionsQuery,
  useGetMapHechsherimQuery,
} = restaurantsApi
