import { useAuthStore } from '@/store/useAuthStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import type { Inspection } from '@/types'

/** Returns inspections scoped to the current role. Owner sees all. */
export const useInspections = (): Inspection[] => {
  const role        = useAuthStore(s => s.role)
  const user        = useAuthStore(s => s.user)
  const inspections = useInspectionStore(s => s.inspections)
  const restaurants = useRestaurantStore(s => s.restaurants)

  if (role === 'owner') return inspections

  if (role === 'rabbanut') {
    const restIds = new Set(
      restaurants.filter(r => r.rabbanutId === user?.rabbanutId).map(r => r.id)
    )
    return inspections.filter(i => restIds.has(i.restaurantId))
  }

  // mashgiach
  return inspections.filter(i => i.mashgiachId === user?.id)
}
