import { useCallback, useMemo, useState, type SyntheticEvent } from 'react'
import {
  Alert, Dialog, DialogActions, DialogContent, DialogTitle,
  Button, Divider, Stack, Tab, Tabs, Typography,
} from '@mui/material'
import { OAuthButtons } from './OAuthButtons'
import { PasswordLoginForm } from './PasswordLoginForm'
import { PasswordResetForm } from './PasswordResetForm'
import { RegistrationForm, type RegistrationFormData } from './RegistrationForm'
import {
  useConfirmPasswordResetMutation,
  useGetMapAuthConfigQuery,
  useLoginWithPasswordMutation,
  useOauthLoginMutation,
  useRegisterWithPasswordMutation,
  useRequestPasswordResetMutation,
} from '@/store/api/mapCommunityApi'
import { useAppDispatch } from '@/store/hooks'
import { setCredentials } from '@/store/mapAuthSlice'
import type {
  MapAuthProvider,
  MapAuthResponse,
  PasswordResetChannel,
  PasswordResetRequestResponse,
} from '@/types'

interface Props {
  open: boolean
  onClose: () => void
}

type AuthMode = 'login' | 'register' | 'reset'

export function AuthDialog({ open, onClose }: Props) {
  const dispatch = useAppDispatch()
  const [mode, setMode] = useState<AuthMode>('login')
  const [error, setError] = useState<string | null>(null)

  const { data: config, isLoading: configLoading } = useGetMapAuthConfigQuery(undefined, { skip: !open })
  const [oauthLogin, oauthState] = useOauthLoginMutation()
  const [loginWithPassword, loginState] = useLoginWithPasswordMutation()
  const [registerWithPassword, registerState] = useRegisterWithPasswordMutation()
  const [requestPasswordReset, requestResetState] = useRequestPasswordResetMutation()
  const [confirmPasswordReset, confirmResetState] = useConfirmPasswordResetMutation()

  const providers = config?.providers ?? []
  const google = useMemo(() => providers.find(p => p.provider === 'google'), [providers])
  const apple = useMemo(() => providers.find(p => p.provider === 'apple'), [providers])
  const busy = oauthState.isLoading || loginState.isLoading || registerState.isLoading || requestResetState.isLoading || confirmResetState.isLoading

  const finishAuth = useCallback((result: MapAuthResponse) => {
    dispatch(setCredentials({ user: result.user, token: result.token }))
    onClose()
  }, [dispatch, onClose])

  const switchMode = (_event: SyntheticEvent, value: AuthMode) => {
    setMode(value)
    setError(null)
  }

  const showError = useCallback((message: string) => setError(message), [])

  const handleOAuthLogin = useCallback(async (provider: MapAuthProvider, idToken: string) => {
    setError(null)
    try {
      finishAuth(await oauthLogin({ provider, idToken }).unwrap())
    } catch {
      setError('Не удалось войти. Проверьте настройки OAuth и попробуйте снова.')
    }
  }, [finishAuth, oauthLogin])

  const handleGoogleCredential = useCallback((idToken: string) => {
    void handleOAuthLogin('google', idToken)
  }, [handleOAuthLogin])

  const handleAppleCredential = useCallback((idToken: string) => {
    void handleOAuthLogin('apple', idToken)
  }, [handleOAuthLogin])

  const handlePasswordLogin = async (email: string, password: string) => {
    setError(null)
    try {
      finishAuth(await loginWithPassword({ email, password }).unwrap())
    } catch {
      setError('Неверная почта или пароль.')
    }
  }

  const handleRegister = async (data: RegistrationFormData) => {
    setError(null)
    try {
      finishAuth(await registerWithPassword(data).unwrap())
    } catch {
      setError('Не удалось зарегистрироваться. Проверьте поля: пароль минимум 8 символов, буквы и цифры.')
    }
  }

  const handleRequestReset = async (
    channel: PasswordResetChannel,
    identifier: string,
  ): Promise<PasswordResetRequestResponse | null> => {
    setError(null)
    try {
      return await requestPasswordReset({ channel, identifier }).unwrap()
    } catch {
      setError('Не удалось создать запрос на сброс пароля.')
      return null
    }
  }

  const handleConfirmReset = async (token: string, password: string) => {
    setError(null)
    try {
      finishAuth(await confirmPasswordReset({ token, password }).unwrap())
    } catch {
      setError('Код сброса недействителен или истёк. Пароль должен содержать минимум 8 символов, буквы и цифры.')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Аккаунт KashrutMap</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Войдите, чтобы отправлять отзывы, добавлять новые места и предлагать исправления.
          </Typography>

          <Tabs value={mode} onChange={switchMode} variant="fullWidth">
            <Tab value="login" label="Войти" />
            <Tab value="register" label="Регистрация" />
            <Tab value="reset" label="Сброс" />
          </Tabs>

          {error && <Alert severity="error">{error}</Alert>}

          {mode === 'login' && (
            <PasswordLoginForm
              busy={busy}
              onSubmit={handlePasswordLogin}
              onForgotPassword={() => setMode('reset')}
            />
          )}
          {mode === 'register' && <RegistrationForm busy={busy} onSubmit={handleRegister} />}
          {mode === 'reset' && (
            <PasswordResetForm
              busy={busy}
              onRequestReset={handleRequestReset}
              onConfirmReset={handleConfirmReset}
            />
          )}

          <Divider />

          <OAuthButtons
            google={google}
            apple={apple}
            busy={busy}
            configLoading={configLoading}
            onGoogleCredential={handleGoogleCredential}
            onAppleCredential={handleAppleCredential}
            onError={showError}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ borderRadius: 1 }}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  )
}
