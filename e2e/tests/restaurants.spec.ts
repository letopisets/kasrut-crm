import { expect, test } from '@playwright/test'
import { loginToCrm, selectFirstNonEmptyOption } from './helpers/crm'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe('CRM restaurant CRUD', () => {
  test('owner can create, edit and delete a restaurant', async ({ page }) => {
    const createdName = `E2E Restaurant ${Date.now()}`
    const updatedName = `${createdName} Updated`

    await loginToCrm(page)
    await page.goto('/restaurants')
    await expect(page.getByRole('heading', { name: /establishments|заведен|מסעד/i })).toBeVisible()

    await page.getByRole('button', { name: /^add$|добав|הוסף/i }).click()

    const rabbanutField = page.getByLabel(/rabbanut|authority|org|орган|раввинат|רבנות/i)
    if (await rabbanutField.count()) {
      await selectFirstNonEmptyOption(page, /rabbanut|authority|org|орган|раввинат|רבנות/i)
    }

    await page.getByLabel(/name|название|שם/i).fill(createdName)
    await page.getByLabel(/address|адрес|כתובת/i).fill('1 E2E Street')
    await selectFirstNonEmptyOption(page, /city|город|עיר/i)
    await selectFirstNonEmptyOption(page, /kashrut level|уровень|רמת/i)
    await selectFirstNonEmptyOption(page, /hechsher|кашрут|הכשר/i)
    await page.getByLabel(/expiry date|expires|срок|תוקף/i).fill('2030-12-31')

    await page.getByRole('button', { name: /save|сохран|שמור/i }).click()
    await expect(page.getByText(createdName)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: new RegExp(`edit ${escapeRegExp(createdName)}`, 'i') }).click()
    await page.getByLabel(/name|название|שם/i).fill(updatedName)
    await page.getByRole('button', { name: /save|сохран|שמור/i }).click()
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: new RegExp(`delete ${escapeRegExp(updatedName)}`, 'i') }).click()
    await expect(page.getByText(updatedName)).toBeHidden({ timeout: 15_000 })
  })
})
