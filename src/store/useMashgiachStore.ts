import { create } from 'zustand'
import type { Mashgiach } from '@/types'
import { seedMashgichim } from '@/data/seed'

type MashgiachInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

interface MashgiachStore {
  mashgichim: Mashgiach[]
  add:              (data: MashgiachInput) => void
  remove:           (id: string) => void
  toggle:           (id: string) => void
  update:           (id: string, patch: Partial<Mashgiach>) => void
  assignRestaurant: (mashgiachId: string, restaurantId: string) => void
}

export const useMashgiachStore = create<MashgiachStore>((set) => ({
  mashgichim: seedMashgichim,

  add: (data) => set(s => ({
    mashgichim: [
      ...s.mashgichim,
      { ...data, id: `m${Date.now()}`, assignedRestaurantIds: [] },
    ],
  })),

  remove: (id) => set(s => ({
    mashgichim: s.mashgichim.filter(m => m.id !== id),
  })),

  toggle: (id) => set(s => ({
    mashgichim: s.mashgichim.map(m => m.id === id ? { ...m, active: !m.active } : m),
  })),

  update: (id, patch) => set(s => ({
    mashgichim: s.mashgichim.map(m => m.id === id ? { ...m, ...patch } : m),
  })),

  assignRestaurant: (mashgiachId, restaurantId) => set(s => ({
    mashgichim: s.mashgichim.map(m =>
      m.id === mashgiachId && !m.assignedRestaurantIds.includes(restaurantId)
        ? { ...m, assignedRestaurantIds: [...m.assignedRestaurantIds, restaurantId] }
        : m
    ),
  })),
}))
