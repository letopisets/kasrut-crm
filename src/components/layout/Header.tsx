import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useLangStore } from '@/store/useLangStore'
import { useLang } from '@/i18n/useLang'
import { usePermissions } from '@/hooks/usePermissions'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { Role } from '@/types'
import type { Lang } from '@/store/useLangStore'

const LANGS: Lang[] = ['en', 'ru', 'he']
const ROLES: Role[] = ['owner', 'rabbanut', 'mashgiach']

export function Header() {
  const navigate      = useNavigate()
  const { pathname }  = useLocation()
  const activeTab     = pathname.split('/')[1] || 'dashboard'

  const role    = useAuthStore(s => s.role)
  const setRole = useAuthStore(s => s.setRole)
  const lang    = useLangStore(s => s.lang)
  const setLang = useLangStore(s => s.setLang)
  const t       = useLang()
  const perm    = usePermissions()
  const rc      = ROLE_COLOR[role]

  const handleRoleSwitch = (r: Role) => {
    setRole(r)
    navigate('/dashboard')
  }

  const NAV_KEYS = Object.keys(t.nav) as Array<keyof typeof t.nav>

  return (
    <header style={{
      background:     'var(--bg-card)',
      borderBottom:   '1px solid var(--border)',
      padding:        '0 22px',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'space-between',
      height:         56,
      position:       'sticky',
      top:            0,
      zIndex:         100,
      gap:            12,
      flexShrink:     0,
    }}>

      {/* ── Logo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7,
          background: 'linear-gradient(135deg, var(--gold-dim), var(--gold))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 900, color: 'var(--bg-card)',
        }}>כ</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{t.appName}</div>
          <div style={{ fontSize: 9, color: 'var(--text-disabled)' }}>{t.appSub}</div>
        </div>
      </div>

      {/* ── Nav ── */}
      <nav style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
        {NAV_KEYS.map(id => {
          const allowed = perm.tabs.includes(id)
          const active  = activeTab === id
          return (
            <button
              key={id}
              onClick={() => allowed && navigate(`/${id}`)}
              style={{
                background:   active ? `${rc}12` : 'transparent',
                border:       active ? `1px solid ${rc}35` : '1px solid transparent',
                color:        !allowed ? 'var(--text-disabled)' : active ? rc : 'var(--text-muted)',
                padding:      '5px 10px',
                borderRadius: 6,
                cursor:       allowed ? 'pointer' : 'not-allowed',
                fontSize:     11,
                fontWeight:   active ? 600 : 400,
                transition:   'all 0.15s',
              }}
            >
              {t.nav[id]}
            </button>
          )
        })}
      </nav>

      {/* ── Controls ── */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>

        {/* Role switcher (demo) */}
        <div style={{
          display: 'flex', background: 'var(--bg-elevated)',
          borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          {ROLES.map(r => {
            const c = ROLE_COLOR[r]
            return (
              <button
                key={r}
                onClick={() => handleRoleSwitch(r)}
                style={{
                  background:  role === r ? `${c}22` : 'transparent',
                  border:      'none',
                  borderRight: '1px solid var(--border)',
                  color:       role === r ? c : 'var(--text-muted)',
                  padding:     '5px 10px',
                  cursor:      'pointer',
                  fontSize:    10,
                  fontWeight:  role === r ? 700 : 400,
                }}
              >
                {t.roles[r]}
              </button>
            )
          })}
        </div>

        {/* Lang switcher */}
        <div style={{
          display: 'flex', background: 'var(--bg-elevated)',
          borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden',
        }}>
          {LANGS.map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                background: lang === l ? 'rgba(232,201,109,0.07)' : 'transparent',
                border:     'none',
                color:      lang === l ? 'var(--gold)' : 'var(--text-muted)',
                padding:    '5px 9px',
                cursor:     'pointer',
                fontSize:   10,
                fontWeight: lang === l ? 700 : 400,
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
