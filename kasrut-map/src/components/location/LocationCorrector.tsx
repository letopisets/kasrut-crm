import { useState, useEffect } from 'react'
import {
  Box, Paper, InputBase, IconButton,
  List, ListItemButton, ListItemText,
  CircularProgress, Chip, Typography,
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon  from '@mui/icons-material/Close'

interface NominatimResult {
  place_id:     number
  display_name: string
  lat:          string
  lon:          string
}

interface Props {
  onApply:  (pos: [number, number]) => void
  onCancel: () => void
}

export function LocationCorrector({ onApply, onCancel }: Props) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)

  // Debounced Nominatim search
  useEffect(() => {
    if (query.length < 3) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=il`
        const res  = await fetch(url, { headers: { 'Accept-Language': 'ru' } })
        const data: NominatimResult[] = await res.json()
        setResults(data)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  const handleSelect = (r: NominatimResult) => {
    onApply([parseFloat(r.lat), parseFloat(r.lon)])
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
            placeholder="Введите адрес..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            sx={{ fontSize: 14 }}
          />
          {loading
            ? <CircularProgress size={18} sx={{ flexShrink: 0 }} />
            : <IconButton size="small" onClick={onCancel} title="Отмена"><CloseIcon fontSize="small" /></IconButton>
          }
        </Paper>

        {results.length > 0 && (
          <Paper elevation={4} sx={{ mt: 0.5, maxHeight: 220, overflow: 'auto', borderRadius: 2 }}>
            <List dense disablePadding>
              {results.map(r => (
                <ListItemButton key={r.place_id} onClick={() => handleSelect(r)} divider>
                  <ListItemText
                    primary={r.display_name.split(',')[0]}
                    secondary={r.display_name.split(',').slice(1, 3).join(',')}
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      {/* Hint at bottom — "or click on map" */}
      <Box sx={{
        position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, pointerEvents: 'none',
      }}>
        <Chip
          label={<Typography variant="caption" fontWeight={600}>Или нажмите на карту</Typography>}
          size="small"
          sx={{ bgcolor: 'background.paper', boxShadow: 2, px: 0.5 }}
        />
      </Box>
    </>
  )
}
