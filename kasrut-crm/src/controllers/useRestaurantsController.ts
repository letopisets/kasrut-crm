import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/store'
import { useGetRestaurantsQuery, useCreateRestaurantMutation, useDeleteRestaurantMutation } from '@/store/api/restaurantsApi'
import { useGetHechsherimQuery }  from '@/store/api/hechsherimApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { usePermissions }         from '@/hooks/usePermissions'
import type { CertStatus, Restaurant } from '@/types'

type RestaurantInput = Omit<Restaurant, 'id' | 'status'>

export function useRestaurantsController() {
  const navigate = useNavigate()
  const user           = useAppSelector(s => s.auth.user)
  const role           = useAppSelector(s => s.auth.role)
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)
  const perm           = usePermissions()

  const [statusFilter, setStatusFilter] = useState<CertStatus | 'all'>('all')
  const [showForm,     setShowForm]     = useState(false)

  const { data: all = [], isLoading, error } = useGetRestaurantsQuery()
  const { data: hechsherim = [] }            = useGetHechsherimQuery()
  const { data: mashgichim = [] }            = useGetMashgichimQuery()
  const { data: rabbanuts  = [] }            = useGetRabbanutsQuery()
  const [createMutation] = useCreateRestaurantMutation()
  const [deleteMutation] = useDeleteRestaurantMutation()

  const restaurants = useMemo(() => {
    let result = [...all]
    if (role === 'rabbanut')  result = result.filter(r => r.rabbanutId === user?.rabbanutId)
    if (role === 'mashgiach') result = result.filter(r => r.mashgiachId === user?.id)
    if (role === 'owner' && rabbanutFilter) result = result.filter(r => r.rabbanutId === rabbanutFilter)
    if (statusFilter !== 'all') result = result.filter(r => r.status === statusFilter)
    return result
  }, [all, role, user, rabbanutFilter, statusFilter])

  const hechsherOptions  = useMemo(() => hechsherim.map(h => ({ value: h.id, label: h.name })), [hechsherim])
  const mashgiachOptions = useMemo(() => mashgichim.filter(m => m.active).map(m => ({ value: m.id, label: m.name })), [mashgichim])

  const createRestaurant = async (data: RestaurantInput) => {
    await createMutation(data).unwrap()
    setShowForm(false)
  }

  const deleteRestaurant = async (id: string) => {
    await deleteMutation(id).unwrap()
  }

  return {
    restaurants, isLoading, error: error ? 'Failed to load' : null,
    statusFilter, setStatusFilter,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    canEdit: perm.canEdit,
    createRestaurant, deleteRestaurant,
    hechsherim, mashgichim, rabbanuts,
    hechsherOptions, mashgiachOptions,
    navigate,
  }
}
