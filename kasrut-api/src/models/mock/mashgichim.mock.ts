import type { Mashgiach } from '../types'
import { seedMashgichim } from './seed'

let data: Mashgiach[] = [...seedMashgichim]

export const mashgichimMock = {
  findAll(filter?: { rabbanutId?: string; active?: boolean }): Mashgiach[] {
    let result = [...data]
    if (filter?.rabbanutId !== undefined) result = result.filter(m => m.rabbanutId === filter.rabbanutId)
    if (filter?.active !== undefined)     result = result.filter(m => m.active === filter.active)
    return result
  },

  findById(id: string): Mashgiach | null {
    return data.find(m => m.id === id) ?? null
  },

  create(input: Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>): Mashgiach {
    const record: Mashgiach = { ...input, id: `m${Date.now()}`, assignedRestaurantIds: [] }
    data.push(record)
    return record
  },

  update(id: string, patch: Partial<Omit<Mashgiach, 'id'>>): Mashgiach | null {
    const idx = data.findIndex(m => m.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    return data[idx]
  },

  toggle(id: string): Mashgiach | null {
    const idx = data.findIndex(m => m.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], active: !data[idx].active }
    return data[idx]
  },

  assignRestaurant(id: string, restaurantId: string): Mashgiach | null {
    const idx = data.findIndex(m => m.id === id)
    if (idx === -1) return null
    if (!data[idx].assignedRestaurantIds.includes(restaurantId)) {
      data[idx] = { ...data[idx], assignedRestaurantIds: [...data[idx].assignedRestaurantIds, restaurantId] }
    }
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(m => m.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedMashgichim] },
}
