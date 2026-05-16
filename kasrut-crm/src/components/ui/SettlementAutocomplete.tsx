import { useState, useMemo } from 'react'
import Autocomplete          from '@mui/material/Autocomplete'
import TextField             from '@mui/material/TextField'
import CircularProgress      from '@mui/material/CircularProgress'
import Typography            from '@mui/material/Typography'
import Box                   from '@mui/material/Box'
import { detectScript, scriptToNameField } from '@/lib/detectScript'
import type { InputScript }  from '@/lib/detectScript'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SettlementOption {
  id:     string
  nameHe: string
  nameEn: string | null
  nameRu: string | null
  lat?:   number | null
  lng?:   number | null
}

interface Props {
  value?:      SettlementOption | null
  onChange:    (s: SettlementOption | null) => void
  label?:      string
  required?:   boolean
  error?:      boolean
  helperText?: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns the settlement name in the script the user is currently typing. */
function labelForScript(opt: SettlementOption, script: InputScript): string {
  const field = scriptToNameField(script)
  return opt[field] ?? opt.nameHe
}

/**
 * Secondary line shown under the main name in the dropdown.
 * Shows the other two translations so the user can confirm it's the right city.
 */
function altNames(opt: SettlementOption, primaryScript: InputScript): string {
  const primaryField = scriptToNameField(primaryScript)
  return ([opt.nameHe, opt.nameEn, opt.nameRu] as (string | null)[])
    .filter((n): n is string => Boolean(n) && n !== opt[primaryField])
    .join(' · ')
}

// ── Minimal inline fetch (no RTK Query dependency here) ───────────────────
// Replace with useSearchSettlementsQuery once settlementsApi is wired up.

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

async function fetchSettlements(q: string, lang: InputScript): Promise<SettlementOption[]> {
  const params = new URLSearchParams({ q, lang: lang === 'unknown' ? 'he' : lang })
  const res    = await fetch(`${BASE_URL}/settlements/search?${params}`)
  if (!res.ok) return []
  return res.json() as Promise<SettlementOption[]>
}

// ── Component ──────────────────────────────────────────────────────────────

export function SettlementAutocomplete({
  value = null, onChange, label = 'City', required, error, helperText,
}: Props) {
  const [inputValue, setInputValue] = useState(
    // Seed the visible text from the current value if editing an existing record
    () => value ? (value.nameEn ?? value.nameHe) : '',
  )
  const [options, setOptions]     = useState<SettlementOption[]>([])
  const [loading, setLoading]     = useState(false)
  const [timer, setTimer]         = useState<ReturnType<typeof setTimeout> | null>(null)

  // Detect the script the user is typing in right now
  const typingScript = useMemo(() => detectScript(inputValue), [inputValue])

  const handleInputChange = (_: unknown, newInput: string) => {
    setInputValue(newInput)

    if (timer) clearTimeout(timer)

    if (newInput.length < 2) {
      setOptions([])
      return
    }

    const script = detectScript(newInput)

    // Debounce: wait 300ms after the user stops typing
    setTimer(setTimeout(async () => {
      setLoading(true)
      try {
        const results = await fetchSettlements(newInput, script)
        setOptions(results)
      } finally {
        setLoading(false)
      }
    }, 300))
  }

  return (
    <Autocomplete<SettlementOption>
      options={options}
      value={value}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={(_, selected) => {
        onChange(selected)
        // When a city is selected, update the visible text to match the
        // script the user was typing — keeps the UX consistent.
        if (selected) setInputValue(labelForScript(selected, typingScript))
      }}

      // Show the name in whichever script the user is typing
      getOptionLabel={opt => labelForScript(opt, typingScript)}

      renderOption={(props, opt) => {
        const { key, ...rest } = props as typeof props & { key: React.Key }
        const primary = labelForScript(opt, typingScript)
        const alts    = altNames(opt, typingScript)
        return (
          <Box component="li" key={key} {...rest} sx={{ display: 'block', py: '6px !important' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
              {primary}
            </Typography>
            {alts && (
              <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.2, mt: 0.25 }}>
                {alts}
              </Typography>
            )}
          </Box>
        )
      }}

      isOptionEqualToValue={(a, b) => a.id === b.id}

      // Filtering is done server-side — pass all options through
      filterOptions={x => x}

      loading={loading}
      loadingText="…"
      noOptionsText={inputValue.length < 2 ? 'Start typing…' : 'Not found'}

      renderInput={params => (
        <TextField
          {...params}
          label={label}
          size="small"
          required={required}
          error={error}
          helperText={helperText}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading && <CircularProgress size={14} sx={{ mr: 0.5 }} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  )
}
