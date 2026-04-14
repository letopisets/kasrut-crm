// Compatibility shim — same API as Zustand useAuthStore, backed by Redux
import { useAppSelector, useAppDispatch } from './index'
import { setUser as setUserAction, setRabbanutFilter as setRabbanutFilterAction, logout as logoutAction } from './authSlice'
import type { User, Role } from '@/types'

export const DEMO_USERS: Record<Role, User> = {
  owner:     { id: 'u1', name: 'System Owner',    role: 'owner',     email: 'owner@kashrut.il' },
  rabbanut:  { id: 'u2', name: 'Admin Jerusalem', role: 'rabbanut',  email: 'admin@jer.il',  rabbanutId: 'rb1' },
  mashgiach: { id: 'm1', name: 'Р. Коэн',         role: 'mashgiach', email: 'cohen@jer.il',  rabbanutId: 'rb1' },
}

interface AuthShimState {
  user:           User | null
  token:          string | null
  role:           Role
  rabbanutFilter: string
  setUser:          (user: User, token: string) => void
  setRabbanutFilter:(id: string) => void
  logout:           () => void
}

export function useAuthStore<T>(selector: (state: AuthShimState) => T): T {
  const dispatch    = useAppDispatch()
  const authState   = useAppSelector(s => s.auth)

  const state: AuthShimState = {
    ...authState,
    setUser:           (user, token) => dispatch(setUserAction({ user, token })),
    setRabbanutFilter: (id)          => dispatch(setRabbanutFilterAction(id)),
    logout:            ()            => dispatch(logoutAction()),
  }

  // Persist auth state to localStorage on every change (replaces Zustand persist)
  try {
    localStorage.setItem('auth-storage', JSON.stringify({
      user:           authState.user,
      token:          authState.token,
      role:           authState.role,
      rabbanutFilter: authState.rabbanutFilter,
    }))
  } catch { /* ignore */ }

  return selector(state)
}
