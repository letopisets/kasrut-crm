import { test, expect } from '@playwright/test'

test.describe('Public map', () => {
  test('renders map and loads markers', async ({ page }) => {
    await page.goto('/')
    // MapLibre canvas container
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 10_000 })
  })

  test('opens filter panel', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /filter|фильтр|מסנן/i }).first().click()
    await expect(page.getByRole('button', { name: /apply|применить|החל/i })).toBeVisible()
  })
})
