import { expect, type Page } from '@playwright/test'

export const CRM_EMAIL = process.env.E2E_EMAIL ?? 'owner@kashrut.il'
export const CRM_PASSWORD = process.env.E2E_PASSWORD ?? 'password'

export async function loginToCrm(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(CRM_EMAIL)
  await page.getByLabel(/password|пароль|סיסמה/i).fill(CRM_PASSWORD)
  await page.getByRole('button', { name: /sign in|log in|войти|כניסה|אישור/i }).click()
  await expect(page).toHaveURL(/dashboard|setup-2fa/, { timeout: 15_000 })
  // An owner without 2FA is confined to the forced setup screen while the API
  // runs with REQUIRE_OWNER_2FA=true (its default); see e2e/README.md.
  if (page.url().includes('/setup-2fa')) {
    throw new Error('E2E owner landed on /setup-2fa: run the API with REQUIRE_OWNER_2FA=false (see e2e/README.md)')
  }
}

export async function selectFirstNonEmptyOption(page: Page, label: RegExp): Promise<string> {
  await page.getByLabel(label).first().click()

  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible()

  const options = listbox.getByRole('option')
  const count = await options.count()

  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index)
    const text = (await option.textContent())?.trim()
    const value = await option.getAttribute('data-value')

    if (text && text !== '-' && text !== '—' && value !== '') {
      await option.click()
      return text
    }
  }

  throw new Error(`No selectable option found for ${label}`)
}
