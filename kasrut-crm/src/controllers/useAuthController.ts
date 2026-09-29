import { useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '@/store'
import {
  clearPersistedAuth,
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
  useLogoutMutation,
} from '@/store/api/authApi'
import { PERMISSIONS } from '@/lib/permissions'

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
  const [logoutMut] = useLogoutMutation()

  const isLoading = loginLoading || verifyLoading

  const login = async (email: string, password: string) => {
    const result = await loginMut({ email, password }).unwrap()
    if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
      dispatch(setTwoFactorPending({ tempToken: result.tempToken }))
      return
    }
    const full = result as { user: import('@/types').User; token: string }
    dispatch(setUser({ user: full.user, token: full.token }))
    navigate('/dashboard', { replace: true })
  }

  const verify2fa = async (code: string) => {
    if (!pendingTempToken) return
    const result = await verify2faMut({ tempToken: pendingTempToken, code }).unwrap()
    dispatch(setUser({ user: result.user, token: result.token }))
    navigate('/dashboard', { replace: true })
  }

  const cancelTwoFactor = () => {
    dispatch(clearTwoFactorPending())
  }

  const setup2fa = (password: string) => setup2faMut({ password }).unwrap()

  const enable2fa = async (code: string) => {
    const result = await enable2faMut({ code }).unwrap()
    dispatch(setUser({ user: result.user, token: result.token }))
    return result
  }

  const disable2fa = async (code: string): Promise<import('@/types').User> => {
    const result = await disable2faMut({ code }).unwrap()
    dispatch(setUser({ user: result.user, token: result.token }))
    return result.user
  }

  const logout = async () => {
    try {
      if (token) await logoutMut().unwrap()
    } finally {
      dispatch(logoutAction())
      clearPersistedAuth()
      navigate('/login', { replace: true })
    }
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
