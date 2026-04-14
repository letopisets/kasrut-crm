import type { ReactNode } from 'react'

interface ModalProps {
  title:    string
  onClose:  () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} className="modal-close">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
