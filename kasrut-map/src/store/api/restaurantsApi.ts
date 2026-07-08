import { baseApi } from './baseApi'
import type { MapHechsher, MapOptions, MapRestaurantQuery, MapRestaurantsResponse } from '@/types'

// Matches the server-side cache grid (~110 m) — see useMapController.
const QUERY_COORD_PRECISION = 3

function formatCoord(value: number): string {
  const factor = 10 ** QUERY_COORD_PRECISION
  return String(Math.round(value * factor) / factor)
}

/** Build query string from filters */
function toQueryString(f: MapRestaurantQuery): string {
  const params = new URLSearchParams()
  if (f.q)                           params.set('q', f.q)
  if (f.city)                        params.set('city', f.city)
  if (f.hechsher.length)             params.set('hechsher',     f.hechsher.join(','))
  if (f.foodType.length)             params.set('foodType',     f.foodType.join(','))
  if (f.category.length)             params.set('category',     f.category.join(','))
  if (f.limit)                       params.set('limit',        String(f.limit))
  if (f.radius && f.userPosition) {
    params.set('lat',                formatCoord(f.userPosition[0]))
    params.set('lng',                formatCoord(f.userPosition[1]))
    params.set('radius',             String(f.radius))
  }
  if (f.viewport) {
    params.set('north',              formatCoord(f.viewport.bounds.north))
    params.set('south',              formatCoord(f.viewport.bounds.south))
    params.set('east',               formatCoord(f.viewport.bounds.east))
    params.set('west',               formatCoord(f.viewport.bounds.west))
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
      providesTags: ['MapOptions'],
    }),
    getMapHechsherim: build.query<MapHechsher[], void>({
      query: () => '/map/hechsherim',
      providesTags: ['Hechsher'],
    }),
  }),
})

export const {
  useGetMapRestaurantsQuery,
  useGetMapOptionsQuery,
  useGetMapHechsherimQuery,
} = restaurantsApi
