// Compatibility shim — same API as Zustand useInspectionStore, backed by RTK Query
import type { Inspection, InspectionResult } from '@/types'
import {
  useGetInspectionsQuery,
  useCreateInspectionMutation,
  useSetInspectionResultMutation,
  useDeleteInspectionMutation,
} from './api/inspectionsApi'

type InspectionInput = Omit<Inspection, 'id' | 'result'>

interface InspectionStoreShim {
  inspections: Inspection[]
  add:       (data: InspectionInput) => void
  setResult: (id: string, result: InspectionResult) => void
  remove:    (id: string) => void
}

export function useInspectionStore<T>(selector: (state: InspectionStoreShim) => T): T {
  const { data: inspections = [] } = useGetInspectionsQuery()
  const [createMutation]    = useCreateInspectionMutation()
  const [setResultMutation] = useSetInspectionResultMutation()
  const [deleteMutation]    = useDeleteInspectionMutation()

  const state: InspectionStoreShim = {
    inspections,
    add:       (data)         => { void createMutation(data) },
    setResult: (id, result)   => { void setResultMutation({ id, result }) },
    remove:    (id)           => { void deleteMutation(id) },
  }

  return selector(state)
}
