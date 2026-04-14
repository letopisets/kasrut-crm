import { useAuthStore } from '@/store/useAuthStore'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import type { Restaurant } from '@/types'

/** Returns restaurants scoped to the current role + owner's rabbanut filter. */
export const useRestaurants = (): Restaurant[] => {
  const role           = useAuthStore(s => s.role)
  const user           = useAuthStore(s => s.user)
  const rabbanutFilter = useAuthStore(s => s.rabbanutFilter)
  const restaurants    = useRestaurantStore(s => s.restaurants)
  const mashgichim     = useMashgiachStore(s => s.mashgichim)

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
}
