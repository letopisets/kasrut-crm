import { useEffect, useState } from 'react'
import { useAuthController } from '@/controllers/useAuthController'
import { useLang } from '@/i18n/useLang'
import { isTooManyAttempts } from '@/lib/isTooManyAttempts'
import { isInvalidPasswordError, isTwoFactorRequiredForRoleError } from '@/lib/twoFactorErrors'
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

interface Props {
  onClose: () => void
  // Forced setup (REQUIRE_OWNER_2FA): no way to dismiss the panel; onClose
  // runs once the backup codes are acknowledged.
  forced?: boolean
}
type Step = 'status' | 'setup' | 'disable'

function TwoFactorHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
      {onClose && <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>}
    </Box>
  )
}

// One-time backup codes, shown once right after 2FA is enabled.
function BackupCodes({
  codes,
  onDone,
  closable,
}: {
  codes: string[]
  onDone: () => void
  closable: boolean
}) {
  const tf = useLang().twoFactor
  const [copied, setCopied] = useState(false)

  // The codes live only in memory and cannot be shown again: ask before a
  // reload or tab close throws them away unsaved.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
    } catch { /* no clipboard access: the codes stay selectable */ }
  }

  return (
    <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <TwoFactorHeader title={tf?.backupCodesTitle ?? 'Save your backup codes'} onClose={closable ? onDone : undefined} />
      <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
        {tf?.backupCodesInstruction}
      </Typography>
      <Box
        data-testid="backup-codes"
        dir="ltr"
        sx={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 16px',
          fontFamily: 'monospace', fontSize: 14, letterSpacing: '1px', textAlign: 'center',
          background: '#1E2235', borderRadius: 1.5, p: '12px 14px', userSelect: 'all',
        }}
      >
        {codes.map(code => <Box key={code} component="span">{code}</Box>)}
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Button variant="outlined" onClick={() => void copy()}>
          {copied ? (tf?.backupCodesCopied ?? 'Copied') : (tf?.backupCodesCopy ?? 'Copy codes')}
        </Button>
        <Button variant="contained" onClick={onDone}>
          {tf?.backupCodesDone ?? 'I have saved these codes'}
        </Button>
      </Box>
    </Paper>
  )
}

function OtpInput({
  value,
  placeholder,
  autoFocus = false,
  onChange,
  onSubmit,
}: {
  value: string
  placeholder: string
  autoFocus?: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <TextField
      fullWidth
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      onKeyDown={e => e.key === 'Enter' && onSubmit()}
      slotProps={{
        htmlInput: {
          inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6,
          style: { fontSize: 24, fontWeight: 700, letterSpacing: 10, textAlign: 'center', padding: '12px 14px' },
        },
      }}
      placeholder={placeholder}
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
}

export function TwoFactorSettings({ onClose, forced = false }: Props) {
  const t  = useLang()
  const tf = t.twoFactor
  const tooManyAttempts = t.login?.tooManyAttempts ?? 'Too many attempts. Try again later.'
  const {
    user, setup2fa, setupLoading, enable2fa, enableLoading, disable2fa, disableLoading,
    backupCodes, acknowledgeBackupCodes,
  } = useAuthController()
  const close = forced ? undefined : onClose

  const [step, setStep]           = useState<Step>('status')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [secret, setSecret]       = useState('')
  const [code, setCode]           = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [codeError, setCodeError] = useState('')
  const [setupError, setSetupError] = useState('')
  const [success, setSuccess]     = useState(false)

  const isEnabled = user?.twoFactorEnabled ?? false

  const handleSetup = async () => {
    try {
      setSetupError('')
      const data = await setup2fa(currentPassword)
      setQrDataUrl(data.qrDataUrl)
      setSecret(data.secret)
      setCode(''); setCodeError('')
      setStep('setup')
    } catch (err) {
      // The password re-check shares the sign-in lockout.
      if (isTooManyAttempts(err)) setSetupError(tooManyAttempts)
      else if (isInvalidPasswordError(err)) setSetupError(tf?.wrongPassword ?? 'Wrong password')
    }
  }

  const handleEnable = async () => {
    if (code.length !== 6) { setCodeError(tf?.codeMustBe6 ?? 'Enter 6-digit code'); return }
    try {
      setCodeError('')
      const result = await enable2fa(code)
      // The store now holds the backup codes, which replace this panel.
      if (!result.backupCodes?.length) {
        setSuccess(true)
        setTimeout(onClose, 1200)
      }
    } catch (err) {
      // Code guesses share the per-account 2FA lockout.
      setCodeError(isTooManyAttempts(err) ? tooManyAttempts : (tf?.codeMustBe6 ?? 'Invalid code'))
    }
  }

  const handleDisable = async () => {
    if (code.length !== 6) { setCodeError(tf?.codeMustBe6 ?? 'Enter 6-digit code'); return }
    try {
      setCodeError('')
      await disable2fa(code)
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch (err) {
      if (isTwoFactorRequiredForRoleError(err)) {
        setCodeError(tf?.requiredForRole ?? 'Two-factor authentication is mandatory for your role.')
        return
      }
      setCodeError(isTooManyAttempts(err) ? tooManyAttempts : (tf?.codeMustBe6 ?? 'Invalid code'))
    }
  }

  if (backupCodes?.length) {
    return (
      <BackupCodes
        codes={backupCodes}
        closable={!forced}
        onDone={() => { acknowledgeBackupCodes(); onClose() }}
      />
    )
  }

  if (success) {
    return (
      <Paper data-testid="two-factor-success" sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CheckCircleIcon sx={{ fontSize: 48, color: '#2ECC71' }} />
      </Paper>
    )
  }

  if (step === 'setup') {
    return (
      <Paper sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <TwoFactorHeader title={tf?.setupTitle ?? 'Set up 2FA'} onClose={close} />
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
        <OtpInput
          value={code}
          placeholder={tf?.codePlaceholder ?? '000000'}
          autoFocus
          onChange={setCode}
          onSubmit={() => void handleEnable()}
        />
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
        <TwoFactorHeader title={tf?.disableTitle ?? 'Disable 2FA'} onClose={close} />
        <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
          {tf?.disableInstruction}
        </Typography>
        <OtpInput
          value={code}
          placeholder={tf?.codePlaceholder ?? '000000'}
          autoFocus
          onChange={setCode}
          onSubmit={() => void handleDisable()}
        />
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
      <TwoFactorHeader title={tf?.settingsTitle ?? 'Two-Factor Authentication'} onClose={close} />
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
          <>
            <TextField
              fullWidth
              type="password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              label={t.login?.password ?? 'Current password'}
              autoComplete="current-password"
            />
            {setupError && <Alert severity="error" sx={{ fontSize: 12 }}>{setupError}</Alert>}
            <Button
              variant="contained"
              onClick={() => void handleSetup()}
              disabled={setupLoading || currentPassword.length === 0}
            >
              {setupLoading ? <CircularProgress size={16} color="inherit" /> : (tf?.enableBtn ?? 'Enable 2FA')}
            </Button>
          </>
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
