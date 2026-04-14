import { useEffect } from 'react'
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
  const { user, login, isLoading } = useAuthController()
  const lang      = useLangStore(s => s.lang)
  const setLang   = useLangStore(s => s.setLang)
  const t         = useLang()

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleLogin = (role: Role) => {
    void login(DEMO_EMAILS[role], 'password')
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

      <p className="login-heading">{t.loginHeading ?? 'Выберите профиль для входа'}</p>

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
