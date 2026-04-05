import { Outlet } from 'react-router-dom'
import { useLangStore } from '@/store/useLangStore'
import { Header } from './Header'
import { RoleBanner } from './RoleBanner'

export default function AppLayout() {
  const lang = useLangStore(s => s.lang)
  const isHe = lang === 'he'

  return (
    <div
      dir={isHe ? 'rtl' : 'ltr'}
      style={{
        fontFamily:    isHe ? "'Heebo','Segoe UI',sans-serif" : "'IBM Plex Sans','Segoe UI',sans-serif",
        background:    'var(--bg-base)',
        minHeight:     '100vh',
        display:       'flex',
        flexDirection: 'column',
        color:         'var(--text-primary)',
      }}
    >
      <Header />
      <RoleBanner />
      <main style={{ padding: '18px 22px', flex: 1 }}>
        <Outlet />
      </main>
    </div>
  )
}
