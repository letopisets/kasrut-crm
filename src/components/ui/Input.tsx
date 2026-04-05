import type { CSSProperties } from 'react'

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
}

const FIELD: CSSProperties = {
  width:        '100%',
  background:   'var(--bg-elevated)',
  border:       '1px solid var(--border)',
  color:        'var(--text-primary)',
  padding:      '7px 10px',
  borderRadius: 6,
  fontSize:     12,
  boxSizing:    'border-box',
}

const LABEL: CSSProperties = {
  fontSize:       10,
  color:          'var(--text-muted)',
  display:        'block',
  marginBottom:   4,
  textTransform:  'uppercase',
  letterSpacing:  '0.5px',
}

export function Input({ label, value, onChange, type = 'text', options, placeholder }: InputProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={LABEL}>{label}</label>

      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...FIELD, color: value ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer' }}
        >
          <option value="">—</option>
          {options.map(o => {
            const val = typeof o === 'string' ? o : o.value
            const lbl = typeof o === 'string' ? o : o.label
            return <option key={val} value={val}>{lbl}</option>
          })}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder ?? ''}
          style={FIELD}
        />
      )}
    </div>
  )
}
