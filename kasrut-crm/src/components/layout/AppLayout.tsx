import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { Header } from './Header'
import { RoleBanner } from './RoleBanner'

export default function AppLayout() {
  const user = useAuthStore(s => s.user)
  const lang = useLangStore(s => s.lang)

  if (!user) return <Navigate to="/login" replace />

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="app-layout">
      <Header />
      <RoleBanner />
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
