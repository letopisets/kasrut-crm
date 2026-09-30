import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { SelectOption } from '@/components/ui'
import { httpsHref } from '@/lib/safeUrl'
import { DOCUMENT_CATEGORIES, documentCategoryLabel } from '@/lib/documents'
import type { CreateDocumentInput, DocumentCategory } from '@/types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'

const EXTS = ['PDF', 'DOCX', 'XLSX'] as const
// Select value for "global"; rabbanut ids are cuids / rb_* slugs, never this.
const GLOBAL_SCOPE = '__global__'

interface Props {
  /** Owner only: the rabbanuts a document can be scoped to. Omitted for
   *  tenant users, whose uploads the server pins to their own rabbanut. */
  scopeOptions?: SelectOption[]
  onSave:  (data: CreateDocumentInput) => void | Promise<void>
  onClose: () => void
  error?:  string | null
  saving?: boolean
}

export function DocumentUpload({ scopeOptions, onSave, onClose, error, saving = false }: Props) {
  const t = useLang()

  const [form, setForm] = useState({
    name:     '',
    category: '' as '' | DocumentCategory,
    ext:      'PDF' as typeof EXTS[number],
    date:     new Date().toISOString().slice(0, 10),
    url:      '',
    scope:    GLOBAL_SCOPE,
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const url        = form.url.trim()
  const urlInvalid = url !== '' && httpsHref(url) === null

  const handleSave = () => {
    if (!form.name || !form.category || urlInvalid) return
    void onSave({
      name:     form.name,
      category: form.category as DocumentCategory,
      ext:      form.ext,
      date:     form.date,
      // The API only accepts https URLs; an empty field means "no link".
      ...(url ? { url } : {}),
      ...(scopeOptions ? { rabbanutId: form.scope === GLOBAL_SCOPE ? null : form.scope } : {}),
    })
  }

  const categoryOptions = DOCUMENT_CATEGORIES.map(c => ({ value: c, label: documentCategoryLabel(t, c) }))
  const extOptions      = EXTS.map(e => ({ value: e, label: e }))

  return (
    <Modal title={t.documents.uploadTitle} onClose={onClose}>
      <Input label={t.documents.name} value={form.name} onChange={v => set('name', v)} required />
      <Input
        label={t.documents.category}
        value={form.category}
        onChange={v => set('category', v as DocumentCategory)}
        options={categoryOptions}
        required
      />
      <Input
        label={t.documents.format}
        value={form.ext}
        onChange={v => set('ext', v as typeof EXTS[number])}
        options={extOptions}
      />
      <Input label={t.documents.date} value={form.date} onChange={v => set('date', v)} type="date" />
      <Input
        label={t.documents.url}
        value={form.url}
        onChange={v => set('url', v)}
        type="url"
        placeholder="https://"
        error={urlInvalid}
        helperText={urlInvalid ? t.documents.urlInvalid : undefined}
      />
      {scopeOptions && (
        <TextField
          select
          fullWidth
          size="small"
          label={t.documents.scope}
          value={form.scope}
          onChange={e => set('scope', e.target.value)}
        >
          <MenuItem value={GLOBAL_SCOPE}>{t.documents.scopeGlobal}</MenuItem>
          {scopeOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !form.name || !form.category || urlInvalid}
          disableElevation
        >
          {saving ? <CircularProgress size={16} color="inherit" /> : (t.addRest?.save ?? 'Save')}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
