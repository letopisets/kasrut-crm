import type { User, Role } from '../types'
import { seedUsers } from './seed'
import bcrypt from 'bcryptjs'

let data: User[] = [...seedUsers]

export const usersMock = {
  findAll(filter?: { role?: Role }): User[] {
    let result = [...data]
    if (filter?.role) result = result.filter(u => u.role === filter.role)
    return result
  },

  findById(id: string): User | null {
    return data.find(u => u.id === id) ?? null
  },

  findByEmail(email: string): User | null {
    return data.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null
  },

  verifyPassword(user: User, password: string): boolean {
    return bcrypt.compareSync(password, user.passwordHash)
  },

  create(input: { name: string; email: string; password: string; role: Role; rabbanutId?: string }): User {
    const record: User = {
      id:               `u${Date.now()}`,
      name:             input.name,
      email:            input.email,
      passwordHash:     bcrypt.hashSync(input.password, 12),
      role:             input.role,
      twoFactorEnabled: false,
      ...(input.rabbanutId ? { rabbanutId: input.rabbanutId } : {}),
    }
    data.push(record)
    return record
  },

  update(id: string, patch: Partial<Omit<User, 'id' | 'passwordHash'>>): User | null {
    const idx = data.findIndex(u => u.id === id)
    if (idx === -1) return null
    data[idx] = { ...data[idx], ...patch }
    return data[idx]
  },

  remove(id: string): boolean {
    const before = data.length
    data = data.filter(u => u.id !== id)
    return data.length < before
  },

  reset(): void { data = [...seedUsers] },
}
