import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthController } from '@/controllers/useAuthController'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'
import type { Lang } from '@/store/useLangStore'

const DEMO_EMAILS: Record<Role, string> = {
  owner:     'owner@kashrut.il',
  rabbanut:  'admin@jer.il',
  mashgiach: 'cohen@jer.il',
}

const DEMO_INFO: Record<Role, { name: string; email: string }> = {
  owner:     { name: 'System Owner',    email: 'owner@kashrut.il' },
  rabbanut:  { name: 'Admin Jerusalem', email: 'admin@jer.il' },
  mashgiach: { name: 'Р. Коэн',         email: 'cohen@jer.il' },
}

const PROFILES: Role[] = ['owner', 'rabbanut', 'mashgiach']
const LANGS: Lang[]    = ['en', 'ru', 'he']

export default function Login() {
  const navigate  = useNavigate()
  const {
    user, login, isLoading,
    twoFactorPending, verify2fa, cancelTwoFactor, error,
  } = useAuthController()
  const lang    = useLangStore(s => s.lang)
  const setLang = useLangStore(s => s.setLang)
  const t       = useLang()
  const tf      = t.twoFactor

  const [totpCode, setTotpCode]   = useState('')
  const [totpError, setTotpError] = useState('')

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // Reset TOTP state when entering 2FA step
  useEffect(() => {
    if (twoFactorPending) { setTotpCode(''); setTotpError('') }
  }, [twoFactorPending])

  const handleLogin = (role: Role) => {
    void login(DEMO_EMAILS[role], 'password')
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

  if (twoFactorPending) {
    return (
      <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="login-page">
        <div className="login-lang">
          {LANGS.map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={lang === l ? 'filter-btn filter-btn--active' : 'filter-btn'}
              style={lang === l ? { '--c': 'var(--gold)' } as React.CSSProperties : undefined}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="login-logo">
          <div className="login-logo-icon">כ</div>
          <h1 className="login-logo-name">{t.appName}</h1>
          <p className="login-logo-sub">{t.appSub}</p>
        </div>

        <div className="totp-card">
          <div className="totp-card-icon">🔐</div>
          <h2 className="totp-card-title">{tf?.title ?? 'Two-Factor Authentication'}</h2>
          <p className="totp-card-sub">{tf?.subtitle ?? 'Enter the code from your authenticator app'}</p>

          <input
            className="totp-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={tf?.codePlaceholder ?? '000000'}
            value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && void handleVerify()}
            autoFocus
          />

          {(totpError || error) && (
            <p className="totp-error">{totpError || 'Invalid code'}</p>
          )}

          <button
            className="btn-primary totp-verify-btn"
            onClick={() => void handleVerify()}
            disabled={isLoading || totpCode.length !== 6}
          >
            {isLoading ? '...' : (tf?.verifyBtn ?? 'Verify')}
          </button>

          <button className="btn-ghost totp-back-btn" onClick={cancelTwoFactor}>
            {tf?.backToLogin ?? '← Back'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="login-page">

      <div className="login-lang">
        {LANGS.map(l => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={lang === l ? 'filter-btn filter-btn--active' : 'filter-btn'}
            style={lang === l ? { '--c': 'var(--gold)' } as React.CSSProperties : undefined}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="login-logo">
        <div className="login-logo-icon">כ</div>
        <h1 className="login-logo-name">{t.appName}</h1>
        <p className="login-logo-sub">{t.appSub}</p>
      </div>

      <p className="login-heading">{t.loginHeading ?? 'Select profile'}</p>

      <div className="login-cards">
        {PROFILES.map(role => {
          const demo  = DEMO_INFO[role]
          const color = ROLE_COLOR[role]
          return (
            <div
              key={role}
              onClick={() => !isLoading && handleLogin(role)}
              className="login-card"
              style={{ '--c': color } as React.CSSProperties}
            >
              <Badge label={t.roles[role]} color={color} />

              <div className="login-card-body">
                <div className="login-card-name">{demo.name}</div>
                <div className="login-card-email">{demo.email}</div>
              </div>

              <div className="login-card-desc">{t.roleDesc[role]}</div>

              <button
                onClick={e => { e.stopPropagation(); if (!isLoading) handleLogin(role) }}
                className="login-card-btn"
                disabled={isLoading}
              >
                {isLoading ? '...' : 'Войти →'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
