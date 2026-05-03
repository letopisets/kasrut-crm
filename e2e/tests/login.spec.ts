import { test, expect } from '@playwright/test'

// CRM login — happy path. Requires backend + CRM running and seeded.
test.describe('CRM login', () => {
  test('user can sign in with valid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL ?? 'owner@kashrut.il')
    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD ?? 'password')
    await page.getByRole('button', { name: /sign in|войти|אישור/i }).click()
    await expect(page).toHaveURL(/dashboard/)
  })

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('owner@kashrut.il')
    await page.getByLabel(/password/i).fill('wrong-password')
    await page.getByRole('button', { name: /sign in|войти|אישור/i }).click()
    await expect(page.getByText(/invalid|неверн|לא נכון/i)).toBeVisible()
  })
})
