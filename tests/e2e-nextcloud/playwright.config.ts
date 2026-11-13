/**
 * Playwright config for the suite that runs against a real Nextcloud server.
 *
 * Not the root `playwright.config.ts`: that one serves the built bundle from a static stand-in
 * page with a fake `OCA`, and its `testDir` would sweep these specs up and run them with no
 * server behind them. The root config ignores this directory; this one is started on its own:
 *
 *   E2E_BASE_URL=http://localhost:8080 npx playwright test -c tests/e2e-nextcloud/playwright.config.ts
 *
 * See docs/TESTING.md, "Real-Nextcloud browser tests".
 */
import { defineConfig } from '@playwright/test'
import { AUTH_FILE, BASE_URL } from './env'

// Software WebGL (SwiftShader), so Three.js gets a GL context on a GPU-less runner.
const WEBGL_FLAGS = [
	'--use-gl=angle',
	'--use-angle=swiftshader',
	'--enable-unsafe-swiftshader',
	'--ignore-gpu-blocklist',
	'--enable-webgl',
]

export default defineConfig({
	testDir: '.',
	testMatch: /.*\.spec\.ts/,
	globalSetup: './global-setup.ts',
	// One user, one server, and a software renderer: running specs side by side only makes
	// the loads slower and the failures harder to read.
	workers: 1,
	retries: 0,
	timeout: 90_000,
	expect: { timeout: 45_000 },
	reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report/e2e-nextcloud' }]],
	outputDir: '../../test-results/e2e-nextcloud',
	use: {
		baseURL: BASE_URL,
		headless: true,
		viewport: { width: 1280, height: 800 },
		storageState: AUTH_FILE,
		// No screencast and no DOM snapshots: both read the WebGL canvas back, and on a software
		// renderer that stalled the first load for a minute, so a test failed that tracing alone
		// had broken. The network log, the console and the actions stay in the trace; a failed
		// test also keeps a screenshot, taken once the page has stopped.
		trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false },
		screenshot: 'only-on-failure',
		launchOptions: { args: WEBGL_FLAGS },
	},
	projects: [
		{ name: 'chromium', use: { browserName: 'chromium' } },
	],
})
