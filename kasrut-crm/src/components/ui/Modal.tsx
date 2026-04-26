import type { ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'

interface ModalProps {
  title:    string
  onClose:  () => void
  children: ReactNode
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg'
}

export function Modal({ title, onClose, children, maxWidth = 'sm' }: ModalProps) {
  return (
    <Dialog open onClose={onClose} maxWidth={maxWidth} fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {title}
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12, color: 'text.secondary' }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important', pb: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {children}
      </DialogContent>
    </Dialog>
  )
}
