import { useState } from 'react'
import { useAuthController } from '@/controllers/useAuthController'
import { useLang } from '@/i18n/useLang'

interface Props {
  onClose: () => void
}

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
      setCode('')
      setCodeError('')
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
    } catch {
      setCodeError(tf?.codeMustBe6 ?? 'Invalid code')
    }
  }

  const handleDisableStep = () => {
    setCode('')
    setCodeError('')
    setStep('disable')
  }

  const handleDisable = async () => {
    if (code.length !== 6) { setCodeError(tf?.codeMustBe6 ?? 'Enter 6-digit code'); return }
    try {
      setCodeError('')
      await disable2fa(code)
      setSuccess(true)
      setTimeout(onClose, 1200)
    } catch {
      setCodeError(tf?.codeMustBe6 ?? 'Invalid code')
    }
  }

  if (success) {
    return (
      <div className="tf-modal">
        <div className="tf-success">✓</div>
      </div>
    )
  }

  if (step === 'setup') {
    return (
      <div className="tf-modal">
        <div className="tf-modal-header">
          <h3>{tf?.setupTitle ?? 'Set up 2FA'}</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <p className="tf-instruction">{tf?.setupInstruction}</p>

        {qrDataUrl && (
          <div className="tf-qr-wrapper">
            <img src={qrDataUrl} alt="QR Code" className="tf-qr" />
          </div>
        )}

        {secret && (
          <div className="tf-secret-row">
            <span className="tf-secret-label">{tf?.manualSecret ?? 'Manual key:'}</span>
            <code className="tf-secret-code">{secret}</code>
          </div>
        )}

        <input
          className="totp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder={tf?.codePlaceholder ?? '000000'}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && void handleEnable()}
          autoFocus
        />

        {codeError && <p className="totp-error">{codeError}</p>}

        <div className="tf-actions">
          <button
            className="btn-primary"
            onClick={() => void handleEnable()}
            disabled={enableLoading || code.length !== 6}
          >
            {enableLoading ? '...' : (tf?.enableBtn ?? 'Enable 2FA')}
          </button>
          <button className="btn-ghost" onClick={() => setStep('status')}>
            {tf?.backToLogin ?? '← Back'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'disable') {
    return (
      <div className="tf-modal">
        <div className="tf-modal-header">
          <h3>{tf?.disableTitle ?? 'Disable 2FA'}</h3>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <p className="tf-instruction">{tf?.disableInstruction}</p>

        <input
          className="totp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder={tf?.codePlaceholder ?? '000000'}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => e.key === 'Enter' && void handleDisable()}
          autoFocus
        />

        {codeError && <p className="totp-error">{codeError}</p>}

        <div className="tf-actions">
          <button
            className="btn-danger"
            onClick={() => void handleDisable()}
            disabled={disableLoading || code.length !== 6}
          >
            {disableLoading ? '...' : (tf?.disableBtn ?? 'Disable 2FA')}
          </button>
          <button className="btn-ghost" onClick={() => setStep('status')}>
            {tf?.backToLogin ?? '← Back'}
          </button>
        </div>
      </div>
    )
  }

  // status step
  return (
    <div className="tf-modal">
      <div className="tf-modal-header">
        <h3>{tf?.settingsTitle ?? 'Two-Factor Authentication'}</h3>
        <button className="btn-ghost" onClick={onClose}>✕</button>
      </div>

      <div className="tf-status-row">
        <span className={isEnabled ? 'tf-status tf-status--on' : 'tf-status tf-status--off'}>
          {isEnabled ? '🔒' : '🔓'}
        </span>
        <span className="tf-status-text">
          {isEnabled ? (tf?.enabled ?? '2FA is enabled') : (tf?.disabled ?? '2FA is disabled')}
        </span>
      </div>

      <div className="tf-actions">
        {!isEnabled && (
          <button
            className="btn-primary"
            onClick={() => void handleSetup()}
            disabled={setupLoading}
          >
            {setupLoading ? '...' : (tf?.enableBtn ?? 'Enable 2FA')}
          </button>
        )}
        {isEnabled && (
          <button className="btn-danger" onClick={handleDisableStep}>
            {tf?.disableBtn ?? 'Disable 2FA'}
          </button>
        )}
      </div>
    </div>
  )
}
