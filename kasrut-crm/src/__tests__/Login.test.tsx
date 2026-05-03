import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import Login from '@/pages/Login'

// ── Controller mock ────────────────────────────────────────────────────────
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
    appName: 'KashrutCRM',
    appSub:  'Kashrut Management System',
    login: {
      title:    'Authorization',
      password: 'Password',
      enterBtn: 'Sign in',
    },
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

const theme = createTheme()

function renderLogin() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <Login />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('Login page — email/password form', () => {
  it('renders the app name', () => {
    renderLogin()
    expect(screen.getByText('KashrutCRM')).toBeDefined()
  })

  it('renders email and password fields', () => {
    renderLogin()
    expect(screen.getByLabelText('Email')).toBeDefined()
    expect(screen.getByLabelText('Password')).toBeDefined()
  })

  it('renders the sign-in button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()
  })

  it('sign-in button is disabled until both fields filled', () => {
    renderLogin()
    const btn = screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Email'),    { target: { value: 'a@b.il' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw1' } })
    expect(btn.disabled).toBe(false)
  })

  it('calls login with entered credentials', () => {
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'),    { target: { value: 'admin@jer.il' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(mockLogin).toHaveBeenCalledWith('admin@jer.il', 'secret')
  })

  it('does not call login while loading', () => {
    ctrl.isLoading = true
    renderLogin()
    fireEvent.change(screen.getByLabelText('Email'),    { target: { value: 'a@b.il' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    // While loading, the sign-in button content is replaced by a spinner — match by progressbar
    const btns = screen.getAllByRole('button')
    const submitBtn = btns.find(b => (b as HTMLButtonElement).disabled) as HTMLButtonElement
    expect(submitBtn).toBeDefined()
    expect(submitBtn.disabled).toBe(true)
    fireEvent.click(submitBtn)
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

describe('Login page — 2FA step', () => {
  it('shows TOTP card when twoFactorPending', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    expect(screen.getByText('Two-Factor Authentication')).toBeDefined()
  })

  it('shows 6-digit input', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    expect(screen.getByPlaceholderText('000000')).toBeDefined()
  })

  it('back button calls cancelTwoFactor', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    fireEvent.click(screen.getByText('← Back'))
    expect(mockCancelTwoFactor).toHaveBeenCalled()
  })

  it('calls verify2fa when 6-digit code entered and Verify clicked', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    const input = screen.getByPlaceholderText('000000')
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByText('Verify'))
    expect(mockVerify2fa).toHaveBeenCalledWith('123456')
  })

  it('Verify button disabled when code shorter than 6 digits', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '12' } })
    const verifyBtn = screen.getByText('Verify').closest('button') as HTMLButtonElement
    expect(verifyBtn.disabled).toBe(true)
  })

  it('does not call verify2fa with code shorter than 6 digits', () => {
    ctrl.twoFactorPending = true
    renderLogin()
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('Verify'))
    expect(mockVerify2fa).not.toHaveBeenCalled()
  })
})
