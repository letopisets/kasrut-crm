import { useState } from 'react'
import { useGetRabbanutsQuery, useCreateRabbanutMutation, useToggleRabbanutMutation, useDeleteRabbanutMutation } from '@/store/api/rabbanutApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useAppSelector }         from '@/store'
import { setRabbanutFilter }      from '@/store/authSlice'
import { useAppDispatch }         from '@/store'
import type { Rabbanut } from '@/types'

const PALETTE = ['#E8C96D', '#E67E22', '#1ABC9C', '#8E44AD', '#3498DB', '#2ECC71']

export function useRabbanutController() {
  const dispatch       = useAppDispatch()
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)

  const [showForm, setShowForm] = useState(false)

  const { data: rabbanuts   = [], isLoading } = useGetRabbanutsQuery()
  const { data: restaurants = [] }            = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }            = useGetMashgichimQuery()
  const [createMutation] = useCreateRabbanutMutation()
  const [toggleMutation] = useToggleRabbanutMutation()
  const [deleteMutation] = useDeleteRabbanutMutation()

  const createRabbanut = async (data: Omit<Rabbanut, 'id' | 'active' | 'color'>) => {
    const color = PALETTE[rabbanuts.length % PALETTE.length]
    await createMutation({ ...data, active: true, color }).unwrap()
    setShowForm(false)
  }

  const toggleRabbanut = (id: string) => { void toggleMutation(id) }
  const deleteRabbanut = (id: string) => { void deleteMutation(id) }

  const getStats = (r: Rabbanut) => ({
    restaurants: restaurants.filter(rest => rest.rabbanutId === r.id).length,
    mashgichim:  mashgichim.filter(m => m.rabbanutId === r.id).length,
    critical:    restaurants.filter(rest => rest.rabbanutId === r.id && rest.status === 'critical').length,
  })

  return {
    rabbanuts, isLoading,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    createRabbanut, toggleRabbanut, deleteRabbanut,
    getStats,
    rabbanutFilter,
    setFilter: (id: string) => dispatch(setRabbanutFilter(id)),
  }
}
