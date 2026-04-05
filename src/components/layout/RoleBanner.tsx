import { useAuthStore } from '@/store/useAuthStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useLang } from '@/i18n/useLang'
import { ROLE_COLOR } from '@/lib/statusColor'

export function RoleBanner() {
  const role              = useAuthStore(s => s.role)
  const user              = useAuthStore(s => s.user)
  const rabbanutFilter    = useAuthStore(s => s.rabbanutFilter)
  const setRabbanutFilter = useAuthStore(s => s.setRabbanutFilter)

  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)
  const mashgichim  = useMashgiachStore(s => s.mashgichim)
  const restaurants = useRestaurantStore(s => s.restaurants)
  const t           = useLang()
  const rc          = ROLE_COLOR[role]

  // Context info per role
  const myRabbanut  = rabbanuts.find(rb => rb.id === user?.rabbanutId)
  const myMashgiach = mashgichim.find(m => m.id === user?.id)
  const myRestCount = myMashgiach
    ? restaurants.filter(r => r.mashgiachId === myMashgiach.id).length
    : 0

  return (
    <div style={{
      background:   `${rc}0C`,
      borderBottom: `1px solid ${rc}20`,
      padding:      '5px 22px',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'space-between',
      flexShrink:   0,
      minHeight:    32,
    }}>
      {/* Left — role context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: rc }}>
        <span style={{ fontWeight: 700 }}>{t.roles[role]}</span>
        <span style={{ color: 'var(--text-disabled)' }}>·</span>
        <span style={{ color: 'var(--text-muted)' }}>{t.roleDesc[role]}</span>

        {role === 'rabbanut' && myRabbanut && (
          <>
            <span style={{ color: 'var(--text-disabled)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>{myRabbanut.name}</span>
          </>
        )}

        {role === 'mashgiach' && myMashgiach && (
          <>
            <span style={{ color: 'var(--text-disabled)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {myMashgiach.name} · {t.myEstablishments}: {myRestCount}
            </span>
          </>
        )}
      </div>

      {/* Right — owner rabbanut filter */}
      {role === 'owner' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t.allRabbanuts}:</span>
          <button
            onClick={() => setRabbanutFilter('')}
            style={{
              background:   rabbanutFilter === '' ? `${rc}18` : 'transparent',
              border:       rabbanutFilter === '' ? `1px solid ${rc}40` : '1px solid transparent',
              color:        rabbanutFilter === '' ? rc : 'var(--text-muted)',
              padding:      '2px 9px',
              borderRadius: 5,
              cursor:       'pointer',
              fontSize:     10,
              fontWeight:   rabbanutFilter === '' ? 700 : 400,
            }}
          >
            All
          </button>
          {rabbanuts.map(rb => (
            <button
              key={rb.id}
              onClick={() => setRabbanutFilter(rb.id)}
              style={{
                background:   rabbanutFilter === rb.id ? `${rb.color}18` : 'transparent',
                border:       rabbanutFilter === rb.id ? `1px solid ${rb.color}40` : '1px solid transparent',
                color:        rabbanutFilter === rb.id ? rb.color : 'var(--text-muted)',
                padding:      '2px 9px',
                borderRadius: 5,
                cursor:       'pointer',
                fontSize:     10,
                fontWeight:   rabbanutFilter === rb.id ? 700 : 400,
              }}
            >
              {rb.city}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
