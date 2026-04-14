import type { SelectOption } from './Input'

interface SelectProps {
  value:    string
  onChange: (value: string) => void
  options:  (SelectOption | string)[]
  color?:   string
}

export function Select({ value, onChange, options, color }: SelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={color ? 'select-inline--colored' : 'select-inline'}
      style={color ? { '--c': color } as React.CSSProperties : undefined}
    >
      {options.map(o => {
        const val = typeof o === 'string' ? o : o.value
        const lbl = typeof o === 'string' ? o : o.label
        return <option key={val} value={val}>{lbl}</option>
      })}
    </select>
  )
}
