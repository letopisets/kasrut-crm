import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { httpsHref } from '@/lib/safeUrl'
import { DocumentList } from '@/components/documents/DocumentList'
import { DocumentUpload } from '@/components/documents/DocumentUpload'
import { canDeleteDocument, documentCategoryLabel, documentScopeLabel, documentScopeOptions } from '@/lib/documents'
import en from '@/i18n/en'
import ru from '@/i18n/ru'
import he from '@/i18n/he'
import type { KashrutDocument, Rabbanut } from '@/types'

vi.mock('@/i18n/useLang', async () => {
  const en = (await import('@/i18n/en')).default
  return { useLang: () => en }
})

const doc = (id: string, rabbanutId: string | null, url?: string): KashrutDocument => ({
  id, name: `Doc ${id}`, category: 'Forms', date: '2026-09-30', size: '0', ext: 'PDF', rabbanutId, url,
})

describe('httpsHref', () => {
  it('keeps absolute https links', () => {
    expect(httpsHref('https://example.org/a.pdf')).toBe('https://example.org/a.pdf')
    expect(httpsHref('  https://example.org/b.pdf ')).toBe('https://example.org/b.pdf')
  })

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://example.org/a.pdf',
    '/relative.pdf',
    'example.org/a.pdf',
    '',
    null,
    undefined,
  ])('rejects %s', (url) => {
    expect(httpsHref(url)).toBeNull()
  })
})

describe('document access helpers', () => {
  const rb = (id: string, active = true): Rabbanut => ({
    id, name: `R ${id}`, city: '', contact: '', phone: '', email: '', active, color: '#000',
  })

  it('owner may delete global and any tenant\'s document', () => {
    for (const d of [doc('g', null), doc('mine', 'rb_mine'), doc('other', 'rb_other')]) {
      expect(canDeleteDocument('owner', undefined, d)).toBe(true)
    }
  })

  it('rabbanut may delete only its own tenant\'s documents', () => {
    expect(canDeleteDocument('rabbanut', 'rb_mine', doc('mine', 'rb_mine'))).toBe(true)
    expect(canDeleteDocument('rabbanut', 'rb_mine', doc('g', null))).toBe(false)
    expect(canDeleteDocument('rabbanut', 'rb_mine', doc('other', 'rb_other'))).toBe(false)
    // A tenant account without a rabbanut must not match global rows either.
    expect(canDeleteDocument('rabbanut', undefined, doc('g', null))).toBe(false)
  })

  it('mashgiach may delete nothing', () => {
    for (const d of [doc('g', null), doc('mine', 'rb_mine')]) {
      expect(canDeleteDocument('mashgiach', 'rb_mine', d)).toBe(false)
    }
  })

  it('scope options list active rabbanuts only', () => {
    expect(documentScopeOptions([rb('a'), rb('off', false), rb('b')])).toEqual([
      { value: 'a', label: 'R a' },
      { value: 'b', label: 'R b' },
    ])
  })

  it('scope label: global, rabbanut name, or a neutral label instead of the raw id', () => {
    const list = [rb('rb_mine')]
    expect(documentScopeLabel(en, list, doc('g', null))).toBe('Global')
    expect(documentScopeLabel(en, list, doc('m', 'rb_mine'))).toBe('R rb_mine')
    expect(documentScopeLabel(en, list, doc('x', 'ckdeletedrabbanut'))).toBe('Unknown authority')
  })

  it('category labels are translated', () => {
    expect(documentCategoryLabel(en, 'Pesach')).toBe('Pesach')
    expect(documentCategoryLabel(ru, 'Instructions')).toBe('Инструкции')
    expect(documentCategoryLabel(he, 'Forms')).toBe('טפסים')
    expect(documentCategoryLabel(he, 'Regulations')).toBe('נהלים')
  })
})

describe('DocumentList', () => {
  it('links only https URLs, in a new tab without opener or referrer', () => {
    render(
      <DocumentList
        documents={[doc('safe', null, 'https://example.org/a.pdf'), doc('evil', null, 'javascript:alert(1)')]}
        canDelete={() => false}
        scopeLabel={() => 'Global'}
        onDelete={vi.fn()}
      />,
    )

    const links = screen.getAllByRole('link', { name: 'View' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://example.org/a.pdf')
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows delete only where allowed and labels the scope', () => {
    const onDelete = vi.fn()
    render(
      <DocumentList
        documents={[doc('global', null), doc('mine', 'rb_mine')]}
        canDelete={d => d.rabbanutId === 'rb_mine'}
        scopeLabel={d => (d.rabbanutId ? 'My rabbanut' : 'Global')}
        onDelete={onDelete}
      />,
    )

    const deletes = screen.getAllByRole('button', { name: 'Delete' })
    expect(deletes).toHaveLength(1)
    fireEvent.click(deletes[0])
    expect(onDelete).toHaveBeenCalledWith('mine')
    expect(screen.getByText('Global')).toBeInTheDocument()
    expect(screen.getByText('My rabbanut')).toBeInTheDocument()
  })
})

describe('DocumentUpload', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Checklist' } })
    fireEvent.mouseDown(screen.getByLabelText(/^Category/))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Forms'))
  }

  it('tenant users get no scope selector and never send rabbanutId', () => {
    const onSave = vi.fn()
    render(<DocumentUpload onSave={onSave} onClose={vi.fn()} />)

    expect(screen.queryByLabelText('Visible to')).not.toBeInTheDocument()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('rabbanutId')
    expect(onSave.mock.calls[0][0]).not.toHaveProperty('url')
  })

  it('owner gets a scope selector that defaults to global (null)', () => {
    const onSave = vi.fn()
    render(<DocumentUpload scopeOptions={[{ value: 'rb_a', label: 'Rabbanut A' }]} onSave={onSave} onClose={vi.fn()} />)

    expect(screen.getByLabelText('Visible to')).toBeInTheDocument()
    fill()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Checklist', category: 'Forms', rabbanutId: null })
  })

  it('blocks non-https links', () => {
    const onSave = vi.fn()
    render(<DocumentUpload onSave={onSave} onClose={vi.fn()} />)
    fill()

    fireEvent.change(screen.getByLabelText(/^Link/), { target: { value: 'javascript:alert(1)' } })
    expect(screen.getByText('Enter a full link starting with https://')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Link/), { target: { value: 'https://example.org/a.pdf' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ url: 'https://example.org/a.pdf' })
  })
})
