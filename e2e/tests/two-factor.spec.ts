import { expect, test } from '@playwright/test'
import { loginToCrm } from './helpers/crm'
import { generateTotp } from './helpers/totp'

const TWO_FACTOR_BUTTON = /two-factor|2fa|двухфактор|אימות דו/i
const ENABLE_BUTTON = /enable 2fa|включить 2fa|הפעל/i
const DISABLE_BUTTON = /disable 2fa|отключить 2fa|השבת/i

test.describe('CRM 2FA settings', () => {
  test.describe.configure({ mode: 'serial' })

  test('user can enable and disable 2FA', async ({ page }) => {
    await loginToCrm(page)

    await page.getByRole('button', { name: TWO_FACTOR_BUTTON }).click()

    const alreadyEnabled = await page
      .getByText(/2FA is enabled|2FA включена|מופעל/i)
      .isVisible()
      .catch(() => false)
    test.skip(alreadyEnabled, 'Seeded E2E user must start with 2FA disabled for this flow')

    await page.getByRole('button', { name: ENABLE_BUTTON }).click()
    const secret = (await page.getByTestId('totp-secret').innerText()).replace(/\s+/g, '')

    await page.getByPlaceholder(/000000/).fill(generateTotp(secret))
    await page.getByRole('button', { name: ENABLE_BUTTON }).click()
    await expect(page.getByTestId('two-factor-success')).toBeVisible()
    await page.getByTestId('two-factor-success').waitFor({ state: 'detached', timeout: 5_000 })

    await page.getByRole('button', { name: TWO_FACTOR_BUTTON }).click()
    await page.getByRole('button', { name: DISABLE_BUTTON }).click()
    await page.getByPlaceholder(/000000/).fill(generateTotp(secret))
    await page.getByRole('button', { name: DISABLE_BUTTON }).click()
    await expect(page.getByTestId('two-factor-success')).toBeVisible()
  })
})
