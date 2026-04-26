import MuiSelect from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import { alpha } from '@mui/material/styles'
import type { SelectOption } from './Input'

interface SelectProps {
  value:    string
  onChange: (value: string) => void
  options:  (SelectOption | string)[]
  color?:   string
}

export function Select({ value, onChange, options, color }: SelectProps) {
  return (
    <MuiSelect
      value={value}
      onChange={e => onChange(e.target.value as string)}
      size="small"
      sx={{
        fontSize: '0.6875rem',
        fontWeight: 700,
        color: color ?? 'text.secondary',
        background: color ? alpha(color, 0.09) : '#1E2235',
        border: '1px solid',
        borderColor: color ? alpha(color, 0.21) : '#252840',
        borderRadius: '20px',
        '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
        '& .MuiSelect-select': { py: '4px', px: '10px' },
      }}
    >
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value
        const lbl = typeof o === 'string' ? o : o.label
        return <MenuItem key={val} value={val} sx={{ fontSize: '0.8125rem' }}>{lbl}</MenuItem>
      })}
    </MuiSelect>
  )
}
