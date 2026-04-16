import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#E8A507', contrastText: '#0F1117' },
    secondary:  { main: '#3498DB' },
    error:      { main: '#E74C3C' },
    success:    { main: '#2ECC71' },
    warning:    { main: '#F39C12' },
    background: { default: '#0F1117', paper: '#1A1D2E' },
    text:       { primary: '#E8E8EE', secondary: '#999999' },
    divider:    '#2A2D3E',
  },
  shape: { borderRadius: 12 },
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
        colorPrimary:  { backgroundColor: 'rgba(232,165,7,0.18)', color: '#E8A507', border: '1px solid rgba(232,165,7,0.35)' },
      },
    },
    MuiButton: {
      styleOverrides: {
        containedPrimary: { color: '#0F1117', fontWeight: 700 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: '#1A1D2E', backgroundImage: 'none' },
      },
    },
  },
})
