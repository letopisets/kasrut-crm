import { useEffect, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Typography,
} from '@mui/material'
import { EmailVerificationNotice } from './EmailVerificationNotice'
import { useGetMapAuthConfigQuery, useVerifyEmailMutation } from '@/store/api/mapCommunityApi'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { emailVerificationPromptClosed, emailVerificationPrompted } from '@/store/mapAuthSlice'
import { useMapLang } from '@/i18n/useMapLang'

const VERIFY_PARAM = 'verifyEmail'

/**
 * Reads the token of an emailed link (?verifyEmail=<token>) and removes it
 * from the address bar, so it never lands in history, bookmarks or shared
 * links. Null when the page was not opened from a link.
 */
export function takeVerifyEmailToken(): string | null {
  const url = new URL(window.location.href)
  const token = url.searchParams.get(VERIFY_PARAM)
  if (token === null) return null
  url.searchParams.delete(VERIFY_PARAM)
  // Keeps the router's history state; nothing in the app reads the query.
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return token
}

type LinkOutcome = 'verified' | 'failed'

// Mounted once for the whole app: asks to confirm an emailed link, and shows
// the "confirm your email" dialog when the API refused a review or suggestion
// with 403 EMAIL_NOT_VERIFIED (store/api/baseApi.ts).
export function EmailVerificationHost() {
  const t = useMapLang()
  const dispatch = useAppDispatch()
  const promptOpen = useAppSelector(state => state.mapAuth.verificationPromptOpen)
  const user = useAppSelector(state => state.mapAuth.user)
  const email = user?.email
  const [verifyEmail, { isLoading: confirming }] = useVerifyEmailMutation()
  // The token of the link the page was opened with, until confirmed or dismissed.
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null)
  const [snackbarOpen, setSnackbarOpen] = useState(false)
  // A dead link (expired, or replaced by a newer one): offer a new link once
  // an unverified account is signed in. The session may still be restoring.
  const [offerNewLink, setOfferNewLink] = useState(false)
  const { data: authConfig } = useGetMapAuthConfigQuery(undefined, { skip: !offerNewLink })

  useEffect(() => {
    // The token leaves the URL on the first run, so StrictMode's second run
    // finds none. Nothing is sent yet: mail scanners open links too, and only
    // the visitor's click may confirm the address.
    const token = takeVerifyEmailToken()
    if (token !== null) setPendingToken(token)
  }, [])

  const confirmLink = () => {
    if (pendingToken === null) return
    verifyEmail(pendingToken).unwrap().then(
      () => { setOutcome('verified'); setSnackbarOpen(true) },
      () => { setOutcome('failed'); setSnackbarOpen(true); setOfferNewLink(true) },
    ).finally(() => setPendingToken(null))
  }

  useEffect(() => {
    if (!offerNewLink || !user || !authConfig) return
    setOfferNewLink(false)
    // "Confirm to post" only means something while posting needs it.
    if (authConfig.emailVerification === 'required' && !user.emailVerified) dispatch(emailVerificationPrompted())
  }, [offerNewLink, user, authConfig, dispatch])

  const closePrompt = () => dispatch(emailVerificationPromptClosed())

  return (
    <>
      <Dialog open={pendingToken !== null} onClose={() => setPendingToken(null)} fullWidth maxWidth="xs">
        <DialogTitle>{t.verifyEmailTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t.verifyEmailConfirmText}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingToken(null)} disabled={confirming} sx={{ borderRadius: 1 }}>
            {t.cancelBtn}
          </Button>
          <Button variant="contained" onClick={confirmLink} disabled={confirming} sx={{ borderRadius: 1 }}>
            {t.verifyEmailConfirmBtn}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={promptOpen && Boolean(email)} onClose={closePrompt} fullWidth maxWidth="xs">
        <DialogTitle>{t.verifyEmailTitle}</DialogTitle>
        <DialogContent>
          {email && <EmailVerificationNotice message={t.verifyEmailRequired.replace('{email}', email)} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePrompt} sx={{ borderRadius: 1 }}>{t.closeBtn}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={8000}
        onClose={() => setSnackbarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={outcome === 'verified' ? 'success' : 'error'}
          onClose={() => setSnackbarOpen(false)}
          sx={{ width: '100%' }}
        >
          {outcome === 'verified' ? t.emailVerifiedSuccess : t.emailVerifyFailed}
        </Alert>
      </Snackbar>
    </>
  )
}
