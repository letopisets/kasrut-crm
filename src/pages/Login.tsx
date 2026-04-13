import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, DEMO_USERS } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'
import type { Lang } from '@/store/useLangStore'

const PROFILES: Role[] = ['owner', 'rabbanut', 'mashgiach']
const LANGS: Lang[]    = ['en', 'ru', 'he']

export default function Login() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const setRole  = useAuthStore(s => s.setRole)
  const lang     = useLangStore(s => s.lang)
  const setLang  = useLangStore(s => s.setLang)
  const t        = useLang()

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleLogin = (role: Role) => {
    setRole(role)
    navigate('/dashboard', { replace: true })
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

      <p className="login-heading">Выберите профиль для входа</p>

      <div className="login-cards">
        {PROFILES.map(role => {
          const demo  = DEMO_USERS[role]
          const color = ROLE_COLOR[role]
          return (
            <div
              key={role}
              onClick={() => handleLogin(role)}
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
                onClick={e => { e.stopPropagation(); handleLogin(role) }}
                className="login-card-btn"
              >
                Войти →
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
