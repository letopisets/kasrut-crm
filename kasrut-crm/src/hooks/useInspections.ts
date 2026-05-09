import { useMemo } from 'react'
import { useAppSelector } from '@/store'
import { useGetInspectionsQuery } from '@/store/api/inspectionsApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import type { Inspection } from '@/types'

/** Returns inspections scoped to the current role. Owner sees all. */
export const useInspections = (): Inspection[] => {
  const role = useAppSelector(s => s.auth.role)
  const user = useAppSelector(s => s.auth.user)
  const { data: inspections = [] } = useGetInspectionsQuery()
  const { data: restaurants = [] } = useGetRestaurantsQuery()

  return useMemo(() => {
    if (role === 'owner') return inspections
    if (role === 'rabbanut') {
      const restIds = new Set(
        restaurants.filter(r => r.rabbanutId === user?.rabbanutId).map(r => r.id),
      )
      return inspections.filter(i => restIds.has(i.restaurantId))
    }
    return inspections.filter(i => i.mashgiachId === user?.id)
  }, [role, user, inspections, restaurants])
}
