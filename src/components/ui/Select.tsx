import type { CSSProperties } from 'react'
import type { SelectOption } from './Input'

interface SelectProps {
  value:    string
  onChange: (value: string) => void
  options:  (SelectOption | string)[]
  /** Accent color — used for status-colored inline selects */
  color?:   string
  style?:   CSSProperties
}

/**
 * Standalone styled select — no label wrapper.
 * Use <Input options={...}> for form fields with labels.
 * Use <Select color={...}> for inline colored selects (e.g. inspection result).
 */
export function Select({ value, onChange, options, color, style }: SelectProps) {
  const colored: CSSProperties = color
    ? { background: `${color}18`, border: `1px solid ${color}35`, color }
    : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding:      '4px 8px',
        borderRadius: 6,
        fontSize:     11,
        cursor:       'pointer',
        ...colored,
        ...style,
      }}
    >
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value
        const lbl = typeof o === 'string' ? o : o.label
        return <option key={val} value={val}>{lbl}</option>
      })}
    </select>
  )
}
