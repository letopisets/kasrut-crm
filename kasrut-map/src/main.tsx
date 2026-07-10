import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'
import rtlPlugin from 'stylis-plugin-rtl'
import { prefixer } from 'stylis'
import { store } from '@/store'
import { useAppSelector } from '@/store/hooks'
import { createKashrutMapTheme } from '@/theme'
import type { ThemeMode } from '@/theme'
import { initSentry } from '@/lib/sentry'
import App from '@/App'
import '@/index.css'

initSentry()

// Two Emotion caches: the RTL one runs stylis-plugin-rtl so physical CSS
// (margins, anchors, transforms) is mirrored for Hebrew — including MUI
// components that portal to <body> (dialogs, menus, drawers), which a
// container-level dir="rtl" never reached.
const ltrCache = createCache({ key: 'mui' })
const rtlCache = createCache({ key: 'muirtl', stylisPlugins: [prefixer, rtlPlugin] })

function getInitialThemeMode(): ThemeMode {
  const saved = localStorage.getItem('kasrut-map-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'light'
}

interface ThemedAppProps {
  themeMode: ThemeMode
  onToggleThemeMode: () => void
}

function ThemedApp({ themeMode, onToggleThemeMode }: ThemedAppProps) {
  const lang = useAppSelector(s => s.mapLang.lang)
  const dir  = lang === 'he' ? 'rtl' : 'ltr'
  const theme = useMemo(() => createKashrutMapTheme(themeMode, dir), [themeMode, dir])

  useEffect(() => {
    document.documentElement.dir  = dir
    document.documentElement.lang = lang
  }, [dir, lang])

  return (
    <CacheProvider value={dir === 'rtl' ? rtlCache : ltrCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App themeMode={themeMode} onToggleThemeMode={onToggleThemeMode} />
      </ThemeProvider>
    </CacheProvider>
  )
}

function Root() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode)

  useEffect(() => {
    localStorage.setItem('kasrut-map-theme', themeMode)
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  const toggleThemeMode = () => setThemeMode(mode => mode === 'light' ? 'dark' : 'light')

  return (
    <Provider store={store}>
      <ThemedApp themeMode={themeMode} onToggleThemeMode={toggleThemeMode} />
    </Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
