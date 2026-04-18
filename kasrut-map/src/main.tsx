import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { store } from '@/store'
import { createKashrutMapTheme } from '@/theme'
import type { ThemeMode } from '@/theme'
import App from '@/App'
import '@/index.css'

function getInitialThemeMode(): ThemeMode {
  const saved = localStorage.getItem('kasrut-map-theme')
  if (saved === 'light' || saved === 'dark') return saved
  return 'light'
}

function Root() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode)
  const theme = useMemo(() => createKashrutMapTheme(themeMode), [themeMode])

  useEffect(() => {
    localStorage.setItem('kasrut-map-theme', themeMode)
    document.documentElement.dataset.theme = themeMode
  }, [themeMode])

  const toggleThemeMode = () => setThemeMode(mode => mode === 'light' ? 'dark' : 'light')

  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App themeMode={themeMode} onToggleThemeMode={toggleThemeMode} />
      </ThemeProvider>
    </Provider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
