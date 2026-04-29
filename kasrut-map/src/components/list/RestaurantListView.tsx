import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent } from 'react'
import { Box, Typography } from '@mui/material'
import StorefrontIcon from '@mui/icons-material/Storefront'
import type { MapRestaurant } from '@/types'
import { RestaurantListItem } from './RestaurantListItem'
import { useMapLang } from '@/i18n/useMapLang'

interface Props {
  restaurants:  MapRestaurant[]
  onSelect:     (r: MapRestaurant) => void
  onStartRoute: (r: MapRestaurant) => void
  formatDist:   (m: number) => string
}

const ROW_HEIGHT = 188
const OVERSCAN_ROWS = 6

export function RestaurantListView({ restaurants, onSelect, onStartRoute, formatDist }: Props) {
  const t = useMapLang()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const updateViewportHeight = () => {
      setViewportHeight(containerRef.current?.clientHeight ?? 0)
    }

    updateViewportHeight()
    window.addEventListener('resize', updateViewportHeight)
    return () => window.removeEventListener('resize', updateViewportHeight)
  }, [])

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    setScrollTop(0)
  }, [restaurants.length])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
    setViewportHeight(event.currentTarget.clientHeight)
  }

  const visibleRange = useMemo(() => {
    const height = viewportHeight || ROW_HEIGHT * 8
    const maxStart = Math.max(0, restaurants.length - 1)
    const start = Math.min(
      maxStart,
      Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS),
    )
    const end = Math.min(
      restaurants.length,
      Math.ceil((scrollTop + height) / ROW_HEIGHT) + OVERSCAN_ROWS,
    )

    return { start, end }
  }, [restaurants.length, scrollTop, viewportHeight])

  const visibleRestaurants = useMemo(
    () => restaurants.slice(visibleRange.start, visibleRange.end),
    [restaurants, visibleRange],
  )

  if (restaurants.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'text.secondary', p: 4 }}>
        <StorefrontIcon sx={{ fontSize: 56, opacity: 0.3 }} />
        <Typography variant="body1">{t.noEstablishments}</Typography>
        <Typography variant="body2" textAlign="center">
          {t.tryFilters}
        </Typography>
      </Box>
    )
  }

  return (
    <Box ref={containerRef} onScroll={handleScroll} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
      <Typography variant="body2" color="text.secondary" mb={2}>
        {t.foundCount.replace('{n}', String(restaurants.length))}
      </Typography>
      <Box sx={{ height: restaurants.length * ROW_HEIGHT, position: 'relative' }}>
        {visibleRestaurants.map((r, index) => (
          <Box
            key={r.id}
            sx={{
              position: 'absolute',
              top: (visibleRange.start + index) * ROW_HEIGHT,
              left: 0,
              right: 0,
              height: ROW_HEIGHT,
              pb: 1.5,
            }}
          >
            <RestaurantListItem
              restaurant={r}
              onSelect={onSelect}
              onStartRoute={onStartRoute}
              formatDist={formatDist}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
