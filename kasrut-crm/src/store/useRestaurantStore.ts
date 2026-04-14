// Compatibility shim — same API as Zustand useRestaurantStore, backed by RTK Query
import type { Restaurant } from '@/types'
import {
  useGetRestaurantsQuery,
  useCreateRestaurantMutation,
  useUpdateRestaurantMutation,
  useDeleteRestaurantMutation,
} from './api/restaurantsApi'

type RestaurantInput = Omit<Restaurant, 'id' | 'status'>

interface RestaurantStoreShim {
  restaurants: Restaurant[]
  add:    (data: RestaurantInput) => void
  update: (id: string, patch: Partial<Restaurant>) => void
  remove: (id: string) => void
}

export function useRestaurantStore<T>(selector: (state: RestaurantStoreShim) => T): T {
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const [createMutation]  = useCreateRestaurantMutation()
  const [updateMutation]  = useUpdateRestaurantMutation()
  const [deleteMutation]  = useDeleteRestaurantMutation()

  const state: RestaurantStoreShim = {
    restaurants,
    add:    (data)        => { void createMutation(data) },
    update: (id, patch)   => { void updateMutation({ id, patch }) },
    remove: (id)          => { void deleteMutation(id) },
  }

  return selector(state)
}
