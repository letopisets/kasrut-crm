import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthController } from '@/controllers/useAuthController'
import { useAppDispatch, useAppSelector } from '@/store'
import { useGetMeQuery } from '@/store/api/authApi'
import { setLang as setLangAction, type Lang } from '@/store/langSlice'
import { useLang } from '@/i18n/useLang'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'
import { LoginLangBar, LoginLogo } from '@/pages/Login'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew'

// Forced 2FA enrolment (REQUIRE_OWNER_2FA). The API refuses everything else
// for this session, so there is no way past it except enabling 2FA or signing
// out.
export default function SetupTwoFactor() {
  const navigate = useNavigate()
  const { user, token, twoFactorSetupRequired, backupCodes, logout } = useAuthController()
  const dispatch = useAppDispatch()
  const lang     = useAppSelector(s => s.lang.lang)
  const setLang  = (l: Lang) => dispatch(setLangAction(l))
  const t        = useLang()
  const tf       = t.twoFactor
  // Re-reads twoFactorSetupRequired from the server (see authApi getMe).
  useGetMeQuery(undefined, { skip: !token })

  if (!user || !token) return <Navigate to="/login" replace />
  // Nothing to set up, unless the backup codes of the setup that just
  // finished are still on screen.
  if (!twoFactorSetupRequired && !backupCodes) return <Navigate to="/dashboard" replace />

  const isRtl = lang === 'he'

  return (
    <Box
      dir={isRtl ? 'rtl' : 'ltr'}
      sx={{
        minHeight: '100vh', bgcolor: 'background.default',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: 'text.primary', p: { xs: '48px 16px', sm: '48px 24px' },
        position: 'relative',
      }}
    >
      <LoginLangBar lang={lang} setLang={setLang} isRtl={isRtl} />
      <LoginLogo appName={t.appName} appSub={t.appSub} />

      <Box sx={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!backupCodes && (
          <Alert severity="warning" data-testid="two-factor-required">
            <AlertTitle>{tf?.requiredTitle ?? 'Two-factor authentication required'}</AlertTitle>
            {tf?.requiredInstruction}
          </Alert>
        )}
        <TwoFactorSettings forced onClose={() => navigate('/dashboard', { replace: true })} />
        <Button
          variant="text"
          startIcon={<PowerSettingsNewIcon fontSize="small" />}
          onClick={() => void logout()}
          sx={{ alignSelf: 'center', color: 'text.secondary' }}
        >
          {t.logout}
        </Button>
      </Box>
    </Box>
  )
}
