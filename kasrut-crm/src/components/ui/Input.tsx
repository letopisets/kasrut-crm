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

export function Input({ label, value, onChange, type = 'text', options, placeholder }: InputProps) {
  return (
    <div className="input-group">
      <label className="input-label">{label}</label>

      {options ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input-field"
          style={!value ? { color: 'var(--text-muted)', cursor: 'pointer' } : { cursor: 'pointer' }}
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
          className="input-field"
        />
      )}
    </div>
  )
}
