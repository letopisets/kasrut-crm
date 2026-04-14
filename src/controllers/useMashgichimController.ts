import { useState } from 'react'
import { useAppSelector } from '@/store'
import { useGetMashgichimQuery, useCreateMashgiachMutation, useToggleMashgiachMutation, useDeleteMashgiachMutation } from '@/store/api/mashgichimApi'
import { useGetHechsherimQuery } from '@/store/api/hechsherimApi'
import { usePermissions }        from '@/hooks/usePermissions'
import type { Mashgiach } from '@/types'

type MashgiachInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

export function useMashgichimController() {
  const user  = useAppSelector(s => s.auth.user)
  const role  = useAppSelector(s => s.auth.role)
  const perm  = usePermissions()

  const [showForm, setShowForm] = useState(false)

  const { data: all = [], isLoading } = useGetMashgichimQuery()
  const { data: hechsherim = [] }     = useGetHechsherimQuery()
  const [createMutation] = useCreateMashgiachMutation()
  const [toggleMutation] = useToggleMashgiachMutation()
  const [deleteMutation] = useDeleteMashgiachMutation()

  const mashgichim = role === 'rabbanut'
    ? all.filter(m => m.rabbanutId === user?.rabbanutId)
    : all

  const hechsherOptions = hechsherim.map(h => ({ value: h.id, label: h.name }))

  const createMashgiach = async (data: MashgiachInput) => {
    await createMutation(data).unwrap()
    setShowForm(false)
  }

  const toggleMashgiach = (id: string) => { void toggleMutation(id) }
  const deleteMashgiach = (id: string) => { void deleteMutation(id) }

  const getHechsherimForMashgiach = (ids: string[]) =>
    hechsherim.filter(h => ids.includes(h.id))

  return {
    mashgichim, hechsherim, isLoading,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    canEdit: perm.canEdit,
    createMashgiach, toggleMashgiach, deleteMashgiach,
    hechsherOptions, getHechsherimForMashgiach,
  }
}
