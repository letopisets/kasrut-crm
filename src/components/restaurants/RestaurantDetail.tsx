import type { Restaurant } from '@/types'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { HechsherBlock } from './HechsherBlock'
import { STATUS_COLOR } from '@/lib/statusColor'

const CARD = {
  background:   'var(--bg-card)',
  border:       '1px solid var(--border)',
  borderRadius: 12,
  padding:      20,
} as const

const RESULT_COLOR: Record<string, string> = {
  pending: '#888',
  open:    '#F39C12',
  pass:    '#2ECC71',
  fail:    '#E74C3C',
}

interface Props { restaurant: Restaurant }

export function RestaurantDetailContent({ restaurant: r }: Props) {
  const t          = useLang()
  const perm       = usePermissions()
  const hechsherim = useHechsherStore(s => s.hechsherim)
  const mashgichim = useMashgiachStore(s => s.mashgichim)
  const inspections= useInspectionStore(s =>
    s.inspections.filter(i => i.restaurantId === r.id)
  )

  const hechsher  = hechsherim.find(h => h.id === r.hechsherId)
  const mashgiach = mashgichim.find(m => m.id === r.mashgiachId)

  const infoRows = [
    [t.restaurants.cols.level,    r.level],
    [t.restaurants.cols.mashgiach,mashgiach?.name ?? '—'],
    ['Kitniyot',                  r.kitniyot],
    [t.restaurants.cols.expires,  r.expires],
    ['Last inspection',           r.lastInspection ?? '—'],
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>

      {/* ── Left column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Main info */}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 700 }}>{r.name}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{r.address}, {r.city}</p>
            </div>
            <Badge label={t.status[r.status]} color={STATUS_COLOR[r.status]} />
          </div>

          {infoRows.map(([k, v]) => (
            <div key={k} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{v}</span>
            </div>
          ))}

          {r.notes && (
            <div style={{
              marginTop: 10, padding: '7px 10px',
              background: 'var(--bg-elevated)', borderRadius: 6,
              fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic',
            }}>
              {r.notes}
            </div>
          )}
        </div>

        {/* Hechsher block */}
        {hechsher && <HechsherBlock hechsher={hechsher} />}
      </div>

      {/* ── Right column ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Inspections */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#3498DB', marginBottom: 10 }}>
            🔍 {t.inspections.title}
          </div>

          {inspections.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-disabled)' }}>—</div>
          )}

          {inspections.map(ins => {
            const m = mashgichim.find(m => m.id === ins.mashgiachId)
            return (
              <div key={ins.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)' }}>{ins.date}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{m?.name ?? '—'}</div>
                </div>
                <Badge label={t.inspections.result[ins.result]} color={RESULT_COLOR[ins.result]} small />
              </div>
            )
          })}
        </div>

        {/* Actions */}
        {perm.canEdit && (
          <div style={CARD}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', marginBottom: 10 }}>
              {t.restaurants.actions}
            </div>
            {t.restaurants.actionList.map((action, i) => (
              <button
                key={i}
                style={{
                  display:      'block',
                  width:        '100%',
                  marginBottom: 6,
                  background:   i === 3 ? 'rgba(231,76,60,0.06)' : 'var(--bg-elevated)',
                  border:       i === 3 ? '1px solid rgba(231,76,60,0.25)' : '1px solid var(--border)',
                  color:        i === 3 ? 'var(--status-crit)' : 'var(--text-secondary)',
                  padding:      '7px 10px',
                  borderRadius: 6,
                  cursor:       'pointer',
                  fontSize:     11,
                  textAlign:    'left',
                }}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
