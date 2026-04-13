import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { usePermissions } from '@/hooks/usePermissions'
import { Badge } from '@/components/ui'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Lang } from '@/store/useLangStore'

const LANGS: Lang[] = ['en', 'ru', 'he']

export function Header() {
  const navigate     = useNavigate()
  const { pathname } = useLocation()
  const activeTab    = pathname.split('/')[1] || 'dashboard'

  const role   = useAuthStore(s => s.role)
  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const lang   = useLangStore(s => s.lang)
  const setLang= useLangStore(s => s.setLang)
  const t      = useLang()
  const perm   = usePermissions()
  const rc     = ROLE_COLOR[role]

  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  const NAV_KEYS = (Object.keys(t.nav) as Array<keyof typeof t.nav>)
    .filter(id => perm.tabs.includes(id))

  return (
    <>
      <header className="app-header">

        <div className="header-logo">
          <div className="header-logo-icon">כ</div>
          <div>
            <div className="header-logo-name">{t.appName}</div>
            <div className="header-logo-sub">{t.appSub}</div>
          </div>
        </div>

        <nav className="app-nav">
          {NAV_KEYS.map(id => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => navigate(`/${id}`)}
                className={active ? 'nav-btn nav-btn--active' : 'nav-btn'}
                style={active ? { '--c': rc } as React.CSSProperties : undefined}
              >
                {t.nav[id]}
              </button>
            )
          })}
        </nav>

        <div className="header-right">
          <div className="header-user">
            <div className="header-user-info">
              <div className="header-user-name">{user?.name}</div>
              <div className="header-user-email">{user?.email}</div>
            </div>
            <Badge label={t.roles[role]} color={rc} small />
          </div>

          <div className="divider-v" />

          <div className="lang-switcher">
            {LANGS.map(l => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={lang === l ? 'lang-btn lang-btn--active' : 'lang-btn'}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          <button onClick={handleLogout} title={t.logout} className="btn-ghost">⏻</button>

          <button
            className={menuOpen ? 'hamburger-btn hamburger-btn--open' : 'hamburger-btn'}
            onClick={() => setMenuOpen(v => !v)}
            aria-label="Menu"
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
        </div>
      </header>

      {menuOpen && (
        <>
          <div className="mobile-nav-overlay" onClick={() => setMenuOpen(false)} />
          <nav className="mobile-nav" style={{ '--c': rc } as React.CSSProperties}>
            {NAV_KEYS.map(id => {
              const active = activeTab === id
              return (
                <button
                  key={id}
                  onClick={() => { navigate(`/${id}`); setMenuOpen(false) }}
                  className={active ? 'mobile-nav-btn mobile-nav-btn--active' : 'mobile-nav-btn'}
                  style={active ? { '--c': rc } as React.CSSProperties : undefined}
                >
                  {t.nav[id]}
                </button>
              )
            })}
          </nav>
        </>
      )}
    </>
  )
}
