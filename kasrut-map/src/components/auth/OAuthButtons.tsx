import { useEffect, useRef } from 'react'
import {
  Box, Button, CircularProgress, Stack, SvgIcon,
} from '@mui/material'
import AppleIcon from '@mui/icons-material/Apple'
import { alpha } from '@mui/material/styles'
import { loadScript } from './oauthScripts'
import { useMapLang } from '@/i18n/useMapLang'
import type { MapAuthProviderConfig } from '@/types'

function GoogleG() {
  return (
    <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 18 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </SvgIcon>
  )
}

interface Props {
  google?: MapAuthProviderConfig
  apple?: MapAuthProviderConfig
  busy: boolean
  configLoading: boolean
  onGoogleCredential: (idToken: string) => void
  onAppleCredential:  (idToken: string) => void
  onError: (message: string) => void
}

export function OAuthButtons({
  google, apple, busy, configLoading,
  onGoogleCredential, onAppleCredential, onError,
}: Props) {
  const t = useMapLang()
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
          theme: 'outline', size: 'large', width: 280,
          text: 'signin_with', shape: 'rectangular',
        })
      })
      .catch(() => onError(t.googleSignInError))

    return () => { cancelled = true }
  }, [google?.enabled, google?.clientId, onError, onGoogleCredential, t.googleSignInError])

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
      onError(t.appleSignInError)
    }
  }

  if (configLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
        <CircularProgress size={22} />
      </Box>
    )
  }

  const googleActive = Boolean(google?.enabled && google.clientId)
  const appleActive  = Boolean(apple?.enabled && apple.clientId)

  return (
    <Stack spacing={1.25}>
      <Box sx={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
        {googleActive ? (
          <Box ref={googleButtonRef} sx={{ width: '100%' }} />
        ) : (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleG />}
            disabled
            sx={{
              borderRadius: 1, height: 44, textTransform: 'none',
              fontSize: 14, fontWeight: 500,
              borderColor: alpha('#fff', 0.12),
              color:       alpha('#fff', 0.3),
            }}
          >
            {t.signInWithGoogle}
          </Button>
        )}
      </Box>

      {appleActive && (
        <Button
          fullWidth
          variant="outlined"
          startIcon={<AppleIcon />}
          onClick={handleAppleLogin}
          disabled={busy}
          sx={{ borderRadius: 1, height: 44, textTransform: 'none', fontSize: 14, fontWeight: 500 }}
        >
          Sign in with Apple
        </Button>
      )}
    </Stack>
  )
}
