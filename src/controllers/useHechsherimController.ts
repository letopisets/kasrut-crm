import { useState } from 'react'
import { useAppSelector } from '@/store'
import { useGetHechsherimQuery, useCreateHechsherMutation, useDeleteHechsherMutation } from '@/store/api/hechsherimApi'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { usePermissions }         from '@/hooks/usePermissions'
import { HECHSHER_TYPE_COLOR }    from '@/lib/statusColor'
import type { Hechsher, HechsherType } from '@/types'

export function useHechsherimController() {
  const user  = useAppSelector(s => s.auth.user)
  const role  = useAppSelector(s => s.auth.role)
  const perm  = usePermissions()

  const [showForm,   setShowForm]   = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: all = [], isLoading } = useGetHechsherimQuery()
  const { data: restaurants = [] }    = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }    = useGetMashgichimQuery()
  const { data: rabbanuts   = [] }    = useGetRabbanutsQuery()
  const [createMutation] = useCreateHechsherMutation()
  const [deleteMutation] = useDeleteHechsherMutation()

  const hechsherim = role === 'rabbanut'
    ? all.filter(h => h.rabbanutId === user?.rabbanutId)
    : all

  const rabbanutOptions = rabbanuts.map(r => ({ value: r.id, label: r.name }))

  const createHechsher = async (data: Omit<Hechsher, 'id'>) => {
    const color = HECHSHER_TYPE_COLOR[data.type as HechsherType] ?? '#888'
    await createMutation({ ...data, color }).unwrap()
    setShowForm(false)
  }

  const deleteHechsher = (id: string) => { void deleteMutation(id) }

  const toggleExpand = (id: string) =>
    setExpandedId(prev => prev === id ? null : id)

  const getStats = (h: Hechsher) => ({
    restaurants: restaurants.filter(r => r.hechsherId === h.id).length,
    mashgichim:  mashgichim.filter(m => m.hechsherimIds.includes(h.id)).length,
  })

  const getMashgichimForHechsher = (id: string) =>
    mashgichim.filter(m => m.hechsherimIds.includes(id))

  return {
    hechsherim, isLoading,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    expandedId, toggleExpand,
    canEdit: perm.canEdit,
    createHechsher, deleteHechsher,
    rabbanutOptions, getStats, getMashgichimForHechsher,
  }
}
