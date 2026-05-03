import { test, expect } from '@playwright/test'
import { CRM_EMAIL, loginToCrm } from './helpers/crm'

// CRM login — happy path. Requires backend + CRM running and seeded.
test.describe('CRM login', () => {
  test('user can sign in with valid credentials', async ({ page }) => {
    await loginToCrm(page)
  })

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(CRM_EMAIL)
    await page.getByLabel(/password/i).fill('wrong-password')
    await page.getByRole('button', { name: /sign in|log in|войти|כניסה|אישור/i }).click()
    await expect(page.getByText(/invalid|неверн|לא נכון/i)).toBeVisible()
  })
})
