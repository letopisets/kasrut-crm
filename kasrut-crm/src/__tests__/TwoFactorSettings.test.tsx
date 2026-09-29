import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'

const mockSetup2fa   = vi.fn()
const mockDisable2fa = vi.fn()
let user = { twoFactorEnabled: false }

vi.mock('@/controllers/useAuthController', () => ({
  useAuthController: () => ({
    user,
    setup2fa:       mockSetup2fa,
    setupLoading:   false,
    enable2fa:      vi.fn(),
    enableLoading:  false,
    disable2fa:     mockDisable2fa,
    disableLoading: false,
  }),
}))

vi.mock('@/i18n/useLang', () => ({
  useLang: () => ({
    // Unlike the API's error text, so the tests prove the key is read.
    login:     { password: 'Password', tooManyAttempts: 'Locked out (i18n)' },
    twoFactor: { enableBtn: 'Enable 2FA', disableBtn: 'Disable 2FA', codeMustBe6: 'Enter 6-digit code', codePlaceholder: '000000' },
  }),
}))

const LOCKED = { status: 429, data: { error: 'Too many attempts. Try again later.' } }

beforeEach(() => {
  user = { twoFactorEnabled: false }
  vi.clearAllMocks()
})

describe('TwoFactorSettings — sign-in lockout', () => {
  it('shows the lockout message when the setup password check is locked', async () => {
    mockSetup2fa.mockRejectedValueOnce(LOCKED)
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))

    expect(await screen.findByText('Locked out (i18n)')).toBeDefined()
    expect(mockSetup2fa).toHaveBeenCalledWith('right-password')
  })

  it('shows the lockout message instead of the code hint when disabling is locked', async () => {
    user = { twoFactorEnabled: true }
    mockDisable2fa.mockRejectedValueOnce(LOCKED)
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))

    expect(await screen.findByText('Locked out (i18n)')).toBeDefined()
    expect(screen.queryByText('Enter 6-digit code')).toBeNull()
  })

  it('keeps the code hint for a wrong code', async () => {
    user = { twoFactorEnabled: true }
    mockDisable2fa.mockRejectedValueOnce({ status: 400, data: { error: 'Invalid code' } })
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))

    expect(await screen.findByText('Enter 6-digit code')).toBeDefined()
  })
})
