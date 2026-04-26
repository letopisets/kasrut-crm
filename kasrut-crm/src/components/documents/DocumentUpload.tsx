import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { KashrutDocument, DocumentCategory } from '@/types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

const CATEGORIES: DocumentCategory[] = ['Instructions', 'Forms', 'Regulations', 'Pesach']
const EXTS = ['PDF', 'DOCX', 'XLSX'] as const

interface Props {
  onSave:  (data: Omit<KashrutDocument, 'id'>) => void
  onClose: () => void
}

export function DocumentUpload({ onSave, onClose }: Props) {
  const t = useLang()

  const [form, setForm] = useState({
    name:     '',
    category: '' as '' | DocumentCategory,
    ext:      'PDF' as typeof EXTS[number],
    size:     '0.0 MB',
    date:     new Date().toISOString().slice(0, 10),
    url:      '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.category) return
    onSave({ ...form, category: form.category as DocumentCategory })
  }

  const categoryOptions = CATEGORIES.map(c => ({ value: c, label: c }))
  const extOptions      = EXTS.map(e => ({ value: e, label: e }))

  return (
    <Modal title="Upload Document" onClose={onClose}>
      <Input label="Name"     value={form.name}     onChange={v => set('name', v)} />
      <Input
        label="Category"
        value={form.category}
        onChange={v => set('category', v as DocumentCategory)}
        options={categoryOptions}
      />
      <Input
        label="Format"
        value={form.ext}
        onChange={v => set('ext', v as typeof EXTS[number])}
        options={extOptions}
      />
      <Input label="Date" value={form.date} onChange={v => set('date', v)} type="date" />
      <Input label="URL"  value={form.url}  onChange={v => set('url', v)} />

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.category} disableElevation>
          {t.addRest?.save ?? 'Save'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
