import { useNavigate } from 'react-router-dom'
import { useRestaurants } from '@/hooks/useRestaurants'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { daysUntil } from '@/lib/daysUntil'
import { STATUS_COLOR } from '@/lib/statusColor'

export function ExpiringList() {
  const navigate    = useNavigate()
  const t           = useLang()
  const perm        = usePermissions()
  const restaurants = useRestaurants()
  const hechsherim  = useHechsherStore(s => s.hechsherim)
  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)

  const expiring = restaurants.filter(r => r.status !== 'ok')

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#E8C96D', marginBottom: 12 }}>
        {t.expiring}
      </div>

      {expiring.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-disabled)', padding: '12px 0' }}>—</div>
      )}

      {expiring.map(r => {
        const hechsher = hechsherim.find(h => h.id === r.hechsherId)
        const rabbanut = rabbanuts.find(rb => rb.id === r.rabbanutId)
        const days     = daysUntil(r.expires)

        return (
          <div
            key={r.id}
            onClick={() => navigate('/restaurants')}
            style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              padding:        '7px 0',
              borderBottom:   '1px solid var(--border-subtle)',
              cursor:         'pointer',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                {hechsher && <HechsherTag hechsher={hechsher} small />}
                {perm.isOwner && rabbanut && (
                  <Badge label={rabbanut.city} color={rabbanut.color} small />
                )}
              </div>
            </div>
            <Badge
              label={days <= 0 ? t.today : `${days} ${t.days}`}
              color={STATUS_COLOR[r.status]}
            />
          </div>
        )
      })}
    </div>
  )
}
