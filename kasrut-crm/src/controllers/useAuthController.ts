import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  setUser,
  setTwoFactorPending,
  clearTwoFactorPending,
  logout as logoutAction,
} from '@/store/authSlice'
import {
  useLoginMutation,
  useVerify2faMutation,
  useSetup2faMutation,
  useEnable2faMutation,
  useDisable2faMutation,
} from '@/store/api/authApi'
import { PERMISSIONS } from '@/lib/permissions'

function persistAuth(user: import('@/types').User, token: string) {
  try {
    localStorage.setItem('auth-storage', JSON.stringify({
      user, token, role: user.role, rabbanutFilter: '',
    }))
  } catch { /* ignore */ }
}

export function useAuthController() {
  const dispatch  = useAppDispatch()
  const navigate  = useNavigate()

  const user              = useAppSelector(s => s.auth.user)
  const token             = useAppSelector(s => s.auth.token)
  const role              = useAppSelector(s => s.auth.role)
  const twoFactorPending  = useAppSelector(s => s.auth.twoFactorPending)
  const pendingTempToken  = useAppSelector(s => s.auth.pendingTempToken)
  const perm              = PERMISSIONS[role]

  const [loginMut,   { isLoading: loginLoading,   error: loginError   }] = useLoginMutation()
  const [verify2faMut,{ isLoading: verifyLoading,  error: verifyError  }] = useVerify2faMutation()
  const [setup2faMut, { isLoading: setupLoading,   error: setupError   }] = useSetup2faMutation()
  const [enable2faMut,{ isLoading: enableLoading,  error: enableError  }] = useEnable2faMutation()
  const [disable2faMut,{isLoading: disableLoading, error: disableError }] = useDisable2faMutation()

  const isLoading = loginLoading || verifyLoading

  const login = async (email: string, password: string) => {
    const result = await loginMut({ email, password }).unwrap()
    if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
      dispatch(setTwoFactorPending({ tempToken: result.tempToken }))
      return
    }
    const full = result as { user: import('@/types').User; token: string }
    dispatch(setUser({ user: full.user, token: full.token }))
    persistAuth(full.user, full.token)
    navigate('/dashboard', { replace: true })
  }

  const verify2fa = async (code: string) => {
    if (!pendingTempToken) return
    const result = await verify2faMut({ tempToken: pendingTempToken, code }).unwrap()
    dispatch(setUser({ user: result.user, token: result.token }))
    persistAuth(result.user, result.token)
    navigate('/dashboard', { replace: true })
  }

  const cancelTwoFactor = () => {
    dispatch(clearTwoFactorPending())
  }

  const setup2fa = () => setup2faMut().unwrap()

  const enable2fa = async (code: string): Promise<import('@/types').User> => {
    const result = await enable2faMut({ code }).unwrap()
    // update user in store with twoFactorEnabled: true
    if (token) {
      dispatch(setUser({ user: result.user, token }))
      persistAuth(result.user, token)
    }
    return result.user
  }

  const disable2fa = async (code: string): Promise<import('@/types').User> => {
    const result = await disable2faMut({ code }).unwrap()
    if (token) {
      dispatch(setUser({ user: result.user, token }))
      persistAuth(result.user, token)
    }
    return result.user
  }

  const logout = () => {
    dispatch(logoutAction())
    navigate('/login', { replace: true })
  }

  return {
    user, token, role, perm,
    isLoading, error: loginError ?? verifyError,
    twoFactorPending, pendingTempToken,
    login, verify2fa, cancelTwoFactor,
    setup2fa, setupLoading, setupError,
    enable2fa, enableLoading, enableError,
    disable2fa, disableLoading, disableError,
    logout,
  }
}
