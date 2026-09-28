import { useState, useEffect } from 'react'
import {
  Box, Paper, InputBase, IconButton,
  List, ListItemButton, ListItemText,
  CircularProgress, Chip, Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon  from '@mui/icons-material/Close'
import { useAppSelector } from '@/store/hooks'
import { useMapLang } from '@/i18n/useMapLang'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

// One hit from our /map/places — GovMap for Israel, Nominatim elsewhere, both
// resolved server-side (the browser may not call either: CSP connect-src, and
// Nominatim's usage policy forbids client-side autocomplete).
interface PlaceResult {
  id:      string
  label:   string
  detail?: string
  lat:     number
  lng:     number
}

function isPlace(r: unknown): r is PlaceResult {
  const p = r as Partial<PlaceResult> | null
  return typeof p?.id === 'string' && typeof p.label === 'string'
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

interface Props {
  onApply:  (pos: [number, number]) => void
  onCancel: () => void
}

export function LocationCorrector({ onApply, onCancel }: Props) {
  const t = useMapLang()
  const lang = useAppSelector(s => s.mapLang.lang)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const q = query.trim()

  // Debounced, locale-aware place search. A newer query aborts the in-flight
  // request so a slow stale response can never overwrite fresher results.
  useEffect(() => {
    if (q.length < 3) { setResults([]); setLoading(false); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q, lang })
        const res    = await fetch(`${API_URL}/map/places?${params.toString()}`, { signal: controller.signal })
        const data   = res.ok ? await res.json() as { results?: unknown } | null : null
        const list   = data?.results
        if (controller.signal.aborted) return
        setResults(Array.isArray(list) ? list.filter(isPlace).slice(0, 5) : [])
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 400)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, lang])

  const handleSelect = (r: PlaceResult) => {
    onApply([r.lat, r.lng])
  }

  return (
    <>
      {/* Search bar — overlaid at top of map */}
      <Box sx={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 1100 }}>
        <Paper elevation={4} sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2 }}>
          <SearchIcon sx={{ color: 'text.secondary', flexShrink: 0 }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder={t.addressPlaceholder}
            value={query}
            onChange={e => setQuery(e.target.value)}
            sx={{ fontSize: 14 }}
          />
          {loading
            ? <CircularProgress size={18} sx={{ flexShrink: 0 }} />
            : <IconButton size="small" onClick={onCancel} title={t.cancelSearch}><CloseIcon fontSize="small" /></IconButton>
          }
        </Paper>

        {results.length > 0 && (
          <Paper elevation={4} sx={{ mt: 0.5, maxHeight: 220, overflow: 'auto', borderRadius: 2 }}>
            <List dense disablePadding>
              {results.map(r => (
                <ListItemButton key={r.id} onClick={() => handleSelect(r)} divider>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                        {r.label}
                      </Typography>
                    }
                    secondary={r.detail
                      ? <Typography variant="caption" noWrap>{r.detail}</Typography>
                      : undefined
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      {/* Hint at bottom */}
      <Box sx={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, pointerEvents: 'none',
      }}>
        <Chip
          label={<Typography variant="caption" sx={{ fontWeight: 600 }}>{t.clickOnMap}</Typography>}
          size="small"
          sx={{ bgcolor: 'background.paper', boxShadow: 2, px: 0.5 }}
        />
      </Box>
    </>
  )
}
