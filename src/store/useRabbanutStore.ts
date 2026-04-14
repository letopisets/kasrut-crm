// Compatibility shim — same API as Zustand useRabbanutStore, backed by RTK Query
import type { Rabbanut } from '@/types'
import {
  useGetRabbanutsQuery,
  useCreateRabbanutMutation,
  useToggleRabbanutMutation,
  useDeleteRabbanutMutation,
} from './api/rabbanutApi'

type RabbanutInput = Omit<Rabbanut, 'id' | 'active' | 'color'>

interface RabbanutStoreShim {
  rabbanuts: Rabbanut[]
  add:    (data: RabbanutInput) => void
  remove: (id: string) => void
  toggle: (id: string) => void
}

export function useRabbanutStore<T>(selector: (state: RabbanutStoreShim) => T): T {
  const { data: rabbanuts = [] } = useGetRabbanutsQuery()
  const [createMutation] = useCreateRabbanutMutation()
  const [toggleMutation] = useToggleRabbanutMutation()
  const [deleteMutation] = useDeleteRabbanutMutation()

  const state: RabbanutStoreShim = {
    rabbanuts,
    add:    (data) => { void createMutation({ ...data, active: true, color: '#3498DB' }) },
    remove: (id)   => { void deleteMutation(id) },
    toggle: (id)   => { void toggleMutation(id) },
  }

  return selector(state)
}
