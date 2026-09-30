import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import authReducer, { persistAuthState } from './authSlice'
import langReducer from './langSlice'
import uiReducer from './uiSlice'
import { baseApi } from './api/baseApi'
import { rtkQueryErrorToast } from './errorMiddleware'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lang: langReducer,
    ui:   uiReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware, rtkQueryErrorToast),
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

// The access token is never persisted (see authSlice).
let lastPersistedAuth = ''
store.subscribe(() => {
  const { user, role, rabbanutFilter, twoFactorSetupRequired } = store.getState().auth
  const serialized = JSON.stringify({ user, role, rabbanutFilter, twoFactorSetupRequired })
  if (serialized === lastPersistedAuth) return

  lastPersistedAuth = serialized
  persistAuthState({ user, role, rabbanutFilter, twoFactorSetupRequired })
})

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: <T>(selector: (state: RootState) => T) => T = useSelector
