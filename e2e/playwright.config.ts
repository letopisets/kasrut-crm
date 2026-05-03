import { defineConfig, devices } from '@playwright/test'

const CRM_URL = process.env.CRM_URL ?? 'http://localhost:5173'
const MAP_URL = process.env.MAP_URL ?? 'http://localhost:5174'

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'crm',
      use: { ...devices['Desktop Chrome'], baseURL: CRM_URL },
    },
    {
      name: 'map',
      use: { ...devices['Desktop Chrome'], baseURL: MAP_URL },
    },
  ],
})
