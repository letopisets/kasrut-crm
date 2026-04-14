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
      <div className="empty-state">
        —{' '}
        <button onClick={() => navigate('/restaurants')} className="btn-ghost">{t.back}</button>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => navigate('/restaurants')}
        className="btn-ghost"
        style={{ marginBottom: 16, display: 'inline-block' }}
      >
        {t.back}
      </button>
      <RestaurantDetailContent restaurant={restaurant} />
    </div>
  )
}
