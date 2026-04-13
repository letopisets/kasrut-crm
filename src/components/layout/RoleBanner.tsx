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

  const myRabbanut  = rabbanuts.find(rb => rb.id === user?.rabbanutId)
  const myMashgiach = mashgichim.find(m => m.id === user?.id)
  const myRestCount = myMashgiach
    ? restaurants.filter(r => r.mashgiachId === myMashgiach.id).length
    : 0

  return (
    <div className="role-banner" style={{ '--c': rc } as React.CSSProperties}>

      <div className="role-banner-info" style={{ color: rc }}>
        <span className="role-banner-name">{t.roles[role]}</span>
        <span className="role-banner-dot">·</span>
        <span className="role-banner-desc">{t.roleDesc[role]}</span>

        {role === 'rabbanut' && myRabbanut && (
          <>
            <span className="role-banner-dot">·</span>
            <span className="role-banner-extra">{myRabbanut.name}</span>
          </>
        )}

        {role === 'mashgiach' && myMashgiach && (
          <>
            <span className="role-banner-dot">·</span>
            <span className="role-banner-extra">
              {myMashgiach.name} · {t.myEstablishments}: {myRestCount}
            </span>
          </>
        )}
      </div>

      {role === 'owner' && (
        <div className="role-banner-filters">
          <span className="role-banner-label">{t.allRabbanuts}:</span>
          <button
            onClick={() => setRabbanutFilter('')}
            className={rabbanutFilter === '' ? 'filter-tab filter-tab--active' : 'filter-tab'}
            style={rabbanutFilter === '' ? { '--c': rc } as React.CSSProperties : undefined}
          >
            All
          </button>
          {rabbanuts.map(rb => (
            <button
              key={rb.id}
              onClick={() => setRabbanutFilter(rb.id)}
              className={rabbanutFilter === rb.id ? 'filter-tab filter-tab--active' : 'filter-tab'}
              style={rabbanutFilter === rb.id ? { '--c': rb.color } as React.CSSProperties : undefined}
            >
              {rb.city}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
