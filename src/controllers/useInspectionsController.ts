import { useState, useMemo } from 'react'
import { useAppSelector }    from '@/store'
import { useGetInspectionsQuery, useCreateInspectionMutation, useSetInspectionResultMutation } from '@/store/api/inspectionsApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { usePermissions }         from '@/hooks/usePermissions'
import type { InspectionResult, InspectionType, Inspection } from '@/types'

export function useInspectionsController() {
  const user  = useAppSelector(s => s.auth.user)
  const role  = useAppSelector(s => s.auth.role)
  const perm  = usePermissions()

  const [typeFilter,   setTypeFilter]   = useState<InspectionType | 'all'>('all')
  const [resultFilter, setResultFilter] = useState<InspectionResult | 'all'>('all')
  const [showForm,     setShowForm]     = useState(false)

  const { data: all = [], isLoading } = useGetInspectionsQuery()
  const { data: restaurants = [] }    = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }    = useGetMashgichimQuery()
  const [createMutation]              = useCreateInspectionMutation()
  const [setResultMutation]           = useSetInspectionResultMutation()

  const inspections = useMemo(() => {
    let result = [...all]
    if (role === 'rabbanut') {
      const myRestIds = new Set(restaurants.filter(r => r.rabbanutId === user?.rabbanutId).map(r => r.id))
      result = result.filter(i => myRestIds.has(i.restaurantId))
    }
    if (role === 'mashgiach') result = result.filter(i => i.mashgiachId === user?.id)
    if (typeFilter   !== 'all') result = result.filter(i => i.type   === typeFilter)
    if (resultFilter !== 'all') result = result.filter(i => i.result === resultFilter)
    return result
  }, [all, role, user, restaurants, typeFilter, resultFilter])

  const createInspection = async (data: Omit<Inspection, 'id' | 'result'>) => {
    await createMutation(data).unwrap()
    setShowForm(false)
  }

  const setResult = (id: string, result: InspectionResult) => {
    void setResultMutation({ id, result })
  }

  return {
    inspections, isLoading,
    typeFilter,   setTypeFilter,
    resultFilter, setResultFilter,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    canEdit: perm.canEdit,
    createInspection, setResult,
    restaurants, mashgichim,
  }
}
