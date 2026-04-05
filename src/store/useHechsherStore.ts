import { create } from 'zustand'
import type { Hechsher, HechsherType } from '@/types'
import { seedHechsherim } from '@/data/seed'
import { HECHSHER_TYPE_COLOR } from '@/lib/statusColor'

type HechsherInput = Omit<Hechsher, 'id' | 'color'>

interface HechsherStore {
  hechsherim: Hechsher[]
  add:    (data: HechsherInput) => void
  remove: (id: string) => void
}

export const useHechsherStore = create<HechsherStore>((set) => ({
  hechsherim: seedHechsherim,

  add: (data) => set(s => ({
    hechsherim: [
      ...s.hechsherim,
      {
        ...data,
        id:    `h${Date.now()}`,
        color: HECHSHER_TYPE_COLOR[data.type as HechsherType] ?? '#888',
      },
    ],
  })),

  remove: (id) => set(s => ({
    hechsherim: s.hechsherim.filter(h => h.id !== id),
  })),
}))
