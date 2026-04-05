import { useState } from 'react'
import { useRestaurants } from '@/hooks/useRestaurants'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { RestaurantList } from '@/components/restaurants/RestaurantList'
import { RestaurantForm } from '@/components/restaurants/RestaurantForm'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { CertStatus } from '@/types'

type Filter = 'all' | CertStatus

const FILTER_KEYS: Filter[] = ['all', 'ok', 'warning', 'critical']

export default function Restaurants() {
  const [filter,   setFilter]   = useState<Filter>('all')
  const [showForm, setShowForm] = useState(false)

  const t           = useLang()
  const perm        = usePermissions()
  const role        = useAuthStore(s => s.role)
  const rc          = ROLE_COLOR[role]
  const restaurants = useRestaurants()

  const filtered = filter === 'all'
    ? restaurants
    : restaurants.filter(r => r.status === filter)

  return (
    <div>
      {/* ── Header ── */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
        marginBottom:   16,
      }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
            {t.restaurants.title}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{t.restaurants.sub}</p>
        </div>

        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          {/* Status filters */}
          <div style={{ display: 'flex', gap: 3 }}>
            {FILTER_KEYS.map((key, i) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  background:   filter === key ? `${rc}10` : 'transparent',
                  border:       filter === key ? `1px solid ${rc}40` : '1px solid var(--border)',
                  color:        filter === key ? rc : 'var(--text-muted)',
                  padding:      '5px 10px',
                  borderRadius: 6,
                  cursor:       'pointer',
                  fontSize:     10,
                }}
              >
                {t.restaurants.filters[i]}
              </button>
            ))}
          </div>

          {perm.canEdit && (
            <Button onClick={() => setShowForm(true)}>{t.restaurants.add}</Button>
          )}
        </div>
      </div>

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-disabled)', fontSize: 13 }}>
          —
        </div>
      ) : (
        <RestaurantList restaurants={filtered} />
      )}

      {/* ── Add form modal ── */}
      {showForm && <RestaurantForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
