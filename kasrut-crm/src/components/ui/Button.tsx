import type { ReactNode } from 'react'
import MuiButton from '@mui/material/Button'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

interface ButtonProps {
  children:  ReactNode
  onClick?:  () => void
  variant?:  ButtonVariant
  disabled?: boolean
  type?:     'button' | 'submit' | 'reset'
}

export function Button({ children, onClick, variant = 'primary', disabled = false, type = 'button' }: ButtonProps) {
  const muiProps = (() => {
    switch (variant) {
      case 'primary':   return { variant: 'contained' as const, color: 'primary' as const }
      case 'secondary': return { variant: 'outlined'  as const, color: 'inherit'  as const }
      case 'danger':    return { variant: 'outlined'  as const, color: 'error'    as const }
      case 'ghost':     return { variant: 'text'      as const, color: 'inherit'  as const }
    }
  })()

  return (
    <MuiButton
      type={type}
      onClick={onClick}
      disabled={disabled}
      size="small"
      disableElevation
      {...muiProps}
    >
      {children}
    </MuiButton>
  )
}
