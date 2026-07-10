import { useEffect } from 'react'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import rtlPlugin from 'stylis-plugin-rtl'
import { prefixer } from 'stylis'
import { useAppSelector } from './store'
import { theme } from './theme'
import App from './App.tsx'

// RTL cache mirrors physical CSS for Hebrew, reaching the dialogs/menus/drawers
// that portal to <body> — a container-level dir="rtl" never did. The RTL theme
// carries direction:'rtl' so MUI's own logical spacing flips too.
const ltrCache = createCache({ key: 'mui' })
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] })
const rtlTheme = createTheme(theme, { direction: 'rtl' })

export function ThemedApp() {
  const lang = useAppSelector(s => s.lang.lang)
  const dir  = lang === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.dir  = dir
    document.documentElement.lang = lang
  }, [dir, lang])

  return (
    <CacheProvider value={dir === 'rtl' ? rtlCache : ltrCache}>
      <ThemeProvider theme={dir === 'rtl' ? rtlTheme : theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </CacheProvider>
  )
}
