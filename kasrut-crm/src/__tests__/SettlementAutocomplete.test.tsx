import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// useLang reads the language from the Redux store — stub it so the component
// renders without a Provider.
vi.mock('@/store', () => ({
  useAppSelector: (sel: (s: { lang: { lang: string } }) => unknown) =>
    sel({ lang: { lang: 'en' } }),
}))

import { SettlementAutocomplete } from '@/components/ui/SettlementAutocomplete'
import type { SettlementOption } from '@/components/ui/SettlementAutocomplete'

const HAIFA: SettlementOption = { id: 's1', nameHe: 'חיפה', nameEn: 'Haifa', nameRu: 'Хайфа' }

describe('SettlementAutocomplete', () => {
  it('propagates manually typed text so cities outside the registry can be saved', () => {
    const onChange = vi.fn()
    const onTextChange = vi.fn()
    render(
      <SettlementAutocomplete value={null} onChange={onChange} onTextChange={onTextChange} />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Кфар Тапуах' } })

    expect(onTextChange).toHaveBeenCalledWith('Кфар Тапуах')
    // No settlement got selected — the parent keeps only the free text.
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ id: expect.anything() }))
  })

  it('clears a previously selected settlement when the text is manually edited', () => {
    const onChange = vi.fn()
    const onTextChange = vi.fn()
    render(
      <SettlementAutocomplete value={HAIFA} onChange={onChange} onTextChange={onTextChange} />,
    )

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Haifa Bay' } })

    // Keeping the stale settlementId alongside a different typed city would
    // save inconsistent data — the selection must reset.
    expect(onChange).toHaveBeenCalledWith(null)
    expect(onTextChange).toHaveBeenCalledWith('Haifa Bay')
  })

  it('seeds the visible text from initialText when editing a plain-text city', () => {
    render(
      <SettlementAutocomplete
        value={null}
        onChange={() => {}}
        initialText="Бней-Аиш"
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('Бней-Аиш')
  })

  it('prefers the linked settlement name over initialText when both exist', () => {
    render(
      <SettlementAutocomplete value={HAIFA} onChange={() => {}} initialText="ignored" />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('Haifa')
  })
})
