import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import mapLangReducer, { setMapLang } from '@/store/mapLangSlice'
import ru from '@/i18n/ru'
import { AuthDialog } from '@/components/auth/AuthDialog'

const { mockLoginWithPassword } = vi.hoisted(() => ({ mockLoginWithPassword: vi.fn() }))

vi.mock('@/store/api/mapCommunityApi', () => {
  const idle = () => [vi.fn(), { isLoading: false }]
  return {
    useGetMapAuthConfigQuery:        () => ({ data: { providers: [] }, isLoading: false }),
    useOauthLoginMutation:           idle,
    useLoginWithPasswordMutation:    () => [mockLoginWithPassword, { isLoading: false }],
    useRegisterWithPasswordMutation: idle,
    useRequestPasswordResetMutation: idle,
    useConfirmPasswordResetMutation: idle,
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
