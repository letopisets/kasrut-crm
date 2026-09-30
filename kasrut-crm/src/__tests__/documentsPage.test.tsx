import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import Documents from '@/pages/Documents'
import type { KashrutDocument, Rabbanut, Role } from '@/types'

// Renders the real page + controller per role, so the delete rule and the
// owner-only scope selector are checked as wired, not as hand-written stubs.
const h = vi.hoisted(() => ({
  state: {
    auth: { role: 'owner' as string, user: null as null | { rabbanutId?: string } },
    lang: { lang: 'en' },
  },
  docs:      [] as unknown[],
  rabbanuts: [] as unknown[],
  del:       vi.fn(),
}))

vi.mock('@/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/store')>()),
  useAppSelector: (sel: (s: unknown) => unknown) => sel(h.state),
}))
vi.mock('@/store/api/documentsApi', () => ({
  useGetDocumentsQuery:      () => ({ data: h.docs, isLoading: false }),
  useCreateDocumentMutation: () => [vi.fn()],
  useDeleteDocumentMutation: () => [h.del],
}))
vi.mock('@/store/api/rabbanutApi', () => ({
  useGetRabbanutsQuery: () => ({ data: h.rabbanuts }),
}))

const doc = (id: string, rabbanutId: string | null): KashrutDocument => ({
  id, name: `Doc ${id}`, category: 'Pesach', date: '2026-09-30', size: '0', ext: 'PDF', rabbanutId,
})
const rb = (id: string, active = true): Rabbanut => ({
  id, name: `R ${id}`, city: '', contact: '', phone: '', email: '', active, color: '#000',
})

function renderAs(role: Role, rabbanutId?: string, lang = 'en') {
  h.state.auth = { role, user: rabbanutId ? { rabbanutId } : null }
  h.state.lang = { lang }
  return render(<Documents />)
}

describe('Documents page per role', () => {
  beforeEach(() => {
    h.docs = [doc('global', null), doc('mine', 'rb_mine'), doc('other', 'rb_other'), doc('gone', 'rb_deleted')]
    h.rabbanuts = [rb('rb_mine'), rb('rb_other'), rb('rb_off', false)]
    h.del.mockReset()
  })

  it('owner: delete on every document, scope selector with active rabbanuts only', () => {
    renderAs('owner')

    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(4)
    // A soft-deleted rabbanut is not in the list: neutral label, never the raw id.
    expect(screen.getByText('Unknown authority')).toBeInTheDocument()
    expect(screen.queryByText('rb_deleted')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Upload/ }))
    fireEvent.mouseDown(screen.getByLabelText('Visible to'))
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map(o => o.textContent)
    expect(options).toEqual(['All authorities (global)', 'R rb_mine', 'R rb_other'])
  })

  it('rabbanut: delete only its own documents, no scope selector', () => {
    h.docs = [doc('global', null), doc('mine', 'rb_mine')]
    h.rabbanuts = [rb('rb_mine')]
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAs('rabbanut', 'rb_mine')

    const deletes = screen.getAllByRole('button', { name: 'Delete' })
    expect(deletes).toHaveLength(1)
    fireEvent.click(deletes[0])
    expect(confirm).toHaveBeenCalled()
    expect(h.del).toHaveBeenCalledWith('mine')

    fireEvent.click(screen.getByRole('button', { name: /Upload/ }))
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Visible to')).not.toBeInTheDocument()
    confirm.mockRestore()
  })

  it('mashgiach: no delete, no upload', () => {
    h.docs = [doc('global', null), doc('mine', 'rb_mine')]
    h.rabbanuts = [rb('rb_mine')]
    renderAs('mashgiach', 'rb_mine')

    expect(screen.getByText('Doc mine')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument()
  })

  it('category filter buttons and badges are translated', () => {
    h.docs = [doc('global', null)]
    renderAs('mashgiach', 'rb_mine', 'he')

    // Filter button + the document's badge, both in Hebrew.
    expect(screen.getAllByText('פסח')).toHaveLength(2)
    expect(screen.queryByText('Pesach')).not.toBeInTheDocument()
  })
})
