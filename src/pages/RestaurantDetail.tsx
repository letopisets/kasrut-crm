import { useParams, useNavigate } from 'react-router-dom'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useLang } from '@/i18n/useLang'
import { RestaurantDetailContent } from '@/components/restaurants/RestaurantDetail'

export default function RestaurantDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const t          = useLang()
  const restaurant = useRestaurantStore(s => s.restaurants.find(r => r.id === id))

  if (!restaurant) {
    return (
      <div style={{ padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
        —{' '}
        <button
          onClick={() => navigate('/restaurants')}
          style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '4px 12px',
            borderRadius: 6, cursor: 'pointer', fontSize: 11,
          }}
        >
          {t.back}
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* ── Back button ── */}
      <button
        onClick={() => navigate('/restaurants')}
        style={{
          background:   'transparent',
          border:       '1px solid var(--border)',
          color:        'var(--text-muted)',
          padding:      '4px 12px',
          borderRadius: 6,
          cursor:       'pointer',
          fontSize:     11,
          marginBottom: 14,
          display:      'inline-block',
        }}
      >
        {t.back}
      </button>

      <RestaurantDetailContent restaurant={restaurant} />
    </div>
  )
}
