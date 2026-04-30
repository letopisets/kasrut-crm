import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { Header } from './Header'
import { RoleBanner } from './RoleBanner'
import { Sidebar } from './Sidebar'
import Box from '@mui/material/Box'

export default function AppLayout() {
  const user = useAuthStore(s => s.user)
  const lang = useLangStore(s => s.lang)

  if (!user) return <Navigate to="/login" replace />

  return (
    <Box
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}
    >
      <Sidebar />
      <Box
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: '100vh' }}
      >
        <Header />
        <RoleBanner />
        <Box
          component="main"
          sx={{
            flex: 1,
            p: { xs: '12px 10px', sm: '14px 14px', md: '20px 20px', lg: '26px 32px' },
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}
