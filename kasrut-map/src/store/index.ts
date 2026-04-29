import { configureStore } from '@reduxjs/toolkit'
import { baseApi } from './api/baseApi'
import { mapAuthReducer } from './mapAuthSlice'
import mapLangReducer from './mapLangSlice'

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    mapAuth: mapAuthReducer,
    mapLang: mapLangReducer,
  },
  middleware: (getDefault) => getDefault().concat(baseApi.middleware),
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
