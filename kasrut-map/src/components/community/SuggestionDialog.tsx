import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Stack, TextField, Typography,
} from '@mui/material'
import { useSubmitSuggestionMutation } from '@/store/api/mapCommunityApi'
import type { MapRestaurant, MapSuggestionPayload } from '@/types'

interface Props {
  open: boolean
  restaurant: MapRestaurant | null
  isAuthenticated: boolean
  onClose: () => void
  onRequireAuth: () => void
}

const STATUS_OPTIONS = [
  'Кашрут действует',
  'Кашрут требует проверки',
  'Статус изменился',
  'Заведение больше не кошерное',
]

export function SuggestionDialog({ open, restaurant, isAuthenticated, onClose, onRequireAuth }: Props) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [hechsher, setHechsher] = useState('')
  const [kashrutStatus, setKashrutStatus] = useState('')
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitSuggestion, submitState] = useSubmitSuggestionMutation()

  const mode = restaurant ? 'update' : 'add'
  const title = mode === 'add' ? 'Предложить новое заведение' : 'Предложить правку'

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
    if (!isAuthenticated) {
      onRequireAuth()
      return
    }

    const payload: MapSuggestionPayload = {
      type: mode,
      restaurantId: restaurant?.id ?? null,
      proposedName: name.trim() || null,
      proposedAddress: address.trim() || null,
      proposedCity: city.trim() || null,
      proposedHechsher: hechsher.trim() || null,
      proposedKashrutStatus: kashrutStatus.trim() || null,
      proposedLat: restaurant?.lat ?? null,
      proposedLng: restaurant?.lng ?? null,
      notes: notes.trim() || null,
    }

    try {
      await submitSuggestion(payload).unwrap()
      setSuccess(true)
      setError(null)
    } catch {
      setError('Не удалось отправить предложение. Попробуйте ещё раз.')
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
              action={<Button color="inherit" size="small" onClick={onRequireAuth}>Войти</Button>}
            >
              Чтобы отправить предложение, войдите через Google или Apple.
            </Alert>
          )}

          {success && <Alert severity="success">Спасибо. Предложение отправлено на проверку.</Alert>}
          {error && <Alert severity="error">{error}</Alert>}

          {mode === 'update' && restaurant && (
            <Typography variant="body2" color="text.secondary">
              Текущее заведение: {restaurant.name}, {restaurant.address}, {restaurant.city}
            </Typography>
          )}

          <TextField
            label="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />
          <TextField
            label="Адрес"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />
          <TextField
            label="Город"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required={mode === 'add'}
            fullWidth
          />
          <TextField
            label="Хекшер"
            value={hechsher}
            onChange={(e) => setHechsher(e.target.value)}
            placeholder="Например: בד״ץ העדה החרדית"
            fullWidth
          />
          <TextField
            label="Статус кашрута"
            value={kashrutStatus}
            onChange={(e) => setKashrutStatus(e.target.value)}
            select
            SelectProps={{ native: true }}
            fullWidth
          >
            <option value="" />
            {STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </TextField>
          <TextField
            label="Комментарий"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={3}
            placeholder="Что именно нужно проверить или изменить?"
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ borderRadius: 1 }}>{success ? 'Закрыть' : 'Отмена'}</Button>
        {!success && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit || submitState.isLoading}
            sx={{ borderRadius: 1 }}
          >
            Отправить
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
