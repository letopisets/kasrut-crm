import { useEffect, useRef } from 'react'
import {
  Box, Button, CircularProgress, Stack, Typography,
} from '@mui/material'
import AppleIcon from '@mui/icons-material/Apple'
import { loadScript } from './oauthScripts'
import type { MapAuthProviderConfig } from '@/types'

interface Props {
  google?: MapAuthProviderConfig
  apple?: MapAuthProviderConfig
  busy: boolean
  configLoading: boolean
  onGoogleCredential: (idToken: string) => void
  onAppleCredential: (idToken: string) => void
  onError: (message: string) => void
}

export function OAuthButtons({
  google,
  apple,
  busy,
  configLoading,
  onGoogleCredential,
  onAppleCredential,
  onError,
}: Props) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!google?.enabled || !google.clientId || !googleButtonRef.current) return

    let cancelled = false
    loadScript('google-identity-services', 'https://accounts.google.com/gsi/client')
      .then(() => {
        if (cancelled || !window.google || !googleButtonRef.current) return
        window.google.accounts.id.initialize({
          client_id: google.clientId!,
          callback: (response) => {
            if (response.credential) onGoogleCredential(response.credential)
          },
        })
        googleButtonRef.current.innerHTML = ''
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'signin_with',
          shape: 'rectangular',
        })
      })
      .catch(() => onError('Не удалось загрузить Google Sign-In.'))

    return () => {
      cancelled = true
    }
  }, [google?.enabled, google?.clientId, onError, onGoogleCredential])

  const handleAppleLogin = async () => {
    if (!apple?.clientId) return

    try {
      await loadScript('appleid-auth', 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js')
      if (!window.AppleID) throw new Error('AppleID is not available')
      window.AppleID.auth.init({
        clientId: apple.clientId,
        scope: 'name email',
        redirectURI: import.meta.env.VITE_APPLE_REDIRECT_URI ?? window.location.origin,
        usePopup: true,
      })
      const response = await window.AppleID.auth.signIn()
      const idToken = response.authorization?.id_token
      if (!idToken) throw new Error('Apple did not return id_token')
      onAppleCredential(idToken)
    } catch {
      onError('Не удалось войти через Apple.')
    }
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="caption" color="text.secondary">
        Google и Apple требуют Client ID в `.env`. Без них кнопки выключены, чтобы не принимать неподтверждённые токены.
      </Typography>

      {configLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">Проверяем OAuth</Typography>
        </Box>
      )}

      <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
        {google?.enabled && google.clientId ? (
          <Box ref={googleButtonRef} sx={{ width: '100%' }} />
        ) : (
          <Button fullWidth variant="outlined" disabled sx={{ borderRadius: 1 }}>
            Google OAuth не настроен
          </Button>
        )}
      </Box>

      <Button
        fullWidth
        variant="contained"
        startIcon={<AppleIcon />}
        onClick={handleAppleLogin}
        disabled={!apple?.enabled || !apple.clientId || busy}
        sx={{ borderRadius: 1, bgcolor: '#111', '&:hover': { bgcolor: '#222' } }}
      >
        {apple?.enabled ? 'Войти через Apple' : 'Apple OAuth не настроен'}
      </Button>
    </Stack>
  )
}
