import type { Restaurant, CertStatus } from '../types'
import { seedRestaurants } from './seed'

function calcStatus(expires: string): CertStatus {
  const days = Math.floor((new Date(expires).getTime() - Date.now()) / 86_400_000)
  if (days < 0)   return 'critical'
  if (days <= 30) return 'warning'
  return 'ok'
}

let data: Restaurant[] = seedRestaurants.map(r => ({ ...r, status: calcStatus(r.expires) }))

export const restaurantsMock = {
  findAll(filter?: { rabbanutId?: string; status?: string }): Restaurant[] {
    let result = [...data]
    if (filter?.rabbanutId) result = result.filter(r => r.rabbanutId === filter.rabbanutId)
    if (filter?.status)     result = result.filter(r => r.status === filter.status)
    return result
  },

  findById(id: string): Restaurant | null {
    return data.find(r => r.id === id) ?? null
  },

  findByMashgiach(mashgiachId: string): Restaurant[] {
    return data.filter(r => r.mashgiachId === mashgiachId)
  },

  create(input: Omit<Restaurant, 'id' | 'status'>): Restaurant {
    const record: Restaurant = {
      ...input,
      id:     `r${Date.now()}`,
      status: calcStatus(input.expires),
    }
    data.push(record)
    return record
  },

  update(id: string, patch: Partial<Omit<Restaurant, 'id'>>): Restaurant | null {
    const idx = data.findIndex(r => r.id === id)
    if (idx === -1) return null
    const updated = { ...data[idx], ...patch }
    if (patch.expires) updated.status = calcStatus(patch.expires)
    data[idx] = updated
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(r => r.id !== id)
    return data.length < before
  },

  reset(): void { data = seedRestaurants.map(r => ({ ...r, status: calcStatus(r.expires) })) },
}
