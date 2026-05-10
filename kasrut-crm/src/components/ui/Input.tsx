import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'

export interface SelectOption {
  value: string
  label: string
}

interface InputProps {
  label:        string
  value:        string
  onChange:     (value: string) => void
  type?:        string
  options?:     (SelectOption | string)[]
  placeholder?: string
  error?:       boolean
  helperText?:  string
  required?:    boolean
}

export function Input({ label, value, onChange, type = 'text', options, placeholder, error, helperText, required }: InputProps) {
  if (options) {
    return (
      <TextField
        select
        fullWidth
        size="small"
        label={label}
        value={value}
        onChange={e => onChange(e.target.value)}
        error={error}
        helperText={helperText}
        required={required}
      >
        <MenuItem value=""><em>—</em></MenuItem>
        {options.map(o => {
          const val = typeof o === 'string' ? o : o.value
          const lbl = typeof o === 'string' ? o : o.label
          return <MenuItem key={val} value={val}>{lbl}</MenuItem>
        })}
      </TextField>
    )
  }

  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      error={error}
      helperText={helperText}
      required={required}
      slotProps={type === 'date' ? { inputLabel: { shrink: true } } : undefined}
    />
  )
}
