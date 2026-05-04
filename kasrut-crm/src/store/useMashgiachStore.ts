// Compatibility shim — same API as Zustand useMashgiachStore, backed by RTK Query
import type { Mashgiach } from '@/types'
import {
  useGetMashgichimQuery,
  useCreateMashgiachMutation,
  useUpdateMashgiachMutation,
  useToggleMashgiachMutation,
  useDeleteMashgiachMutation,
} from './api/mashgichimApi'

type MashgiachInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

interface MashgiachStoreShim {
  mashgichim:       Mashgiach[]
  add:              (data: MashgiachInput) => void
  remove:           (id: string) => void
  toggle:           (id: string) => void
  update:           (id: string, patch: Partial<Mashgiach>) => void
  assignRestaurant: (mashgiachId: string, restaurantId: string) => void
}

export function useMashgiachStore<T>(selector: (state: MashgiachStoreShim) => T): T {
  const { data: mashgichim = [] } = useGetMashgichimQuery()
  const [createMutation] = useCreateMashgiachMutation()
  const [updateMutation] = useUpdateMashgiachMutation()
  const [toggleMutation] = useToggleMashgiachMutation()
  const [deleteMutation] = useDeleteMashgiachMutation()

  const state: MashgiachStoreShim = {
    mashgichim,
    add:              (data)                     => { void createMutation(data) },
    remove:           (id)                       => { void deleteMutation(id) },
    toggle:           (id)                       => { void toggleMutation(id) },
    update:           (id, patch)                => { void updateMutation({ id, patch }) },
    assignRestaurant: ()                         => { /* handled via update */ },
  }

  return selector(state)
}
