import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Role } from '@/types'

// Demo users — replaced by real JWT auth when backend is ready
export const DEMO_USERS: Record<Role, User> = {
  owner:     { id: 'u1', name: 'System Owner',    role: 'owner',     email: 'owner@kashrut.il' },
  rabbanut:  { id: 'u2', name: 'Admin Jerusalem', role: 'rabbanut',  email: 'admin@jer.il',  rabbanutId: 'rb1' },
  mashgiach: { id: 'm1', name: 'Р. Коэн',         role: 'mashgiach', email: 'cohen@jer.il',  rabbanutId: 'rb1' },
}

interface AuthState {
  user:             User | null
  token:            string | null
  role:             Role
  rabbanutFilter:   string        // owner's filter by rabbanut ('': all)
  setUser:          (user: User, token: string) => void
  setRole:          (role: Role) => void
  setRabbanutFilter:(id: string) => void
  logout:           () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:             null,
      token:            null,
      role:             'owner',
      rabbanutFilter:   '',
      setUser:          (user, token) => set({ user, token, role: user.role }),
      setRole:          (role) => set({ role, user: DEMO_USERS[role], rabbanutFilter: '' }),
      setRabbanutFilter:(id) => set({ rabbanutFilter: id }),
      logout:           () => set({ user: null, token: null, role: 'rabbanut', rabbanutFilter: '' }),
    }),
    { name: 'auth-storage' }
  )
)
