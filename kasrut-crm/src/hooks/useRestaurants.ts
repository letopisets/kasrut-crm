import { useMemo } from 'react'
import { useAppSelector } from '@/store'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery } from '@/store/api/mashgichimApi'
import type { Restaurant } from '@/types'

/** Returns restaurants scoped to the current role + owner's rabbanut filter. */
export const useRestaurants = (): Restaurant[] => {
  const role           = useAppSelector(s => s.auth.role)
  const user           = useAppSelector(s => s.auth.user)
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()

  return useMemo(() => {
    if (role === 'owner') {
      return rabbanutFilter
        ? restaurants.filter(r => r.rabbanutId === rabbanutFilter)
        : restaurants
    }
    if (role === 'rabbanut') {
      return restaurants.filter(r => r.rabbanutId === user?.rabbanutId)
    }
    // mashgiach — scoped to their assigned establishments
    const myMashgiach = mashgichim.find(m => m.id === user?.id)
    if (!myMashgiach) return []
    return restaurants.filter(r => r.mashgiachId === myMashgiach.id)
  }, [role, user, rabbanutFilter, restaurants, mashgichim])
}
