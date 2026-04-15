import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthController } from '@/controllers/useAuthController'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'
import type { Lang } from '@/store/useLangStore'

const DEMO_EMAILS: Record<Role, string> = {
  owner:     'owner@kashrut.il',
  rabbanut:  'admin@jer.il',
  mashgiach: 'cohen@jer.il',
}

const PROFILES: Role[] = ['owner', 'rabbanut', 'mashgiach']
const LANGS: Lang[]    = ['en', 'ru', 'he']

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

  const [role,     setRole]     = useState<Role>('owner')
  const [email,    setEmail]    = useState(DEMO_EMAILS['owner'])
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError,setTotpError]= useState('')

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  useEffect(() => {
    if (twoFactorPending) { setTotpCode(''); setTotpError('') }
  }, [twoFactorPending])

  const handleRoleChange = (r: Role) => {
    setRole(r)
    setEmail(DEMO_EMAILS[r])
  }

  const handleLogin = async () => {
    if (!email || !password) return
    try { await login(email, password) } catch { /* error shown via RTK state */ }
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

  const isRtl    = lang === 'he'
  const errMsg   = extractError(error)
  const roleColor = ROLE_COLOR[role]

  const LangBar = () => (
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
  )

  const Logo = () => (
    <div className="login-logo">
      <div className="login-logo-brand">
        <div className="login-logo-icon">כ</div>
        <h1 className="login-logo-name">{t.appName}</h1>
      </div>
      <p className="login-logo-sub">{t.appSub}</p>
    </div>
  )

  // ── 2FA step ──────────────────────────────────────────────────
  if (twoFactorPending) {
    return (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="login-page">
        <LangBar />
        <Logo />
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

  // ── Main login form ────────────────────────────────────────────
  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="login-page">
      <LangBar />
      <Logo />

      <div className="lf-card" style={{ '--c': roleColor } as React.CSSProperties}>
        <h2 className="lf-title">{t.login?.title ?? 'Авторизация'}</h2>

        {/* Role selector */}
        <div className="lf-group">
          <label className="lf-label">{t.login?.roleLabel ?? 'Выберите роль'}</label>
          <div className="lf-select-wrap">
            <select
              className="lf-select"
              value={role}
              onChange={e => handleRoleChange(e.target.value as Role)}
            >
              {PROFILES.map(r => (
                <option key={r} value={r}>{t.roles[r]}</option>
              ))}
            </select>
            <span className="lf-select-arrow">▾</span>
          </div>
          <p className="lf-role-desc" style={{ '--c': roleColor } as React.CSSProperties}>
            {t.roleDesc[role]}
          </p>
        </div>

        {/* Email */}
        <div className="lf-group">
          <label className="lf-label">Email</label>
          <input
            className="lf-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleLogin()}
            autoComplete="email"
          />
        </div>

        {/* Password */}
        <div className="lf-group">
          <label className="lf-label">{t.login?.password ?? 'Пароль'}</label>
          <input
            className="lf-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && void handleLogin()}
            autoComplete="current-password"
          />
        </div>

        {errMsg && <p className="lf-error">{errMsg}</p>}

        <button
          className="lf-btn"
          onClick={() => void handleLogin()}
          disabled={isLoading || !email || !password}
        >
          {isLoading ? '...' : (t.login?.enterBtn ?? 'Войти')}
        </button>
      </div>
    </div>
  )
}
