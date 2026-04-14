import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Login from '@/pages/Login'

// ── Controller mock — state is driven by `ctrl` ────────────────────────────
const mockLogin           = vi.fn()
const mockVerify2fa       = vi.fn()
const mockCancelTwoFactor = vi.fn()

let ctrl = {
  user:             null as null | { id: string },
  isLoading:        false,
  twoFactorPending: false,
  pendingTempToken: null as string | null,
  error:            null as unknown,
}

vi.mock('@/controllers/useAuthController', () => ({
  useAuthController: () => ({
    ...ctrl,
    login:           mockLogin,
    verify2fa:       mockVerify2fa,
    cancelTwoFactor: mockCancelTwoFactor,
  }),
}))

vi.mock('@/store/useLangStore', () => ({
  useLangStore: (sel: (s: { lang: string; setLang: () => void }) => unknown) =>
    sel({ lang: 'en', setLang: vi.fn() }),
}))

vi.mock('@/i18n/useLang', () => ({
  useLang: () => ({
    appName:      'KashrutCRM',
    appSub:       'Kashrut Management System',
    loginHeading: 'Select profile',
    roles:        { owner: 'Owner', rabbanut: 'Rabbanut', mashgiach: 'Mashgiach' },
    roleDesc:     { owner: 'Full access', rabbanut: 'Manage org', mashgiach: 'Assignments only' },
    twoFactor: {
      title:           'Two-Factor Authentication',
      subtitle:        'Enter the 6-digit code',
      codePlaceholder: '000000',
      verifyBtn:       'Verify',
      backToLogin:     '← Back',
      codeMustBe6:     'Enter 6-digit code',
    },
  }),
}))

beforeEach(() => {
  ctrl = { user: null, isLoading: false, twoFactorPending: false, pendingTempToken: null, error: null }
  vi.clearAllMocks()
})

function renderLogin() {
  return render(<MemoryRouter><Login /></MemoryRouter>)
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Login page — profile selection', () => {
  it('renders all three role badges', () => {
    renderLogin()
    expect(screen.getByText('Owner')).toBeDefined()
    expect(screen.getByText('Rabbanut')).toBeDefined()
    expect(screen.getByText('Mashgiach')).toBeDefined()
  })

  it('renders the app name', () => {
    renderLogin()
    expect(screen.getByText('KashrutCRM')).toBeDefined()
  })

  it('renders the heading', () => {
    renderLogin()
    expect(screen.getByText('Select profile')).toBeDefined()
  })

  it('calls login with owner credentials when first card button clicked', () => {
    renderLogin()
    const btns = screen.getAllByText('Войти →')
    fireEvent.click(btns[0])
    expect(mockLogin).toHaveBeenCalledWith('owner@kashrut.il', 'password')
  })

  it('calls login with rabbanut credentials on second card button', () => {
    renderLogin()
    const btns = screen.getAllByText('Войти →')
    fireEvent.click(btns[1])
    expect(mockLogin).toHaveBeenCalledWith('admin@jer.il', 'password')
  })

  it('does not call login while loading', () => {
    ctrl.isLoading = true
    renderLogin()
    const btns = screen.getAllByRole('button', { name: '...' })
    // buttons are disabled; clicking them should not call login
    if (btns[0]) fireEvent.click(btns[0])
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

describe('Login page — 2FA step', () => {
  it('shows TOTP card instead of profile cards when twoFactorPending', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    expect(screen.getByText('Two-Factor Authentication')).toBeDefined()
    expect(screen.queryByText('Select profile')).toBeNull()
  })

  it('shows 6-digit input in TOTP step', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const input = screen.getByPlaceholderText('000000')
    expect(input).toBeDefined()
  })

  it('shows back button in TOTP step that calls cancelTwoFactor', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const backBtn = screen.getByText('← Back')
    fireEvent.click(backBtn)
    expect(mockCancelTwoFactor).toHaveBeenCalled()
  })

  it('calls verify2fa when 6-digit code entered and Verify clicked', async () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const input = screen.getByPlaceholderText('000000')
    fireEvent.change(input, { target: { value: '123456' } })
    const verifyBtn = screen.getByText('Verify')
    fireEvent.click(verifyBtn)
    // verify2fa is async but we just need to confirm it was called
    expect(mockVerify2fa).toHaveBeenCalledWith('123456')
  })

  it('does not call verify2fa when code is shorter than 6 digits', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const input = screen.getByPlaceholderText('000000')
    fireEvent.change(input, { target: { value: '123' } })
    const verifyBtn = screen.getByText('Verify')
    fireEvent.click(verifyBtn)
    expect(mockVerify2fa).not.toHaveBeenCalled()
  })

  it('Verify button is disabled when code is shorter than 6 digits', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const input = screen.getByPlaceholderText('000000')
    fireEvent.change(input, { target: { value: '12' } })
    const verifyBtn = screen.getByText('Verify').closest('button')!
    expect(verifyBtn.disabled).toBe(true)
  })
})
