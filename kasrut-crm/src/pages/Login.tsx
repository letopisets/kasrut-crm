import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthController } from '@/controllers/useAuthController'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import type { Lang } from '@/store/useLangStore'

const LANGS: Lang[] = ['en', 'ru', 'he']
const PRIMARY = '#E8C96D'

function extractError(err: unknown): string | null {
  if (!err) return null
  if (typeof err === 'object' && err !== null) {
    if ('data' in err) {
      const d = (err as { data: unknown }).data
      if (typeof d === 'object' && d !== null && 'message' in d)
        return String((d as { message: unknown }).message)
    }
    if ('message' in err) return String((err as { message: unknown }).message)
  }
  return 'Ошибка входа'
}

export default function Login() {
  const navigate = useNavigate()
  const {
    user, login, isLoading,
    twoFactorPending, verify2fa, cancelTwoFactor, error,
  } = useAuthController()
  const lang    = useLangStore(s => s.lang)
  const setLang = useLangStore(s => s.setLang)
  const t       = useLang()
  const tf      = t.twoFactor

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError,setTotpError]= useState('')

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (twoFactorPending) { setTotpCode(''); setTotpError('') }
  }, [twoFactorPending])

  const handleLogin = async () => {
    if (!email || !password) return
    try { await login(email, password) } catch { /* handled by RTK */ }
  }

  const handleVerify = async () => {
    if (totpCode.length !== 6) {
      setTotpError(tf?.codeMustBe6 ?? 'Enter 6-digit code')
      return
    }
    try {
      setTotpError('')
      await verify2fa(totpCode)
    } catch {
      setTotpError(tf?.codeMustBe6 ?? 'Invalid code')
    }
  }

  const isRtl  = lang === 'he'
  const errMsg = extractError(error)
  const rc     = PRIMARY

  const LangBar = () => (
    <Box sx={{
      position: 'absolute', top: 18,
      right: isRtl ? 'auto' : 22,
      left:  isRtl ? 22 : 'auto',
      display: 'flex', gap: 0.375,
    }}>
      {LANGS.map(l => (
        <Button
          key={l}
          onClick={() => setLang(l)}
          size="small"
          sx={{
            minWidth: 0, px: 1.25, py: '5px',
            fontSize: '0.75rem',
            fontWeight: lang === l ? 700 : 500,
            color: lang === l ? '#E8C96D' : '#50526A',
            background: lang === l ? alpha('#E8C96D', 0.08) : 'transparent',
            border: '1px solid',
            borderColor: lang === l ? alpha('#E8C96D', 0.25) : '#252840',
            borderRadius: 1,
            '&:hover': { color: '#9A9AB0' },
          }}
        >
          {l.toUpperCase()}
        </Button>
      ))}
    </Box>
  )

  const Logo = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
        <Box sx={{
          width: 60, height: 60, borderRadius: 2,
          background: 'linear-gradient(135deg, #C9A84C, #E8C96D)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, fontWeight: 900, color: '#161929',
          boxShadow: '0 4px 24px rgba(232,201,109,0.2)',
        }}>
          כ
        </Box>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' }, fontWeight: 800, color: '#E8C96D', lineHeight: 1.1 }}>
          {t.appName}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t.appSub}</Typography>
    </Box>
  )

  // ── 2FA step ─────────────────────────────────────────────────
  if (twoFactorPending) {
    return (
      <Box
        dir={isRtl ? 'rtl' : 'ltr'}
        sx={{
          minHeight: '100vh', bgcolor: 'background.default',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: 'text.primary', p: '48px 24px',
          position: 'relative',
        }}
      >
        <LangBar />
        <Logo />

        <Paper
          sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, p: { xs: 3, sm: '40px 36px' },
            maxWidth: 380, width: '100%',
            border: '1px solid #252840',
            borderRadius: 3.5,
          }}
        >
          <Typography sx={{ fontSize: 40, lineHeight: 1 }}>🔐</Typography>
          <Typography variant="h2" sx={{ fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
            {tf?.title ?? 'Two-Factor Authentication'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
            {tf?.subtitle ?? 'Enter the code from your authenticator app'}
          </Typography>

          <TextField
            fullWidth
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && void handleVerify()}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6,
                style: {
                  fontSize: 28, fontWeight: 700, letterSpacing: 12,
                  textAlign: 'center', padding: '14px 16px',
                },
              },
            }}
            placeholder={tf?.codePlaceholder ?? '000000'}
            autoFocus
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderWidth: 2, borderColor: '#252840' },
                '&.Mui-focused fieldset': { borderColor: '#E8C96D' },
              },
              '& input::placeholder': { letterSpacing: 8, fontSize: 22, color: '#50526A' },
            }}
          />

          {(totpError || error) && (
            <Alert severity="error" sx={{ width: '100%', fontSize: 12 }}>
              {totpError || 'Invalid code'}
            </Alert>
          )}

          <Button
            fullWidth
            variant="contained"
            onClick={() => void handleVerify()}
            disabled={isLoading || totpCode.length !== 6}
            sx={{ py: 1.5, fontSize: 15, fontWeight: 600 }}
          >
            {isLoading ? <CircularProgress size={18} color="inherit" /> : (tf?.verifyBtn ?? 'Verify')}
          </Button>

          <Button
            variant="text"
            onClick={cancelTwoFactor}
            sx={{ color: 'text.secondary', fontSize: 13 }}
          >
            {tf?.backToLogin ?? '← Back'}
          </Button>
        </Paper>
      </Box>
    )
  }

  // ── Main login form ────────────────────────────────────────────
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
      <LangBar />
      <Logo />

      <Paper
        sx={{
          width: '100%',
          maxWidth: { xs: '90vw', sm: 480 },
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 2.5,
          p: { xs: '20px 16px 24px', sm: '28px 32px' },
          border: '1px solid',
          borderColor: alpha(rc, 0.18),
          borderTop: `3px solid ${rc}`,
          borderRadius: 3.5,
          transition: 'border-top-color 0.25s ease',
        }}
      >
        <Typography variant="h2" sx={{ fontSize: 18, fontWeight: 700, textAlign: 'center', letterSpacing: '-0.2px' }}>
          {t.login?.title ?? 'Авторизация'}
        </Typography>

        {/* Email */}
        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleLogin()}
          autoComplete="email"
          sx={{
            '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: rc },
            '& .MuiInputLabel-root.Mui-focused': { color: rc },
          }}
        />

        {/* Password */}
        <TextField
          fullWidth
          label={t.login?.password ?? 'Пароль'}
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleLogin()}
          autoComplete="current-password"
          sx={{
            '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: rc },
            '& .MuiInputLabel-root.Mui-focused': { color: rc },
          }}
        />

        {errMsg && <Alert severity="error">{errMsg}</Alert>}

        <Button
          fullWidth
          variant="outlined"
          onClick={() => void handleLogin()}
          disabled={isLoading || !email || !password}
          sx={{
            py: 1.25,
            fontSize: '1rem',
            fontWeight: 700,
            letterSpacing: '0.3px',
            color: rc,
            borderColor: alpha(rc, 0.3),
            background: alpha(rc, 0.12),
            borderRadius: 2,
            '&:hover:not(:disabled)': {
              background: alpha(rc, 0.22),
              borderColor: alpha(rc, 0.5),
            },
            '&.Mui-disabled': { opacity: 0.45 },
          }}
        >
          {isLoading
            ? <CircularProgress size={18} sx={{ color: rc }} />
            : (t.login?.enterBtn ?? 'Войти')}
        </Button>
      </Paper>
    </Box>
  )
}
