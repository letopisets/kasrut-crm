import { useState, useMemo, useCallback } from 'react'
import { useSearchParams }               from 'react-router-dom'
import { useAppSelector }                from '@/store'
import { useGetInspectionsQuery, useCreateInspectionMutation, useSetInspectionResultMutation } from '@/store/api/inspectionsApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { usePermissions }         from '@/hooks/usePermissions'
import type { InspectionResult, InspectionType, Inspection } from '@/types'

type TypeFilter   = 'all' | InspectionType
type ResultFilter = 'all' | InspectionResult

const TYPE_FILTERS:   TypeFilter[]   = ['all', 'planned', 'urgent']
const RESULT_FILTERS: ResultFilter[] = ['all', 'pending', 'open', 'pass', 'fail']

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const now   = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return d >= start && d < end
}

export function useInspectionsController() {
  const user  = useAppSelector(s => s.auth.user)
  const role  = useAppSelector(s => s.auth.role)
  const perm  = usePermissions()

  const [searchParams, setSearchParams] = useSearchParams()
  const rangeFilter  = searchParams.get('range')
  const typeParam    = searchParams.get('type') as InspectionType | null
  const resultParam  = searchParams.get('result') as InspectionResult | null

  const [typeFilter,   setTypeFilterState]   = useState<TypeFilter>(
    typeParam && TYPE_FILTERS.includes(typeParam) ? typeParam : 'all',
  )
  const [resultFilter, setResultFilterState] = useState<ResultFilter>(
    resultParam && RESULT_FILTERS.includes(resultParam) ? resultParam : 'all',
  )
  const [showForm, setShowForm] = useState(false)

  const { data: all = [], isLoading } = useGetInspectionsQuery()
  const { data: restaurants = [] }    = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }    = useGetMashgichimQuery()
  const [createMutation]              = useCreateInspectionMutation()
  const [setResultMutation]           = useSetInspectionResultMutation()

  const setParamFilter = useCallback((key: 'type' | 'result', value: TypeFilter | ResultFilter) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === 'all') next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setTypeFilter = (value: TypeFilter) => {
    setTypeFilterState(value)
    setParamFilter('type', value)
  }

  const setResultFilter = (value: ResultFilter) => {
    setResultFilterState(value)
    setParamFilter('result', value)
  }

  const inspections = useMemo(() => {
    let result = [...all]
    if (role === 'rabbanut') {
      const myRestIds = new Set(restaurants.filter(r => r.rabbanutId === user?.rabbanutId).map(r => r.id))
      result = result.filter(i => myRestIds.has(i.restaurantId))
    }
    if (role === 'mashgiach') result = result.filter(i => i.mashgiachId === user?.id)
    if (rangeFilter === 'week')    result = result.filter(i => isThisWeek(i.date))
    if (typeFilter   !== 'all') result = result.filter(i => i.type   === typeFilter)
    if (resultFilter !== 'all') result = result.filter(i => i.result === resultFilter)
    return result
  }, [all, role, user, restaurants, rangeFilter, typeFilter, resultFilter])

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
    rangeFilter,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    canEdit: perm.canEdit,
    createInspection, setResult,
    restaurants, mashgichim,
    TYPE_FILTERS, RESULT_FILTERS,
  }
}
