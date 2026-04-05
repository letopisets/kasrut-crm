import { create } from 'zustand'
import type { Inspection, InspectionResult } from '@/types'
import { seedInspections } from '@/data/seed'

type InspectionInput = Omit<Inspection, 'id' | 'result'>

interface InspectionStore {
  inspections: Inspection[]
  add:       (data: InspectionInput) => void
  setResult: (id: string, result: InspectionResult) => void
  remove:    (id: string) => void
}

export const useInspectionStore = create<InspectionStore>((set) => ({
  inspections: seedInspections,

  add: (data) => set(s => ({
    inspections: [
      ...s.inspections,
      { ...data, id: `i${Date.now()}`, result: 'pending' },
    ],
  })),

  setResult: (id, result) => set(s => ({
    inspections: s.inspections.map(i => i.id === id ? { ...i, result } : i),
  })),

  remove: (id) => set(s => ({
    inspections: s.inspections.filter(i => i.id !== id),
  })),
}))
