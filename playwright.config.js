// Basic Playwright config for local smoke tests.
// NOTE: This does not spin up a full Nextcloud; we instead load the built viewer assets via a lightweight static server scenario could be added later.
// For now, we mark tests as skipped if required DOM mount point not present (placeholder structure for future NC integration test harness).
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/playwright',
  retries: 0,
  timeout: 20000,
  reporter: [['list']],
  use: {
    browserName: 'chromium',
    viewport: { width: 1200, height: 800 },
    ignoreHTTPSErrors: true,
    trace: 'off',
  },
})
