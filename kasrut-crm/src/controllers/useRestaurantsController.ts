import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { setRabbanutFilter as setRabbanutFilterAction } from '@/store/authSlice'
import { useGetRestaurantsQuery, useCreateRestaurantMutation, useDeleteRestaurantMutation } from '@/store/api/restaurantsApi'
import { useGetHechsherimQuery }  from '@/store/api/hechsherimApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { useGetEstablishmentCategoriesQuery } from '@/store/api/establishmentCategoriesApi'
import { usePermissions }         from '@/hooks/usePermissions'
import type { CertStatus, EstablishmentCategory, Restaurant } from '@/types'

type RestaurantInput = Omit<Restaurant, 'id' | 'status'>

export function useRestaurantsController() {
  const navigate   = useNavigate()
  const dispatch   = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const user           = useAppSelector(s => s.auth.user)
  const role           = useAppSelector(s => s.auth.role)
  const lang           = useAppSelector(s => s.lang.lang)
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)
  const perm           = usePermissions()

  const initialStatus = searchParams.get('status') as CertStatus | null
  const [statusFilter,   setStatusFilterState] = useState<CertStatus | 'all'>(
    initialStatus && ['ok', 'warning', 'critical'].includes(initialStatus) ? initialStatus : 'all'
  )
  const [nameSearch,     setNameSearch]     = useState('')
  const [hechsherFilter, setHechsherFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm,       setShowForm]       = useState(false)
  const [editTarget,     setEditTarget]     = useState<Restaurant | null>(null)

  const { data: all = [], isLoading, error } = useGetRestaurantsQuery()
  const { data: hechsherim = [] }            = useGetHechsherimQuery()
  const { data: mashgichim = [] }            = useGetMashgichimQuery()
  const { data: rabbanuts  = [] }            = useGetRabbanutsQuery()
  const { data: categories = [] }            = useGetEstablishmentCategoriesQuery()
  const [createMutation] = useCreateRestaurantMutation()
  const [deleteMutation] = useDeleteRestaurantMutation()

  const setStatusFilter = (status: CertStatus | 'all') => {
    setStatusFilterState(status)
    const next = new URLSearchParams(searchParams)
    if (status === 'all') next.delete('status')
    else next.set('status', status)
    setSearchParams(next, { replace: true })
  }

  const setRabbanutFilter = (id: string) => dispatch(setRabbanutFilterAction(id))

  const restaurants = useMemo(() => {
    let result = [...all]
    if (role === 'rabbanut')  result = result.filter(r => r.rabbanutId === user?.rabbanutId)
    if (role === 'mashgiach') result = result.filter(r => r.mashgiachId === user?.id)
    if (role === 'owner' && rabbanutFilter) result = result.filter(r => r.rabbanutId === rabbanutFilter)
    if (statusFilter !== 'all')  result = result.filter(r => r.status === statusFilter)
    if (hechsherFilter)          result = result.filter(r => r.hechsherId === hechsherFilter)
    if (categoryFilter)          result = result.filter(r => r.categoryId === categoryFilter)
    if (nameSearch.trim())       result = result.filter(r => r.name.toLowerCase().includes(nameSearch.toLowerCase()))
    return result
  }, [all, role, user, rabbanutFilter, statusFilter, hechsherFilter, categoryFilter, nameSearch])

  const hechsherOptions  = useMemo(() => hechsherim.map(h => ({ value: h.id, label: h.name })), [hechsherim])
  const mashgiachOptions = useMemo(() => mashgichim.filter(m => m.active).map(m => ({ value: m.id, label: m.name })), [mashgichim])
  const rabbanutOptions  = useMemo(() => rabbanuts.map(r => ({ value: r.id, label: r.name })), [rabbanuts])
  const categoryOptions  = useMemo(
    () => categories.map((c: EstablishmentCategory) => ({
      value: c.id,
      label: lang === 'he' ? c.nameHe : lang === 'ru' ? (c.nameRu ?? c.nameHe) : (c.nameEn ?? c.nameHe),
    })),
    [categories, lang],
  )

  const createRestaurant = async (data: RestaurantInput) => {
    await createMutation(data).unwrap()
    setShowForm(false)
  }

  const deleteRestaurant = async (id: string) => {
    if (!window.confirm('Delete this establishment?')) return
    await deleteMutation(id).unwrap()
  }

  return {
    restaurants, isLoading, error: error ? 'Failed to load' : null,
    statusFilter, setStatusFilter,
    nameSearch, setNameSearch,
    hechsherFilter, setHechsherFilter,
    categoryFilter, setCategoryFilter,
    rabbanutFilter, setRabbanutFilter,
    rabbanutOptions, categoryOptions,
    showForm,   openForm:  () => setShowForm(true),       closeForm:  () => setShowForm(false),
    editTarget, openEdit:  (r: Restaurant) => setEditTarget(r), closeEdit: () => setEditTarget(null),
    canEdit: perm.canEdit,
    isOwner: perm.isOwner,
    createRestaurant, deleteRestaurant,
    hechsherim, mashgichim, rabbanuts,
    hechsherOptions, mashgiachOptions,
    navigate,
  }
}
