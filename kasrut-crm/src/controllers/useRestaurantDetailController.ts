import { useParams, useNavigate } from 'react-router-dom'
import { useGetRestaurantQuery }    from '@/store/api/restaurantsApi'
import { useGetInspectionsQuery }   from '@/store/api/inspectionsApi'
import { useGetHechsherByIdQuery }  from '@/store/api/hechsherimApi'
import { useGetMashgiachByIdQuery } from '@/store/api/mashgichimApi'
import { useGetRabbanutByIdQuery }  from '@/store/api/rabbanutApi'
import { usePermissions }           from '@/hooks/usePermissions'

export function useRestaurantDetailController() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const perm         = usePermissions()

  const { data: restaurant, isLoading, error } = useGetRestaurantQuery(id, { skip: !id })
  const { data: inspections = [] }             = useGetInspectionsQuery(id ? { restaurantId: id } : undefined)

  // Fetch related entities individually — avoids pulling full lists
  const { data: hechsher }  = useGetHechsherByIdQuery(restaurant?.hechsherId  ?? '', { skip: !restaurant?.hechsherId })
  const { data: mashgiach } = useGetMashgiachByIdQuery(restaurant?.mashgiachId ?? '', { skip: !restaurant?.mashgiachId })
  const { data: rabbanut }  = useGetRabbanutByIdQuery(restaurant?.rabbanutId   ?? '', { skip: !restaurant?.rabbanutId })

  return {
    restaurant, hechsher, mashgiach, rabbanut,
    inspections: inspections.slice(0, 10),
    isLoading, error: error ? 'Failed to load' : null,
    canEdit: perm.canEdit,
    goBack: () => navigate('/restaurants'),
  }
}
