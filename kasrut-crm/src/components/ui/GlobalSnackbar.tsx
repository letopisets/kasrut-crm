import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { useAppDispatch, useAppSelector } from '@/store'
import { hideSnackbar } from '@/store/uiSlice'
import { useLang } from '@/i18n/useLang'

/** App-wide feedback toast. Fed by the RTK Query error middleware (failed
 *  mutations) and any explicit dispatch(showSnackbar(...)). */
export function GlobalSnackbar() {
  const t = useLang()
  const dispatch = useAppDispatch()
  const { open, message, severity } = useAppSelector(s => s.ui.snackbar)
  const close = () => dispatch(hideSnackbar())

  return (
    <Snackbar
      open={open}
      autoHideDuration={6000}
      onClose={close}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity={severity} variant="filled" onClose={close} sx={{ width: '100%' }}>
        {message || t.actionFailed}
      </Alert>
    </Snackbar>
  )
}
