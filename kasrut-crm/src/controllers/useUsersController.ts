import { useState } from 'react'
import { useGetUsersQuery, useCreateUserMutation, useDeleteUserMutation } from '@/store/api/usersApi'
import { useGetRabbanutsQuery } from '@/store/api/rabbanutApi'
import { useGetMashgichimQuery } from '@/store/api/mashgichimApi'
import type { Role, User } from '@/types'

export function useUsersController() {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all')
  const [showForm,   setShowForm]   = useState(false)

  const { data: all = [], isLoading } = useGetUsersQuery()
  const { data: rabbanuts = [] }      = useGetRabbanutsQuery()
  const { data: mashgichim = [] }     = useGetMashgichimQuery()
  const [createMutation] = useCreateUserMutation()
  const [deleteMutation] = useDeleteUserMutation()

  const users = roleFilter === 'all' ? all : all.filter(u => u.role === roleFilter)

  const createUser = async (data: { name: string; email: string; password: string; role: Role; rabbanutId?: string; mashgiachId?: string }) => {
    await createMutation(data).unwrap()
    setShowForm(false)
  }

  const deleteUser = (id: string) => {
    if (!window.confirm('Delete this user?')) return
    void deleteMutation(id)
  }

  const rabbanutOptions = rabbanuts.map(r => ({ value: r.id, label: r.name }))
  const mashgiachOptions = mashgichim.map(m => ({
    value: m.id,
    label: `${m.name} (${m.email})`,
    rabbanutId: m.rabbanutId,
  }))

  return {
    users: users as User[], isLoading,
    roleFilter, setRoleFilter,
    showForm, openForm: () => setShowForm(true), closeForm: () => setShowForm(false),
    createUser, deleteUser,
    rabbanutOptions,
    mashgiachOptions,
  }
}
