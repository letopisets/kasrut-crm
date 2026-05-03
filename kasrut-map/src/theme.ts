import { createTheme } from '@mui/material/styles'
import type { PaletteMode } from '@mui/material'

export type ThemeMode = PaletteMode

export const createKashrutMapTheme = (mode: ThemeMode) => createTheme({
  palette: {
    mode,
    primary:    { main: '#E8A507', contrastText: '#0F1117' },
    secondary:  { main: mode === 'light' ? '#1877B8' : '#3498DB' },
    error:      { main: '#E74C3C' },
    success:    { main: mode === 'light' ? '#138A52' : '#2ECC71' },
    warning:    { main: '#F39C12' },
    background: mode === 'light'
      ? { default: '#F6F7F9', paper: '#FFFFFF' }
      : { default: '#0F1117', paper: '#1A1D2E' },
    text: mode === 'light'
      ? { primary: '#17202A', secondary: '#56616D' }
      : { primary: '#E8E8EE', secondary: '#999999' },
    divider: mode === 'light' ? '#DDE3EA' : '#2A2D3E',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", sans-serif',
    h6:   { fontWeight: 700 },
    body2: { fontSize: '0.8125rem' },
  },
  components: {
    MuiPaper:  { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiChip: {
      styleOverrides: {
        root:          { borderRadius: 8 },
        colorPrimary:  {
          backgroundColor: mode === 'light' ? 'rgba(232,165,7,0.16)' : 'rgba(232,165,7,0.18)',
          color: mode === 'light' ? '#7A5200' : '#E8A507',
          border: '1px solid rgba(232,165,7,0.35)',
        },
      },
    },
    MuiButton: {
      variants: [
        {
          props: { variant: 'contained', color: 'primary' },
          style: { color: '#0F1117', fontWeight: 700 },
        },
      ],
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: mode === 'light' ? '#FFFFFF' : '#1A1D2E',
          backgroundImage: 'none',
        },
      },
    },
  },
})

export const theme = createKashrutMapTheme('light')
