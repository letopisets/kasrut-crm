import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import SetupTwoFactor from '@/pages/SetupTwoFactor'
import { TwoFactorSetupGate } from '@/components/layout/ProtectedRoute'

// ── Controller / store mocks ───────────────────────────────────────────────
const CODES = ['A1B2C3D4E5', 'F6A7B8C9D0']
const mockLogout      = vi.fn()
const mockSetup2fa    = vi.fn()
const mockEnable2fa   = vi.fn()
const mockAcknowledge = vi.fn()

let ctrl = {
  user:                   { id: 'u1', role: 'owner', twoFactorEnabled: false } as null | object,
  token:                  'tok' as string | null,
  twoFactorSetupRequired: true,
  backupCodes:            null as string[] | null,
}

vi.mock('@/controllers/useAuthController', () => ({
  useAuthController: () => ({
    ...ctrl,
    logout:                 mockLogout,
    setup2fa:               mockSetup2fa,
    setupLoading:           false,
    enable2fa:              mockEnable2fa,
    enableLoading:          false,
    disable2fa:             vi.fn(),
    disableLoading:         false,
    acknowledgeBackupCodes: mockAcknowledge,
  }),
}))

vi.mock('@/store', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (sel: (s: unknown) => unknown) =>
    sel({ lang: { lang: 'en' }, auth: { twoFactorSetupRequired: ctrl.twoFactorSetupRequired } }),
}))

vi.mock('@/store/api/authApi', () => ({ useGetMeQuery: vi.fn() }))

vi.mock('@/i18n/useLang', () => ({
  useLang: () => ({
    appName: 'KashrutCRM',
    appSub:  'Kashrut Management System',
    logout:  'Logout',
    login:   { password: 'Password', tooManyAttempts: 'Locked out' },
    twoFactor: {
      settingsTitle:   'Two-Factor Authentication',
      enableBtn:       'Enable 2FA',
      codePlaceholder: '000000',
      codeMustBe6:     'Enter 6-digit code',
      requiredTitle:   'Two-factor authentication required',
      backupCodesTitle: 'Save your backup codes',
      backupCodesDone: 'I have saved these codes',
    },
  }),
}))

beforeEach(() => {
  ctrl = {
    user: { id: 'u1', role: 'owner', twoFactorEnabled: false },
    token: 'tok',
    twoFactorSetupRequired: true,
    backupCodes: null,
  }
  vi.clearAllMocks()
})

function renderAt(path: string) {
  // A fresh element each time, so rerender() re-reads the mocked controller.
  const tree = () => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/setup-2fa" element={<SetupTwoFactor />} />
        <Route path="/dashboard" element={<TwoFactorSetupGate><div>APP</div></TwoFactorSetupGate>} />
        <Route path="/login"     element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  )
  const result = render(tree())
  return { ...result, rerender: () => result.rerender(tree()) }
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('TwoFactorSetupGate', () => {
  it('sends a session confined to 2FA setup to the setup screen', () => {
    renderAt('/dashboard')
    expect(screen.queryByText('APP')).toBeNull()
    expect(screen.getByText('Two-factor authentication required')).toBeDefined()
  })

  it('lets any other session through', () => {
    ctrl.twoFactorSetupRequired = false
    renderAt('/dashboard')
    expect(screen.getByText('APP')).toBeDefined()
  })
})

describe('SetupTwoFactor page', () => {
  it('cannot be dismissed', () => {
    renderAt('/setup-2fa')
    expect(screen.getByTestId('two-factor-required')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeDefined()
    expect(screen.queryByTestId('CloseIcon')).toBeNull()
  })

  it('still lets the user sign out', () => {
    renderAt('/setup-2fa')
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(mockLogout).toHaveBeenCalled()
  })

  it('sends a signed-out visitor to the login page', () => {
    ctrl.user = null
    ctrl.token = null
    renderAt('/setup-2fa')
    expect(screen.getByText('LOGIN')).toBeDefined()
  })

  it('has nothing to do when setup is not required', () => {
    ctrl.twoFactorSetupRequired = false
    renderAt('/setup-2fa')
    expect(screen.getByText('APP')).toBeDefined()
  })

  it('shows the backup codes after enabling, then opens the app', async () => {
    mockSetup2fa.mockResolvedValue({ secret: 'SECRET', qrDataUrl: 'data:image/png;base64,qr' })
    // What the controller does: the new session is no longer confined, and
    // the codes wait in the store.
    mockEnable2fa.mockImplementation(async () => {
      ctrl.twoFactorSetupRequired = false
      ctrl.backupCodes = CODES
      return { backupCodes: CODES }
    })
    const view = renderAt('/setup-2fa')

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))
    fireEvent.change(await screen.findByPlaceholderText('000000'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enable 2FA' }))
    await waitFor(() => expect(mockEnable2fa).toHaveBeenCalledWith('123456'))
    view.rerender()

    expect(screen.getByTestId('backup-codes').textContent).toContain('A1B2C3D4E5')
    expect(screen.queryByText('APP')).toBeNull()
    expect(screen.queryByTestId('CloseIcon')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'I have saved these codes' }))
    expect(mockAcknowledge).toHaveBeenCalled()
    expect(await screen.findByText('APP')).toBeDefined()
  })
})
