import { useEffect, useMemo, useRef, useState } from 'react'
import type { UIEvent } from 'react'
import type { Inspection } from '@/types'
import { InspectionRow } from './InspectionRow'
import Box from '@mui/material/Box'

interface Props { inspections: Inspection[] }

const ROW_HEIGHT = 96
const ROW_GAP = 8
const SLOT_HEIGHT = ROW_HEIGHT + ROW_GAP
const OVERSCAN_ROWS = 8
const VIRTUALIZE_THRESHOLD = 60

// Direct render is cheaper than virtualisation up to ~60 rows; only when the
// list grows beyond that threshold do we pay for ResizeObserver + scroll
// state. Splitting into two components keeps each branch's hook count fixed,
// so React's rules-of-hooks isn't broken when the threshold is crossed.
export function InspectionList({ inspections }: Props) {
  if (inspections.length <= VIRTUALIZE_THRESHOLD) {
    return <SimpleList inspections={inspections} />
  }
  return <VirtualList inspections={inspections} />
}

function SimpleList({ inspections }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {inspections.map(i => (
        <InspectionRow key={i.id} inspection={i} />
      ))}
    </Box>
  )
}

function VirtualList({ inspections }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

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
    const height = viewportHeight || SLOT_HEIGHT * 8
    const start = Math.max(0, Math.floor(scrollTop / SLOT_HEIGHT) - OVERSCAN_ROWS)
    const end = Math.min(
      inspections.length,
      Math.ceil((scrollTop + height) / SLOT_HEIGHT) + OVERSCAN_ROWS,
    )
    return { start, end }
  }, [inspections.length, scrollTop, viewportHeight])

  const visible = useMemo(
    () => inspections.slice(visibleRange.start, visibleRange.end),
    [inspections, visibleRange],
  )

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      sx={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}
    >
      <Box sx={{ height: inspections.length * SLOT_HEIGHT, position: 'relative' }}>
        {visible.map((inspection, index) => {
          const offset = (visibleRange.start + index) * SLOT_HEIGHT
          return (
            <Box
              key={inspection.id}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offset}px)`,
                willChange: 'transform',
              }}
            >
              <InspectionRow inspection={inspection} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
