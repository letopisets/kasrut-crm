import { create } from 'zustand'
import type { Restaurant, CertStatus } from '@/types'
import { seedRestaurants } from '@/data/seed'
import { daysUntil } from '@/lib/daysUntil'

type RestaurantInput = Omit<Restaurant, 'id' | 'status'>

interface RestaurantStore {
  restaurants: Restaurant[]
  add:    (data: RestaurantInput) => void
  update: (id: string, patch: Partial<Restaurant>) => void
  remove: (id: string) => void
}

const calcStatus = (expires: string): CertStatus => {
  const d = daysUntil(expires)
  return d < 10 ? 'critical' : d < 30 ? 'warning' : 'ok'
}

export const useRestaurantStore = create<RestaurantStore>((set) => ({
  restaurants: seedRestaurants,

  add: (data) => set(s => ({
    restaurants: [
      ...s.restaurants,
      { ...data, id: `r${Date.now()}`, status: calcStatus(data.expires) },
    ],
  })),

  update: (id, patch) => set(s => ({
    restaurants: s.restaurants.map(r =>
      r.id === id
        ? { ...r, ...patch, status: patch.expires ? calcStatus(patch.expires) : r.status }
        : r
    ),
  })),

  remove: (id) => set(s => ({
    restaurants: s.restaurants.filter(r => r.id !== id),
  })),
}))
