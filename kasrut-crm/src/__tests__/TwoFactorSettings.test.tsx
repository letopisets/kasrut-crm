import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'

const mockSetup2fa   = vi.fn()
const mockEnable2fa  = vi.fn()
const mockDisable2fa = vi.fn()
const mockAcknowledge = vi.fn()
let user = { twoFactorEnabled: false }
let backupCodes: string[] | null = null

vi.mock('@/controllers/useAuthController', () => ({
  useAuthController: () => ({
    user,
    setup2fa:       mockSetup2fa,
    setupLoading:   false,
    enable2fa:      mockEnable2fa,
    enableLoading:  false,
    disable2fa:     mockDisable2fa,
    disableLoading: false,
    backupCodes,
    acknowledgeBackupCodes: mockAcknowledge,
  }),
}))

vi.mock('@/i18n/useLang', () => ({
  useLang: () => ({
    // Unlike the API's error text, so the tests prove the key is read.
    login:     { password: 'Password', tooManyAttempts: 'Locked out (i18n)' },
    twoFactor: {
      enableBtn: 'Enable 2FA', disableBtn: 'Disable 2FA', codeMustBe6: 'Enter 6-digit code', codePlaceholder: '000000',
      requiredForRole: 'Mandatory for your role (i18n)', backupCodesDone: 'I have saved these codes',
      wrongPassword: 'Wrong password (i18n)',
    },
  }),
}))

const LOCKED = { status: 429, data: { error: 'Too many attempts. Try again later.' } }

beforeEach(() => {
  user = { twoFactorEnabled: false }
  backupCodes = null
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

  it('says the password is wrong when the setup password check fails', async () => {
    mockSetup2fa.mockRejectedValueOnce({ status: 400, data: { error: 'Invalid credentials', code: 'INVALID_PASSWORD' } })
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))

    expect(await screen.findByText('Wrong password (i18n)')).toBeDefined()
  })

  it('shows the lockout message when enabling is locked', async () => {
    mockSetup2fa.mockResolvedValueOnce({ secret: 'MOCKSECRET32', qrDataUrl: 'data:image/png;base64,qr' })
    mockEnable2fa.mockRejectedValueOnce(LOCKED)
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'right-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))
    fireEvent.change(await screen.findByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))

    expect(await screen.findByText('Locked out (i18n)')).toBeDefined()
    expect(screen.queryByText('Enter 6-digit code')).toBeNull()
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

describe('TwoFactorSettings — owner 2FA policy', () => {
  it('explains that the role cannot switch 2FA off', async () => {
    user = { twoFactorEnabled: true }
    mockDisable2fa.mockRejectedValueOnce({
      status: 403,
      data: { error: 'Two-factor authentication is required for this role', code: 'TWO_FACTOR_REQUIRED_FOR_ROLE' },
    })
    render(<TwoFactorSettings onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Disable 2FA' }))

    expect(await screen.findByText('Mandatory for your role (i18n)')).toBeDefined()
    expect(screen.queryByText('Enter 6-digit code')).toBeNull()
  })

  it('shows fresh backup codes until they are acknowledged', () => {
    user = { twoFactorEnabled: true }
    backupCodes = ['A1B2C3D4E5', 'F6A7B8C9D0']
    const onClose = vi.fn()
    render(<TwoFactorSettings onClose={onClose} />)

    expect(screen.getByTestId('backup-codes').textContent).toContain('F6A7B8C9D0')
    fireEvent.click(screen.getByRole('button', { name: 'I have saved these codes' }))
    expect(mockAcknowledge).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('asks before a reload throws unsaved backup codes away', () => {
    user = { twoFactorEnabled: true }
    backupCodes = ['A1B2C3D4E5']
    const { unmount } = render(<TwoFactorSettings onClose={vi.fn()} />)

    const shown = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(shown)
    expect(shown.defaultPrevented).toBe(true)

    unmount()
    const gone = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(gone)
    expect(gone.defaultPrevented).toBe(false)
  })
})
