import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/store'
import { useGetMeQuery } from '@/store/api/authApi'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

export default function AppLayout() {
  const user  = useAppSelector(s => s.auth.user)
  const token = useAppSelector(s => s.auth.token)
  const lang  = useAppSelector(s => s.lang.lang)
  const { isLoading: isCheckingSession } = useGetMeQuery(undefined, { skip: !token })

  if (!user || !token) return <Navigate to="/login" replace />

  if (isCheckingSession) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', bgcolor: 'background.default' }}>
        <CircularProgress size={28} />
      </Box>
    )
  }

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
