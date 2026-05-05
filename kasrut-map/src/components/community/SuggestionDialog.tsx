import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { useSubmitSuggestionMutation } from '@/store/api/mapCommunityApi'
import { useGetMapHechsherimQuery } from '@/store/api/restaurantsApi'
import { useMapLang } from '@/i18n/useMapLang'
import { geocodeRestaurantAddress } from '@/lib/geocode'
import { resizeImageToDataUrl } from '@/lib/image'
import type { FoodType, MapRestaurant, MapSuggestionPayload } from '@/types'

interface Props {
  open: boolean
  restaurant: MapRestaurant | null
  defaultPosition?: [number, number] | null
  isAuthenticated: boolean
  onClose: () => void
  onRequireAuth: () => void
}

const FOOD_TYPES: FoodType[] = ['meat', 'dairy', 'pareve', 'takeaway']

export function SuggestionDialog({ open, restaurant, defaultPosition, isAuthenticated, onClose, onRequireAuth }: Props) {
  const t = useMapLang()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [hechsher, setHechsher] = useState('')
  const [kashrutStatus, setKashrutStatus] = useState('')
  const [foodType, setFoodType] = useState<FoodType | ''>('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isResolvingLocation, setIsResolvingLocation] = useState(false)
  const [submitSuggestion, submitState] = useSubmitSuggestionMutation()
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)

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
    setFoodType(restaurant?.foodType ?? '')
    setImageDataUrl(null)
    setImageBusy(false)
    setNotes('')
    setSuccess(false)
    setError(null)
    setIsResolvingLocation(false)
  }, [open, restaurant])

  const canSubmit = useMemo(() => {
    if (!isAuthenticated) return false
    if (imageBusy) return false
    if (mode === 'add') return Boolean(name.trim() && address.trim() && city.trim() && imageDataUrl)
    return Boolean(
      name.trim() || address.trim() || city.trim() ||
      hechsher.trim() || kashrutStatus.trim() || notes.trim() ||
      foodType || imageDataUrl,
    )
  }, [address, city, foodType, hechsher, imageBusy, imageDataUrl, isAuthenticated, kashrutStatus, mode, name, notes])

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setImageBusy(true)
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: 1024, quality: 0.7, maxBytes: 1_300_000 })
      setImageDataUrl(dataUrl)
    } catch {
      setError(t.imageError)
    } finally {
      setImageBusy(false)
    }
  }

  const handleSubmit = async () => {
    if (!isAuthenticated) { onRequireAuth(); return }

    if (mode === 'add' && !imageDataUrl) {
      setError(t.kashrutPhotoRequired)
      return
    }

    setError(null)
    setIsResolvingLocation(mode === 'add')

    const position = restaurant
      ? [restaurant.lat, restaurant.lng] as [number, number]
      : await geocodeRestaurantAddress(address.trim(), city.trim())
        .catch(() => null) ?? defaultPosition

    setIsResolvingLocation(false)

    if (!position) {
      setError(t.suggestionLocationError)
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
      proposedFoodType: foodType || null,
      proposedImageUrl: imageDataUrl,
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
            label={t.foodTypeField}
            value={foodType}
            onChange={(e) => setFoodType(e.target.value as FoodType | '')}
            select
            fullWidth
          >
            <MenuItem value="">{t.foodTypeAny}</MenuItem>
            {FOOD_TYPES.map(ft => (
              <MenuItem key={ft} value={ft}>{t.foodType[ft]}</MenuItem>
            ))}
          </TextField>

          <TextField
            label={t.kashrutStatusField}
            value={kashrutStatus}
            onChange={(e) => setKashrutStatus(e.target.value)}
            select
            fullWidth
            slotProps={{
              select: { native: true }
            }}
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

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5, color: 'text.secondary' }}>
              {mode === 'add' ? `${t.imageField} *` : t.imageField}
            </Typography>
            {mode === 'add' && (
              <Alert severity="info" sx={{ mb: 1 }}>
                {t.kashrutPhotoNotice}
              </Alert>
            )}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={handleImageChange}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={handleImageChange}
            />
            {imageDataUrl ? (
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Box
                  component="img"
                  src={imageDataUrl}
                  alt={t.imageField}
                  sx={{ maxWidth: '100%', maxHeight: 220, borderRadius: 1, display: 'block' }}
                />
                <IconButton
                  size="small"
                  onClick={() => setImageDataUrl(null)}
                  sx={{
                    position: 'absolute', top: 4, right: 4,
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    '&:hover': { background: 'rgba(0,0,0,0.75)' },
                  }}
                  aria-label={t.imageRemove}
                >
                  ×
                </IconButton>
              </Box>
            ) : (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={imageBusy}
                  sx={{ borderRadius: 1, textTransform: 'none' }}
                >
                  {imageBusy ? t.imageProcessing : t.imageAddCamera}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => galleryInputRef.current?.click()}
                  disabled={imageBusy}
                  sx={{ borderRadius: 1, textTransform: 'none' }}
                >
                  {imageBusy ? t.imageProcessing : t.imageAddGallery}
                </Button>
              </Stack>
            )}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
              {t.imageHint}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ borderRadius: 1 }}>{success ? t.closeBtn : t.cancelBtn}</Button>
        {!success && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit || submitState.isLoading || isResolvingLocation}
            sx={{ borderRadius: 1 }}
          >
            {isResolvingLocation ? t.locatingAddress : t.submitBtn}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
