import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store'
import { setUser, logout as logoutAction } from '@/store/authSlice'
import { useLoginMutation } from '@/store/api/authApi'
import { PERMISSIONS } from '@/lib/permissions'

export function useAuthController() {
  const dispatch   = useAppDispatch()
  const navigate   = useNavigate()
  const user       = useAppSelector(s => s.auth.user)
  const token      = useAppSelector(s => s.auth.token)
  const role       = useAppSelector(s => s.auth.role)
  const perm       = PERMISSIONS[role]
  const [loginMut, { isLoading, error }] = useLoginMutation()

  const login = async (email: string, password: string) => {
    const result = await loginMut({ email, password }).unwrap()
    dispatch(setUser({ user: result.user, token: result.token }))
    try { localStorage.setItem('auth-storage', JSON.stringify({ user: result.user, token: result.token, role: result.user.role, rabbanutFilter: '' })) } catch { /* ignore */ }
    navigate('/dashboard', { replace: true })
  }

  const logout = () => {
    dispatch(logoutAction())
    navigate('/login', { replace: true })
  }

  return { user, token, role, perm, isLoading, error, login, logout }
}
