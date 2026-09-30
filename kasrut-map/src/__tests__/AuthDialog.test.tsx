import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'
import { mapAuthReducer } from '@/store/mapAuthSlice'
import ru from '@/i18n/ru'
import { AuthDialog } from '@/components/auth/AuthDialog'

const { mockLoginWithPassword, mockRegister, authConfig } = vi.hoisted(() => ({
  mockLoginWithPassword: vi.fn(),
  mockRegister:          vi.fn(),
  authConfig:            { providers: [] as unknown[], emailVerification: 'off' as 'required' | 'off' },
}))

vi.mock('@/store/api/mapCommunityApi', () => {
  const idle = () => [vi.fn(), { isLoading: false }]
  return {
    useGetMapAuthConfigQuery:           () => ({ data: authConfig, isLoading: false }),
    useOauthLoginMutation:              idle,
    useLoginWithPasswordMutation:       () => [mockLoginWithPassword, { isLoading: false }],
    useRegisterWithPasswordMutation:    () => [mockRegister, { isLoading: false }],
    useRequestPasswordResetMutation:    idle,
    useConfirmPasswordResetMutation:    idle,
    useResendEmailVerificationMutation: idle,
  }
})

// Russian, so neither message can come from the API's English error text.
function signIn(rejection: unknown) {
  mockLoginWithPassword.mockReturnValue({ unwrap: () => Promise.reject(rejection) })
  const store = configureStore({ reducer: { mapLang: mapLangReducer } })
  store.dispatch(setMapLang('ru'))
  render(
    <Provider store={store}>
      <AuthDialog open onClose={vi.fn()} />
    </Provider>,
  )
  fireEvent.change(screen.getByLabelText(ru.emailField), { target: { value: 'user@example.com' } })
  fireEvent.change(screen.getByLabelText(ru.passwordField), { target: { value: 'Passw0rd123' } })
  fireEvent.click(screen.getByRole('button', { name: ru.loginBtn2 }))
}

describe('AuthDialog — password sign-in errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the translated lockout message on 429', async () => {
    signIn({ status: 429, data: { error: 'Too many attempts. Try again later.' } })

    expect(await screen.findByText(ru.tooManyAttempts)).toBeInTheDocument()
    expect(screen.queryByText(ru.wrongCredentials)).toBeNull()
  })

  it('keeps the wrong-credentials message on 401', async () => {
    signIn({ status: 401, data: { error: 'Invalid email or password' } })

    expect(await screen.findByText(ru.wrongCredentials)).toBeInTheDocument()
  })
})

describe('AuthDialog — password registration', () => {
  const registered = {
    user: {
      id: 'mu1', email: 'new@example.com', phone: '+972500000001', firstName: 'New', lastName: 'User',
      name: 'New User', avatarUrl: null, emailVerified: false,
    },
    token: 'access-token',
  }

  function register() {
    mockRegister.mockReturnValue({ unwrap: () => Promise.resolve(registered) })
    const onClose = vi.fn()
    const store = configureStore({ reducer: { mapLang: mapLangReducer, mapAuth: mapAuthReducer } })
    store.dispatch(setMapLang('ru'))
    render(
      <Provider store={store}>
        <AuthDialog open onClose={onClose} />
      </Provider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: ru.registerTab }))
    fireEvent.change(screen.getByLabelText(ru.firstName), { target: { value: 'New' } })
    fireEvent.change(screen.getByLabelText(ru.lastName), { target: { value: 'User' } })
    fireEvent.change(screen.getByLabelText(ru.emailField), { target: { value: 'new@example.com' } })
    fireEvent.change(screen.getByLabelText(ru.phoneField), { target: { value: '+972500000001' } })
    fireEvent.change(screen.getByLabelText(ru.passwordField), { target: { value: 'Passw0rd123' } })
    fireEvent.click(screen.getByRole('button', { name: ru.registerBtn }))
    return { onClose, store }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs in and asks to check the email while verification is required', async () => {
    authConfig.emailVerification = 'required'
    const { onClose, store } = register()

    expect(await screen.findByText(ru.verifyEmailSent.replace('{email}', 'new@example.com'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ru.verifyEmailResend })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(store.getState().mapAuth.user?.id).toBe('mu1')
  })

  it('just closes while verification is off', async () => {
    authConfig.emailVerification = 'off'
    const { onClose, store } = register()

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByText(ru.verifyEmailTitle)).toBeNull()
    expect(store.getState().mapAuth.user?.id).toBe('mu1')
  })
})
