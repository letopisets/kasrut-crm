import { useAppSelector } from '@/store'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import type { Restaurant } from '@/types'

/** Returns restaurants scoped to the current role + owner's rabbanut filter. */
export const useRestaurants = (): Restaurant[] => {
  const role           = useAppSelector(s => s.auth.role)
  const user           = useAppSelector(s => s.auth.user)
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)

  const { data: restaurants = [] } = useGetRestaurantsQuery(
    role === 'owner' && rabbanutFilter ? { rabbanutId: rabbanutFilter } :
    role === 'rabbanut'                ? { rabbanutId: user?.rabbanutId } :
    undefined,   // mashgiach: no params — server scopes via JWT role
  )

  return restaurants
}
