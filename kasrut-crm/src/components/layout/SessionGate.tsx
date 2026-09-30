import { useEffect, useState, type ReactNode } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAppDispatch, useAppSelector } from '@/store'
import { clearPersistedAuth, logout, retrySessionCheck } from '@/store/authSlice'
import { refreshSession } from '@/store/sessionRefresh'
import { signOut } from '@/store/signOut'
import { useLang } from '@/i18n/useLang'

const centered = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }

// "Sign in again" first asks the API to end the session the refresh cookie
// carries (only the API can, the cookie is httpOnly). The API could not be
// reached a moment ago, so that is best effort and waits at most this long;
// if it still fails, the next sign-in revokes the cookie this browser holds.
const SIGN_OUT_WAIT_MS = 5000

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
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    // refreshSession is single-flight, so StrictMode's second run shares it.
    if (!sessionChecked && !checkFailed) void refreshSession(dispatch)
  }, [sessionChecked, checkFailed, dispatch])

  if (sessionChecked) return <>{children}</>

  if (checkFailed) {
    const signInAgain = async () => {
      setSigningOut(true)
      await Promise.race([
        dispatch(signOut()),
        new Promise(resolve => setTimeout(resolve, SIGN_OUT_WAIT_MS)),
      ])
      dispatch(logout())
      clearPersistedAuth()
      setSigningOut(false)
    }
    return (
      <Box role="alert" sx={centered}>
        <Stack spacing={2} sx={{ alignItems: 'center', px: 2, textAlign: 'center' }}>
          <Typography>{t.sessionUnavailable}</Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" disabled={signingOut} onClick={() => dispatch(retrySessionCheck())}>{t.sessionRetry}</Button>
            <Button disabled={signingOut} onClick={() => void signInAgain()}>{t.sessionSignIn}</Button>
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
