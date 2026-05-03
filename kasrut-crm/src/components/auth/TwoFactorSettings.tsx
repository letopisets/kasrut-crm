import { useState } from 'react'
import { useAuthController } from '@/controllers/useAuthController'
import { useLang } from '@/i18n/useLang'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import CloseIcon from '@mui/icons-material/Close'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import LockIcon from '@mui/icons-material/Lock'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'

interface Props { onClose: () => void }
type Step = 'status' | 'setup' | 'disable'

export function TwoFactorSettings({ onClose }: Props) {
  const t  = useLang()
  const tf = t.twoFactor
  const { user, setup2fa, setupLoading, enable2fa, enableLoading, disable2fa, disableLoading } = useAuthController()

  const [step, setStep]           = useState<Step>('status')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret]       = useState('')
  const [code, setCode]           = useState('')
  const [codeError, setCodeError] = useState('')
  const [success, setSuccess]     = useState(false)

  const isEnabled = user?.twoFactorEnabled ?? false

  const handleSetup = async () => {
    try {
      const data = await setup2fa()
      setQrDataUrl(data.qrDataUrl)
      setSecret(data.secret)
      setCode(''); setCodeError('')
      setStep('setup')
    } catch { /* handled by RTK */ }
  }

  const handleEnable = async () => {
    if (code.length !== 6) { setCodeError(tf?.codeMustBe6 ?? 'Enter 6-digit code'); return }
    try {
      setCodeError('')
      await enable2fa(code)
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch { setCodeError(tf?.codeMustBe6 ?? 'Invalid code') }
  }

  const handleDisable = async () => {
    if (code.length !== 6) { setCodeError(tf?.codeMustBe6 ?? 'Enter 6-digit code'); return }
    try {
      setCodeError('')
      await disable2fa(code)
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch { setCodeError(tf?.codeMustBe6 ?? 'Invalid code') }
  }

  const OtpInput = ({ autoFocus = false }: { autoFocus?: boolean }) => (
    <TextField
      fullWidth
      value={code}
      onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
      onKeyDown={e => e.key === 'Enter' && void (step === 'setup' ? handleEnable() : handleDisable())}
      slotProps={{
        htmlInput: {
          inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6,
          style: { fontSize: 24, fontWeight: 700, letterSpacing: 10, textAlign: 'center', padding: '12px 14px' },
        },
      }}
      placeholder={tf?.codePlaceholder ?? '000000'}
      autoFocus={autoFocus}
      sx={{
        '& .MuiOutlinedInput-root': {
          '& fieldset': { borderWidth: 2, borderColor: '#252840' },
          '&.Mui-focused fieldset': { borderColor: '#E8C96D' },
        },
        '& input::placeholder': { letterSpacing: 8, fontSize: 20, color: '#50526A' },
      }}
    />
  )

  if (success) {
    return (
      <Paper data-testid="two-factor-success" sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CheckCircleIcon sx={{ fontSize: 48, color: '#2ECC71' }} />
      </Paper>
    )
  }

  const Header = ({ title }: { title: string }) => (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
      <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
    </Box>
  )

  if (step === 'setup') {
    return (
      <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Header title={tf?.setupTitle ?? 'Set up 2FA'} />
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
          {tf?.setupInstruction}
        </Typography>
        {qrDataUrl && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 1, background: '#fff', borderRadius: 1.5 }}>
            <Box component="img" src={qrDataUrl} alt="QR" sx={{ width: 180, height: 180 }} />
          </Box>
        )}
        {secret && (
          <Box>
            <Typography sx={{ fontSize: 11, color: '#50526A', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
              {tf?.manualSecret ?? 'Manual key:'}
            </Typography>
            <Box sx={{
              fontFamily: 'monospace', fontSize: 12, color: 'text.secondary',
              background: '#1E2235', borderRadius: 1, p: '6px 10px', wordBreak: 'break-all',
            }} data-testid="totp-secret">
              {secret}
            </Box>
          </Box>
        )}
        <OtpInput autoFocus />
        {codeError && <Alert severity="error" sx={{ fontSize: 12 }}>{codeError}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => void handleEnable()}
            disabled={enableLoading || code.length !== 6}
          >
            {enableLoading ? <CircularProgress size={16} color="inherit" /> : (tf?.enableBtn ?? 'Enable 2FA')}
          </Button>
          <Button variant="text" sx={{ color: 'text.secondary' }} onClick={() => setStep('status')}>
            {tf?.backToLogin ?? '← Back'}
          </Button>
        </Box>
      </Paper>
    )
  }

  if (step === 'disable') {
    return (
      <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Header title={tf?.disableTitle ?? 'Disable 2FA'} />
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
          {tf?.disableInstruction}
        </Typography>
        <OtpInput autoFocus />
        {codeError && <Alert severity="error" sx={{ fontSize: 12 }}>{codeError}</Alert>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            onClick={() => void handleDisable()}
            disabled={disableLoading || code.length !== 6}
          >
            {disableLoading ? <CircularProgress size={16} color="inherit" /> : (tf?.disableBtn ?? 'Disable 2FA')}
          </Button>
          <Button variant="text" sx={{ color: 'text.secondary' }} onClick={() => setStep('status')}>
            {tf?.backToLogin ?? '← Back'}
          </Button>
        </Box>
      </Paper>
    )
  }

  return (
    <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Header title={tf?.settingsTitle ?? 'Two-Factor Authentication'} />
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        p: '12px 14px', background: '#1E2235', borderRadius: 1.5,
      }}>
        {isEnabled
          ? <LockIcon sx={{ color: '#2ECC71', fontSize: 22 }} />
          : <LockOpenIcon sx={{ color: '#50526A', fontSize: 22, opacity: 0.5 }} />}
        <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
          {isEnabled ? (tf?.enabled ?? '2FA is enabled') : (tf?.disabled ?? '2FA is disabled')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {!isEnabled && (
          <Button
            variant="contained"
            onClick={() => void handleSetup()}
            disabled={setupLoading}
          >
            {setupLoading ? <CircularProgress size={16} color="inherit" /> : (tf?.enableBtn ?? 'Enable 2FA')}
          </Button>
        )}
        {isEnabled && (
          <Button
            variant="outlined"
            color="error"
            onClick={() => { setCode(''); setCodeError(''); setStep('disable') }}
          >
            {tf?.disableBtn ?? 'Disable 2FA'}
          </Button>
        )}
      </Box>
    </Paper>
  )
}
