import { createTheme, alpha } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    gold: { main: string; dim: string }
    statusOk: string
    statusWarn: string
    statusCrit: string
  }
  interface PaletteOptions {
    gold?: { main: string; dim: string }
    statusOk?: string
    statusWarn?: string
    statusCrit?: string
  }
}

export const ROLE_COLORS = {
  owner:     '#E8C96D',
  rabbanut:  '#3498DB',
  mashgiach: '#2ECC71',
} as const

export const STATUS_COLORS = {
  ok:       '#2ECC71',
  warning:  '#F39C12',
  critical: '#E74C3C',
} as const

export const HECHSHER_COLORS = {
  Rabbanut: '#3498DB',
  Badatz:   '#E74C3C',
  Mehadrin: '#9B59B6',
  Private:  '#95A5A6',
} as const

export const DOC_COLORS = {
  Instructions: '#3498DB',
  Forms:        '#9B59B6',
  Regulations:  '#E67E22',
  Pesach:       '#E8C96D',
} as const

export const RESULT_COLORS = {
  pending: '#9A9AB0',
  open:    '#3498DB',
  pass:    '#2ECC71',
  fail:    '#E74C3C',
} as const

export const TYPE_COLORS = {
  planned: '#3498DB',
  urgent:  '#E74C3C',
} as const

const BG = {
  base:     '#0D1018',
  card:     '#161929',
  elevated: '#1E2235',
} as const

const BORDER = '#252840'
const GOLD   = '#E8C96D'
const GOLD_DIM = '#C9A84C'

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main:  GOLD,
      dark:  GOLD_DIM,
      light: '#F0D88A',
      contrastText: BG.card,
    },
    secondary: {
      main: '#3498DB',
    },
    error:   { main: '#E74C3C' },
    warning: { main: '#F39C12' },
    success: { main: '#2ECC71' },
    background: {
      default: BG.base,
      paper:   BG.card,
    },
    text: {
      primary:   '#EAEAF2',
      secondary: '#9A9AB0',
      disabled:  '#30324A',
    },
    divider: BORDER,
    gold: { main: GOLD, dim: GOLD_DIM },
    statusOk:   '#2ECC71',
    statusWarn: '#F39C12',
    statusCrit: '#E74C3C',
  },
  typography: {
    fontFamily: "'IBM Plex Sans', 'Heebo', 'Segoe UI', sans-serif",
    fontSize: 14,
    h1: { fontSize: '2rem',   fontWeight: 800 },
    h2: { fontSize: '1.5rem', fontWeight: 700 },
    h3: { fontSize: '1.25rem', fontWeight: 700 },
    h4: { fontSize: '1.1rem',  fontWeight: 700 },
    h5: { fontSize: '1rem',    fontWeight: 600 },
    h6: { fontSize: '0.9rem',  fontWeight: 600 },
    body1: { fontSize: '0.875rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem', color: '#9A9AB0' },
    overline: { fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' },
  },
  shape: {
    borderRadius: 10,
  },
  breakpoints: {
    values: { xs: 0, sm: 480, md: 768, lg: 1024, xl: 1280 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*, *::before, *::after': { boxSizing: 'border-box' },
        'html, body, #root': {
          margin: 0,
          padding: 0,
          minHeight: '100vh',
          background: BG.base,
          color: '#EAEAF2',
        },
        body: {
          fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '[dir="rtl"] body': {
          fontFamily: "'Heebo', 'Segoe UI', sans-serif",
        },
        '::-webkit-scrollbar': { width: 5, height: 5 },
        '::-webkit-scrollbar-track': { background: BG.base },
        '::-webkit-scrollbar-thumb': { background: BORDER, borderRadius: 3 },
        '::-webkit-scrollbar-thumb:hover': { background: '#3A3D5A' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.8125rem',
          borderRadius: 10,
          whiteSpace: 'nowrap',
          "&.MuiButton-contained.MuiButton-colorPrimary": {
            background: `linear-gradient(135deg, ${GOLD_DIM}, ${GOLD})`,
            color: BG.card,
            '&:hover': { opacity: 0.88, background: `linear-gradient(135deg, ${GOLD_DIM}, ${GOLD})` },
          },
          "&.MuiButton-outlined.MuiButton-colorPrimary": {
            borderColor: alpha(GOLD, 0.4),
            color: GOLD,
            '&:hover': { background: alpha(GOLD, 0.07) },
          },
          "&.MuiButton-outlined.MuiButton-colorError": {
            borderColor: alpha('#E74C3C', 0.3),
            color: '#E74C3C',
            background: alpha('#E74C3C', 0.05),
            '&:hover': { background: alpha('#E74C3C', 0.12) },
          },
          "&.MuiButton-text.MuiButton-colorSecondary": {
            color: '#9A9AB0',
            '&:hover': { background: alpha('#fff', 0.05) },
          },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${BORDER}`,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: BG.card,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined', size: 'small' },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            background: BG.elevated,
            borderRadius: 6,
            fontSize: '0.8125rem',
            '& fieldset': { borderColor: BORDER },
            '&:hover fieldset': { borderColor: '#3A3D5A' },
            '&.Mui-focused fieldset': { borderColor: GOLD_DIM },
          },
          '& .MuiInputLabel-root': { color: '#50526A', fontSize: '0.8125rem' },
          '& .MuiInputLabel-root.Mui-focused': { color: GOLD_DIM },
        },
      },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        select: {
          background: BG.elevated,
          fontSize: '0.8125rem',
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: {
          background: BG.elevated,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: BORDER },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: BG.card,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
        },
        container: {
          backdropFilter: 'blur(2px)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontSize: '0.9375rem', fontWeight: 700, color: GOLD, paddingBottom: 8 },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          background: BG.card,
          borderBottom: `1px solid ${BORDER}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: BG.card,
          borderRight: `1px solid ${BORDER}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: '0.6875rem', height: 22, borderRadius: 20 },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: '#50526A',
          '&:hover': { color: '#9A9AB0', background: alpha('#fff', 0.05) },
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: BG.elevated,
          border: `1px solid ${BORDER}`,
          color: '#EAEAF2',
          fontSize: '0.75rem',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          '&:hover': { background: BG.elevated },
          '&.Mui-selected': { background: alpha(GOLD, 0.08) },
          '&.Mui-selected:hover': { background: alpha(GOLD, 0.12) },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          '&:hover': { background: BG.elevated },
          '&.Mui-selected': { background: alpha(GOLD, 0.08) },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: BORDER,
          fontSize: '0.8125rem',
          padding: '8px 12px',
        },
        head: { fontWeight: 700, color: '#9A9AB0', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: 4, background: BG.elevated },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontSize: '0.8125rem',
          "&.MuiAlert-standard.MuiAlert-colorError": {
            background: alpha('#E74C3C', 0.08),
            border: `1px solid ${alpha('#E74C3C', 0.2)}`,
            color: '#E74C3C',
          },
        },
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.6875rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#50526A',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.8125rem',
          color: '#50526A',
          minWidth: 'auto',
          padding: '6px 14px',
          '&.Mui-selected': { fontWeight: 700 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 2, borderRadius: 1 },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: { '& .MuiSwitch-thumb': { boxShadow: 'none' } },
        track: { background: BORDER },
      },
    },
  },
})
