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
  const rafRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  // ResizeObserver tracks both window resizes AND parent layout changes (e.g.
  // the count badge appearing/disappearing) — a window-level listener would
  // miss the latter.
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setViewportHeight(entry.contentRect.height)
    })
    observer.observe(node)
    setViewportHeight(node.clientHeight)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0
    setScrollTop(0)
  }, [restaurants.length])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const next = event.currentTarget.scrollTop
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setScrollTop(next)
    })
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
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          {t.tryFilters}
        </Typography>
      </Box>
    )
  }

  return (
    <Box ref={containerRef} onScroll={handleScroll} sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t.foundCount.replace('{n}', String(restaurants.length))}
      </Typography>
      <Box sx={{ height: restaurants.length * ROW_HEIGHT, position: 'relative' }}>
        {visibleRestaurants.map((r, index) => {
          const offset = (visibleRange.start + index) * ROW_HEIGHT
          return (
            <Box
              key={r.id}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: ROW_HEIGHT,
                pb: 1.5,
                // translate is GPU-composited; far cheaper than animating `top`
                // when the user is fast-scrolling.
                transform: `translateY(${offset}px)`,
                willChange: 'transform',
              }}
            >
              <RestaurantListItem
                restaurant={r}
                onSelect={onSelect}
                onStartRoute={onStartRoute}
                formatDist={formatDist}
              />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
