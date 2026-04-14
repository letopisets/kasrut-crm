import { useParams, useNavigate } from 'react-router-dom'
import { useGetRestaurantQuery }  from '@/store/api/restaurantsApi'
import { useGetInspectionsQuery } from '@/store/api/inspectionsApi'
import { useGetHechsherimQuery }  from '@/store/api/hechsherimApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { usePermissions }         from '@/hooks/usePermissions'

export function useRestaurantDetailController() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const perm         = usePermissions()

  const { data: restaurant, isLoading, error } = useGetRestaurantQuery(id, { skip: !id })
  const { data: inspections = [] }             = useGetInspectionsQuery(id ? { restaurantId: id } : undefined)
  const { data: hechsherim  = [] }             = useGetHechsherimQuery()
  const { data: mashgichim  = [] }             = useGetMashgichimQuery()
  const { data: rabbanuts   = [] }             = useGetRabbanutsQuery()

  const hechsher  = hechsherim.find(h => h.id === restaurant?.hechsherId)
  const mashgiach = mashgichim.find(m => m.id === restaurant?.mashgiachId)
  const rabbanut  = rabbanuts.find(r => r.id === restaurant?.rabbanutId)

  return {
    restaurant, hechsher, mashgiach, rabbanut,
    inspections: inspections.slice(0, 10),
    isLoading, error: error ? 'Failed to load' : null,
    canEdit: perm.canEdit,
    goBack: () => navigate('/restaurants'),
  }
}
