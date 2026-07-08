import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export type SnackbarSeverity = 'error' | 'success' | 'info' | 'warning'

interface SnackbarState {
  open: boolean
  message: string       // '' → the UI shows a localized generic fallback
  severity: SnackbarSeverity
}

interface UiState {
  snackbar: SnackbarState
}

const initialState: UiState = {
  snackbar: { open: false, message: '', severity: 'error' },
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showSnackbar(state, action: PayloadAction<{ message?: string; severity?: SnackbarSeverity }>) {
      state.snackbar = {
        open: true,
        message: action.payload.message ?? '',
        severity: action.payload.severity ?? 'error',
      }
    },
    hideSnackbar(state) {
      state.snackbar.open = false
    },
  },
})

export const { showSnackbar, hideSnackbar } = uiSlice.actions
export default uiSlice.reducer
