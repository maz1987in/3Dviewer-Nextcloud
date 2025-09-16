import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.(ts|js)/,
  retries: 0,
  reporter: [['list']],
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
