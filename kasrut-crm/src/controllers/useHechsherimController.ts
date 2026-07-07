import { useState } from 'react'
import { useAppSelector } from '@/store'
import { useGetHechsherimQuery, useCreateHechsherMutation, useUpdateHechsherMutation, useDeleteHechsherMutation } from '@/store/api/hechsherimApi'
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
  const [editing,    setEditing]    = useState<Hechsher | null>(null)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: all = [], isLoading } = useGetHechsherimQuery()
  const { data: restaurants = [] }    = useGetRestaurantsQuery()
  const { data: mashgichim  = [] }    = useGetMashgichimQuery()
  const { data: rabbanuts   = [] }    = useGetRabbanutsQuery()
  const [createMutation] = useCreateHechsherMutation()
  const [updateMutation] = useUpdateHechsherMutation()
  const [deleteMutation] = useDeleteHechsherMutation()

  const hechsherim = role === 'rabbanut'
    ? all.filter(h => h.rabbanutId === user?.rabbanutId)
    : all

  const rabbanutOptions = rabbanuts.map(r => ({ value: r.id, label: r.name }))

  const openCreate = () => { setEditing(null); setSaveError(null); setShowForm(true) }
  const openEdit   = (h: Hechsher) => { setEditing(h); setSaveError(null); setShowForm(true) }
  const closeForm  = () => { setShowForm(false); setEditing(null); setSaveError(null) }

  // One handler for both create and edit: the color follows the type, and an
  // edit PATCHes the record being edited rather than creating a new one.
  const saveHechsher = async (data: Omit<Hechsher, 'id'>) => {
    const color = HECHSHER_TYPE_COLOR[data.type as HechsherType] ?? '#888'
    setSaving(true); setSaveError(null)
    try {
      if (editing) {
        await updateMutation({ id: editing.id, patch: { ...data, color } }).unwrap()
      } else {
        await createMutation({ ...data, color }).unwrap()
      }
      closeForm()
    } catch {
      setSaveError('Failed to save hechsher')
    } finally {
      setSaving(false)
    }
  }

  const deleteHechsher = (id: string) => {
    if (!window.confirm('Delete this hechsher?')) return
    void deleteMutation(id)
  }

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
    showForm, editing, saveError, saving,
    openForm: openCreate, openEdit, closeForm,
    expandedId, toggleExpand,
    canEdit: perm.canEdit,
    saveHechsher, deleteHechsher,
    rabbanutOptions, getStats, getMashgichimForHechsher,
  }
}
