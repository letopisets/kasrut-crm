// Compatibility shim — same API as Zustand useHechsherStore, backed by RTK Query
import type { Hechsher } from '@/types'
import {
  useGetHechsherimQuery,
  useCreateHechsherMutation,
  useDeleteHechsherMutation,
} from './api/hechsherimApi'

type HechsherInput = Omit<Hechsher, 'id'>

interface HechsherStoreShim {
  hechsherim: Hechsher[]
  add:    (data: HechsherInput) => void
  remove: (id: string) => void
}

export function useHechsherStore<T>(selector: (state: HechsherStoreShim) => T): T {
  const { data: hechsherim = [] } = useGetHechsherimQuery()
  const [createMutation] = useCreateHechsherMutation()
  const [deleteMutation] = useDeleteHechsherMutation()

  const state: HechsherStoreShim = {
    hechsherim,
    add:    (data) => { void createMutation(data) },
    remove: (id)   => { void deleteMutation(id) },
  }

  return selector(state)
}
