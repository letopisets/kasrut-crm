import { create } from 'zustand'
import type { Rabbanut } from '@/types'
import { seedRabbanuts } from '@/data/seed'

type RabbanutInput = Omit<Rabbanut, 'id' | 'active' | 'color'>

const PALETTE = ['#E8C96D', '#E67E22', '#1ABC9C', '#8E44AD', '#3498DB', '#2ECC71']

interface RabbanutStore {
  rabbanuts: Rabbanut[]
  add:    (data: RabbanutInput) => void
  remove: (id: string) => void
  toggle: (id: string) => void
}

export const useRabbanutStore = create<RabbanutStore>((set) => ({
  rabbanuts: seedRabbanuts,

  add: (data) => set(s => ({
    rabbanuts: [
      ...s.rabbanuts,
      {
        ...data,
        id:     `rb${Date.now()}`,
        active: true,
        color:  PALETTE[s.rabbanuts.length % PALETTE.length],
      },
    ],
  })),

  remove: (id) => set(s => ({
    rabbanuts: s.rabbanuts.filter(r => r.id !== id),
  })),

  toggle: (id) => set(s => ({
    rabbanuts: s.rabbanuts.map(r => r.id === id ? { ...r, active: !r.active } : r),
  })),
}))
