import type { ReactNode } from 'react'

interface ModalProps {
  title:    string
  onClose:  () => void
  children: ReactNode
  width?:   number
}

export function Modal({ title, onClose, children, width = 460 }: ModalProps) {
  return (
    <div style={{
      position:       'fixed',
      inset:          0,
      background:     'rgba(10,11,18,0.92)',
      zIndex:         1000,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background:   'var(--bg-card)',
        border:       '1px solid var(--border)',
        borderRadius: 14,
        padding:      24,
        width,
        maxHeight:    '85vh',
        overflowY:    'auto',
        color:        'var(--text-primary)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{title}</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
