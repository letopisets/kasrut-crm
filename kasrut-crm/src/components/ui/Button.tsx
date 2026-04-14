import type { ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps {
  children:  ReactNode
  onClick?:  () => void
  variant?:  ButtonVariant
  disabled?: boolean
  type?:     'button' | 'submit' | 'reset'
}

export function Button({
  children,
  onClick,
  variant  = 'primary',
  disabled = false,
  type     = 'button',
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn btn-${variant}`}
    >
      {children}
    </button>
  )
}
