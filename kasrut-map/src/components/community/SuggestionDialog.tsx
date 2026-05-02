import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material'
import { useSubmitSuggestionMutation } from '@/store/api/mapCommunityApi'
import { useGetMapHechsherimQuery } from '@/store/api/restaurantsApi'
import { useMapLang } from '@/i18n/useMapLang'
import type { MapRestaurant, MapSuggestionPayload } from '@/types'

interface Props {
  open: boolean
  restaurant: MapRestaurant | null
  defaultPosition?: [number, number] | null
  isAuthenticated: boolean
  onClose: () => void
  onRequireAuth: () => void
}

export function SuggestionDialog({ open, restaurant, defaultPosition, isAuthenticated, onClose, onRequireAuth }: Props) {
  const t = useMapLang()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [hechsher, setHechsher] = useState('')
  const [kashrutStatus, setKashrutStatus] = useState('')
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitSuggestion, submitState] = useSubmitSuggestionMutation()

  const { data: hechsherim = [] } = useGetMapHechsherimQuery(undefined, { skip: !open })
  const hechsherNames = useMemo(() => hechsherim.map(h => h.name), [hechsherim])

  const mode = restaurant ? 'update' : 'add'
  const title = mode === 'add' ? t.suggestNewTitle : t.suggestEditTitle

  useEffect(() => {
    if (!open) return
    setName(restaurant?.name ?? '')
    setAddress(restaurant?.address ?? '')
    setCity(restaurant?.city ?? '')
    setHechsher(restaurant?.hechsher ?? '')
    setKashrutStatus('')
    setNotes('')
    setSuccess(false)
    setError(null)
  }, [open, restaurant])

  const canSubmit = useMemo(() => {
    if (!isAuthenticated) return false
    if (mode === 'add') return Boolean(name.trim() && address.trim() && city.trim())
    return Boolean(name.trim() || address.trim() || city.trim() || hechsher.trim() || kashrutStatus.trim() || notes.trim())
  }, [address, city, hechsher, isAuthenticated, kashrutStatus, mode, name, notes])

  const handleSubmit = async () => {
    if (!isAuthenticated) { onRequireAuth(); return }

    const position = restaurant ? [restaurant.lat, restaurant.lng] : defaultPosition
    const payload: MapSuggestionPayload = {
      type: mode,
      restaurantId: restaurant?.id ?? null,
      proposedName: name.trim() || null,
      proposedAddress: address.trim() || null,
      proposedCity: city.trim() || null,
      proposedHechsher: hechsher.trim() || null,
      proposedKashrutStatus: kashrutStatus.trim() || null,
      proposedLat: position?.[0] ?? null,
      proposedLng: position?.[1] ?? null,
      notes: notes.trim() || null,
    }

    try {
      await submitSuggestion(payload).unwrap()
      setSuccess(true)
      setError(null)
    } catch {
      setError(t.suggestionError)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {!isAuthenticated && (
            <Alert
              severity="info"
              action={<Button color="inherit" size="small" onClick={onRequireAuth}>{t.loginBtn}</Button>}
            >
              {t.loginToSuggest}
            </Alert>
          )}

          {success && <Alert severity="success">{t.suggestionSent}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}

          {mode === 'update' && restaurant && (
            <Typography variant="body2" color="text.secondary">
              {t.currentEstablishment
                .replace('{name}', restaurant.name)
                .replace('{address}', restaurant.address)
                .replace('{city}', restaurant.city)}
            </Typography>
          )}

          <TextField
            label={t.nameField}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />
          <TextField
            label={t.addressField}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />
          <TextField
            label={t.cityField}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />

          <Autocomplete
            freeSolo
            options={hechsherNames}
            value={hechsher}
            onInputChange={(_, value) => setHechsher(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t.hechsherField}
                placeholder={t.hechsherPlaceholder}
                fullWidth
                helperText={
                  hechsher.trim() && !hechsherNames.includes(hechsher.trim())
                    ? t.newHechsherHint
                    : undefined
                }
              />
            )}
          />

          <TextField
            label={t.kashrutStatusField}
            value={kashrutStatus}
            onChange={(e) => setKashrutStatus(e.target.value)}
            select
            SelectProps={{ native: true }}
            fullWidth
          >
            <option value="" />
            {t.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </TextField>

          <TextField
            label={t.notesField}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={3}
            placeholder={t.notesPlaceholder}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ borderRadius: 1 }}>{success ? t.closeBtn : t.cancelBtn}</Button>
        {!success && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit || submitState.isLoading}
            sx={{ borderRadius: 1 }}
          >
            {t.submitBtn}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
