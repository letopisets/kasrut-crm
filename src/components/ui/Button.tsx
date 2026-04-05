import type { CSSProperties, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps {
  children:  ReactNode
  onClick?:  () => void
  variant?:  ButtonVariant
  disabled?: boolean
  style?:    CSSProperties
  type?:     'button' | 'submit' | 'reset'
}

const VARIANT: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--gold-dim), var(--gold))',
    color:      'var(--bg-card)',
    border:     'none',
  },
  secondary: {
    background: 'var(--bg-elevated)',
    border:     '1px solid var(--border)',
    color:      'var(--text-secondary)',
  },
  danger: {
    background: 'rgba(231,76,60,0.08)',
    border:     '1px solid rgba(231,76,60,0.25)',
    color:      'var(--status-crit)',
  },
  ghost: {
    background: 'transparent',
    border:     '1px solid var(--border)',
    color:      'var(--text-muted)',
  },
}

export function Button({
  children,
  onClick,
  variant  = 'primary',
  disabled = false,
  style,
  type     = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding:      '7px 15px',
        borderRadius: 7,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontSize:     12,
        fontWeight:   600,
        opacity:      disabled ? 0.4 : 1,
        ...VARIANT[variant],
        ...style,
      }}
    >
      {children}
    </button>
  )
}
