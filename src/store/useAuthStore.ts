import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Role } from '../types/user'

interface AuthState {
  user: User | null
  token: string | null
  role: Role
  setUser: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      role: 'rabbanut',
      setUser: (user, token) => set({ user, token, role: user.role }),
      logout: () => set({ user: null, token: null, role: 'rabbanut' }),
    }),
    { name: 'auth-storage' }  // сохраняется в localStorage
  )
)