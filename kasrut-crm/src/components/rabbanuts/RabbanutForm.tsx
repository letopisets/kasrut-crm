import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { Rabbanut } from '@/types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

const PALETTE = ['#E8C96D', '#E67E22', '#1ABC9C', '#8E44AD', '#3498DB', '#2ECC71', '#E74C3C', '#95A5A6']

interface Props {
  initial?: Rabbanut
  onSave:  (data: Omit<Rabbanut, 'id'>) => void
  onClose: () => void
}

export function RabbanutForm({ initial, onSave, onClose }: Props) {
  const t = useLang()

  const [form, setForm] = useState({
    name:    initial?.name    ?? '',
    city:    initial?.city    ?? '',
    contact: initial?.contact ?? '',
    phone:   initial?.phone   ?? '',
    email:   initial?.email   ?? '',
    color:   initial?.color   ?? PALETTE[0],
    active:  initial?.active  ?? true,
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.city) return
    onSave(form)
  }

  const isEdit = !!initial

  return (
    <Modal
      title={isEdit ? (t.rabbanuts?.title ?? 'Rabbanut') : (t.rabbanuts?.add ?? '+ Add Rabbanut')}
      onClose={onClose}
    >
      <Input label={t.rabbanuts?.name    ?? 'Name'}    value={form.name}    onChange={v => set('name', v)} />
      <Input label={t.rabbanuts?.city    ?? 'City'}    value={form.city}    onChange={v => set('city', v)} />
      <Input label={t.rabbanuts?.contact ?? 'Contact'} value={form.contact} onChange={v => set('contact', v)} />
      <Input label={t.rabbanuts?.phone   ?? 'Phone'}   value={form.phone}   onChange={v => set('phone', v)} />
      <Input label={t.rabbanuts?.email   ?? 'Email'}   value={form.email}   onChange={v => set('email', v)} />

      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Color
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {PALETTE.map(c => (
            <Box
              key={c}
              onClick={() => set('color', c)}
              sx={{
                width: 28, height: 28, borderRadius: '50%',
                background: c, cursor: 'pointer',
                border: form.color === c ? '2px solid #fff' : '2px solid transparent',
                boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none',
                transition: 'box-shadow 0.15s, transform 0.15s',
                '&:hover': { transform: 'scale(1.15)' },
              }}
            />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.city} disableElevation>
          {t.rabbanuts?.save ?? 'Save'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.rabbanuts?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
