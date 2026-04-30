import { useState } from 'react'
import {
  useGetRabbanutsQuery,
  useCreateRabbanutMutation,
  useUpdateRabbanutMutation,
  useToggleRabbanutMutation,
  useDeleteRabbanutMutation,
} from '@/store/api/rabbanutApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useAppSelector }         from '@/store'
import { setRabbanutFilter }      from '@/store/authSlice'
import { useAppDispatch }         from '@/store'
import type { Rabbanut } from '@/types'

const PALETTE = ['#E8C96D', '#E67E22', '#1ABC9C', '#8E44AD', '#3498DB', '#2ECC71', '#E74C3C', '#95A5A6']

export function useRabbanutController() {
  const dispatch       = useAppDispatch()
  const rabbanutFilter = useAppSelector(s => s.auth.rabbanutFilter)

  const [showForm,    setShowForm]    = useState(false)
  const [editTarget,  setEditTarget]  = useState<Rabbanut | null>(null)

  const { data: rabbanuts   = [], isLoading } = useGetRabbanutsQuery()
  const { data: restaurants = [] }            = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }            = useGetMashgichimQuery()

  const [createMutation] = useCreateRabbanutMutation()
  const [updateMutation] = useUpdateRabbanutMutation()
  const [toggleMutation] = useToggleRabbanutMutation()
  const [deleteMutation] = useDeleteRabbanutMutation()

  const openForm  = () => { setEditTarget(null); setShowForm(true) }
  const openEdit  = (r: Rabbanut) => { setEditTarget(r); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditTarget(null) }

  const createRabbanut = async (data: Omit<Rabbanut, 'id' | 'active' | 'color'>) => {
    const color = PALETTE[rabbanuts.length % PALETTE.length]
    await createMutation({ ...data, active: true, color }).unwrap()
    closeForm()
  }

  const updateRabbanut = async (id: string, data: Omit<Rabbanut, 'id'>) => {
    await updateMutation({ id, patch: data }).unwrap()
    closeForm()
  }

  const toggleRabbanut = (id: string) => { void toggleMutation(id) }
  const deleteRabbanut = (id: string) => {
    if (!window.confirm('Delete this kashrut authority?')) return
    void deleteMutation(id)
  }

  const getStats = (r: Rabbanut) => ({
    restaurants: restaurants.filter(rest => rest.rabbanutId === r.id).length,
    mashgichim:  mashgichim.filter(m => m.rabbanutId === r.id).length,
    critical:    restaurants.filter(rest => rest.rabbanutId === r.id && rest.status === 'critical').length,
  })

  return {
    rabbanuts, isLoading,
    showForm, editTarget,
    openForm, openEdit, closeForm,
    createRabbanut, updateRabbanut, toggleRabbanut, deleteRabbanut,
    getStats,
    rabbanutFilter,
    setFilter: (id: string) => dispatch(setRabbanutFilter(id)),
  }
}
