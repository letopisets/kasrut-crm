import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import authReducer, { persistAuthState } from './authSlice'
import langReducer from './langSlice'
import { baseApi } from './api/baseApi'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lang: langReducer,
    [baseApi.reducerPath]: baseApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

let lastPersistedAuth = ''
store.subscribe(() => {
  const { user, token, role, rabbanutFilter } = store.getState().auth
  const serialized = JSON.stringify({ user, token, role, rabbanutFilter })
  if (serialized === lastPersistedAuth) return

  lastPersistedAuth = serialized
  persistAuthState({ user, token, role, rabbanutFilter })
})

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: <T>(selector: (state: RootState) => T) => T = useSelector
