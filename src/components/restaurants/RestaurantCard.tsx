import { useNavigate } from 'react-router-dom'
import type { Restaurant } from '@/types'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { STATUS_COLOR } from '@/lib/statusColor'

interface Props { restaurant: Restaurant }

export function RestaurantCard({ restaurant: r }: Props) {
  const navigate   = useNavigate()
  const t          = useLang()
  const perm       = usePermissions()
  const hechsherim = useHechsherStore(s => s.hechsherim)
  const mashgichim = useMashgiachStore(s => s.mashgichim)
  const rabbanuts  = useRabbanutStore(s => s.rabbanuts)

  const hechsher  = hechsherim.find(h => h.id === r.hechsherId)
  const mashgiach = mashgichim.find(m => m.id === r.mashgiachId)
  const rabbanut  = rabbanuts.find(rb => rb.id === r.rabbanutId)

  return (
    <div
      onClick={() => navigate(`/restaurants/${r.id}`)}
      style={{
        background:          'var(--bg-card)',
        border:              '1px solid var(--border)',
        borderLeft:          `3px solid ${STATUS_COLOR[r.status]}`,
        borderRadius:        10,
        padding:             '12px 15px',
        display:             'grid',
        gridTemplateColumns: perm.isOwner
          ? '1fr auto auto auto auto auto'
          : '1fr auto auto auto auto',
        alignItems: 'center',
        gap:        18,
        cursor:     'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Name + address */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{r.address}, {r.city}</div>
      </div>

      {/* Rabbanut — owner only */}
      {perm.isOwner && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>Rabbanut</div>
          <Badge label={rabbanut?.city ?? '—'} color={rabbanut?.color ?? '#888'} small />
        </div>
      )}

      {/* Hechsher */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>{t.restaurants.cols.hechsher}</div>
        {hechsher
          ? <HechsherTag hechsher={hechsher} small />
          : <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>—</span>}
      </div>

      {/* Level */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t.restaurants.cols.level}</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{r.level}</span>
      </div>

      {/* Mashgiach */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{t.restaurants.cols.mashgiach}</div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{mashgiach?.name ?? '—'}</span>
      </div>

      {/* Status badge */}
      <Badge label={t.status[r.status]} color={STATUS_COLOR[r.status]} />
    </div>
  )
}
