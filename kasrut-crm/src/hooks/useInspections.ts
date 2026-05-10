import { useMemo } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useAppSelector } from '@/store'
import { useGetInspectionsQuery } from '@/store/api/inspectionsApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import type { Inspection } from '@/types'

/** Returns inspections scoped to the current role. Owner sees all. */
export const useInspections = (): Inspection[] => {
  const role = useAppSelector(s => s.auth.role)
  const user = useAppSelector(s => s.auth.user)

  // Rabbanut role only: fetch their restaurants to filter inspections by restaurant ID.
  // RTK Query deduplicates this with useRestaurants when both hooks are active on the same page.
  const { data: restaurants = [] } = useGetRestaurantsQuery(
    role === 'rabbanut' ? { rabbanutId: user?.rabbanutId } : skipToken,
  )
  const { data: inspections = [] } = useGetInspectionsQuery()

  return useMemo(() => {
    if (role !== 'rabbanut') return inspections   // owner: all; mashgiach: server-scoped via JWT
    const restIds = new Set(restaurants.map(r => r.id))
    return inspections.filter(i => restIds.has(i.restaurantId))
  }, [role, inspections, restaurants])
}
