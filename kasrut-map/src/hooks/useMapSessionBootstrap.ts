import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { refreshMapSession } from '@/store/sessionRefresh'

// The access token is kept in memory only, so after a reload a persisted
// user has none: trade the refresh cookie for one, once. Returns whether that
// check has answered; until then the account controls show a spinner.
export function useMapSessionBootstrap(): boolean {
  const dispatch       = useAppDispatch()
  const sessionChecked = useAppSelector(state => state.mapAuth.sessionChecked)

  useEffect(() => {
    // refreshMapSession is single-flight, so StrictMode's second run shares it.
    if (!sessionChecked) void refreshMapSession(dispatch)
  }, [sessionChecked, dispatch])

  return sessionChecked
}
