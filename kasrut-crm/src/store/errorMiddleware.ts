import { isRejectedWithValue, type Middleware } from '@reduxjs/toolkit'
import { showSnackbar } from './uiSlice'

// Auth flows surface their own error UI (Login page, 2FA components), so a
// global toast on top would be redundant/confusing.
const SILENCED_ENDPOINTS = new Set([
  'login', 'logout', 'verify2fa', 'setup2fa', 'enable2fa', 'disable2fa',
])

function extractServerMessage(payload: unknown): string {
  const data = (payload as { data?: unknown } | undefined)?.data
  const err  = (data as { error?: unknown } | undefined)?.error
  return typeof err === 'string' ? err : ''
}

// Catch-all toast for failed mutations. RTK Query dispatches a rejected action
// even when a component calls `.unwrap()` without a try/catch, so this surfaces
// the silent save/delete failures the controllers used to swallow — the
// operator now always learns an action didn't go through.
export const rtkQueryErrorToast: Middleware = (store) => (next) => (action) => {
  if (isRejectedWithValue(action)) {
    const arg    = (action.meta as { arg?: { type?: string; endpointName?: string } }).arg
    const status = (action.payload as { status?: number }).status
    if (
      arg?.type === 'mutation' &&
      status !== 401 &&                              // 401 → handled by auto-logout
      !SILENCED_ENDPOINTS.has(arg.endpointName ?? '')
    ) {
      store.dispatch(showSnackbar({ message: extractServerMessage(action.payload), severity: 'error' }))
    }
  }
  return next(action)
}
