import { useEffect, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAppDispatch, useAppSelector } from '@/store'
import { clearPersistedAuth, logout, retrySessionCheck } from '@/store/authSlice'
import { refreshSession } from '@/store/sessionRefresh'
import { useLang } from '@/i18n/useLang'

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }

// The access token is kept in memory only, so after a reload the persisted
// user has none. Nothing renders until the refresh cookie has been traded for
// a new one (or turned out to be gone, which signs the user out); routes then
// decide as usual between the app and the login page. When the API cannot be
// reached the cookie may still be good: the user can retry, or sign in anew.
export function SessionGate({ children }: { children: ReactNode }) {
  const dispatch       = useAppDispatch()
  const sessionChecked = useAppSelector(s => s.auth.sessionChecked)
  const checkFailed    = useAppSelector(s => s.auth.sessionCheckFailed)
  const t              = useLang()

  useEffect(() => {
    // refreshSession is single-flight, so StrictMode's second run shares it.
    if (!sessionChecked && !checkFailed) void refreshSession(dispatch)
  }, [sessionChecked, checkFailed, dispatch])

  if (sessionChecked) return <>{children}</>

  if (checkFailed) {
    const signInAgain = () => {
      dispatch(logout())
      clearPersistedAuth()
    }
    return (
      <Box role="alert" sx={centered}>
        <Stack spacing={2} sx={{ alignItems: 'center', px: 2, textAlign: 'center' }}>
          <Typography>{t.sessionUnavailable}</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => dispatch(retrySessionCheck())}>{t.sessionRetry}</Button>
            <Button onClick={signInAgain}>{t.sessionSignIn}</Button>
          </Stack>
        </Stack>
      </Box>
    )
  }

  return (
    <Box role="status" aria-live="polite" aria-label={t.sessionRestoring} sx={centered}>
      <CircularProgress size={28} aria-label={t.sessionRestoring} />
    </Box>
  )
}
