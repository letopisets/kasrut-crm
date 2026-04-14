import { useMemo } from 'react'
import { useAppSelector } from '@/store'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetInspectionsQuery } from '@/store/api/inspectionsApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { daysUntil } from '@/lib/daysUntil'

export function useDashboardController() {
  const role           = useAppSelector(s => s.auth.role)
  const user           = useAppSelector(s => s.auth.user)
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)

  const { data: allRestaurants = [], isLoading: rLoading } = useGetRestaurantsQuery()
  const { data: allInspections = [], isLoading: iLoading } = useGetInspectionsQuery()
  const { data: rabbanuts       = [] }                     = useGetRabbanutsQuery()
  const { data: mashgichim      = [] }                     = useGetMashgichimQuery()

  const restaurants = useMemo(() => {
    if (role === 'owner')     return rabbanutFilter ? allRestaurants.filter(r => r.rabbanutId === rabbanutFilter) : allRestaurants
    if (role === 'rabbanut')  return allRestaurants.filter(r => r.rabbanutId === user?.rabbanutId)
    return allRestaurants.filter(r => r.mashgiachId === user?.id)
  }, [role, user, rabbanutFilter, allRestaurants])

  const inspections = useMemo(() => {
    if (role === 'owner')    return allInspections
    if (role === 'rabbanut') {
      const myRestIds = new Set(restaurants.map(r => r.id))
      return allInspections.filter(i => myRestIds.has(i.restaurantId))
    }
    return allInspections.filter(i => i.mashgiachId === user?.id)
  }, [role, user, restaurants, allInspections])

  const stats = useMemo(() => ({
    total:    restaurants.length,
    ok:       restaurants.filter(r => r.status === 'ok').length,
    warning:  restaurants.filter(r => r.status === 'warning').length,
    critical: restaurants.filter(r => r.status === 'critical').length,
    pending:  inspections.filter(i => i.result === 'pending').length,
  }), [restaurants, inspections])

  const expiring = useMemo(() =>
    restaurants
      .filter(r => daysUntil(r.expires) <= 60)
      .sort((a, b) => daysUntil(a.expires) - daysUntil(b.expires))
      .slice(0, 6)
  , [restaurants])

  const upcoming = useMemo(() =>
    inspections
      .filter(i => i.result === 'pending' || i.result === 'open')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6)
  , [inspections])

  return {
    isLoading:   rLoading || iLoading,
    stats,
    restaurants,
    inspections,
    expiring,
    upcoming,
    rabbanuts,
    mashgichim,
    role,
  }
}
