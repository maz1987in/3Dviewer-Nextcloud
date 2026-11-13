/**
 * Shared pieces of the real-Nextcloud suite: where the server is, which models are uploaded,
 * and the guard every test runs under.
 *
 * The guard is what makes these specs catch the failures this suite exists for. A model that
 * loads proves the happy path; the guard fails the test on what the happy path can hide: a
 * Content-Security-Policy violation (#169, #204) and a 404 for one of the app's own files
 * (#188, #211), which a loader that swallows its error would otherwise leave as a silent spinner.
 */
import { test as base, expect, type Page, type Response } from '@playwright/test'
import { APP_ASSET_ROOT } from './env'

export * from './env'

const CSP_MESSAGE = /Content Security Policy|Refused to (evaluate|load|create|execute|apply|connect)/i

/** Whether a URL is one of the app's own files, as opposed to one of its routes */
function isAppAsset(url: string): boolean {
	const { pathname } = new URL(url)
	return /^\/(custom_apps|apps)\/threedviewer\//.test(pathname)
}

/** What a test watched the browser do */
export type Guard = {
	/** Status of each of the app's own files the page asked for, by path */
	assets: Map<string, number>
	/** Everything that makes the test fail, in the order it happened */
	problems: string[]
}

function watch(page: Page): Guard {
	const guard: Guard = { assets: new Map(), problems: [] }

	// Reported by the page itself. A policy violation in a worker is not seen here, but
	// Chromium also prints it to the console, which the listeners below pick up.
	page.exposeFunction('__tdvReportCsp', (detail: string) => {
		guard.problems.push(`CSP violation: ${detail}`)
	}).catch(() => {})
	page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (event) => {
			(window as any).__tdvReportCsp?.(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'} (${event.sourceFile ?? 'page'}:${event.lineNumber})`)
		})
	}).catch(() => {})

	const onConsole = (msg: { text(): string, type(): string }) => {
		if (CSP_MESSAGE.test(msg.text())) {
			guard.problems.push(`console ${msg.type()}: ${msg.text()}`)
		}
	}
	page.on('console', onConsole)
	// A model's decoder often runs in a Web Worker, and a worker's console is not the page's.
	page.on('worker', (worker) => {
		worker.on('console', onConsole)
	})

	page.on('response', (response: Response) => {
		const url = response.url()
		if (!isAppAsset(url)) {
			return
		}
		const { pathname } = new URL(url)
		guard.assets.set(pathname, response.status())
		if (response.status() >= 400) {
			guard.problems.push(`${response.status()} for the app file ${pathname}`)
		}
	})
	page.on('requestfailed', (request) => {
		if (isAppAsset(request.url()) && !/ERR_ABORTED/.test(request.failure()?.errorText ?? '')) {
			guard.problems.push(`request for ${new URL(request.url()).pathname} failed: ${request.failure()?.errorText}`)
		}
	})

	return guard
}

export const test = base.extend<{ guard: Guard }>({
	guard: [async ({ page }, use) => {
		const guard = watch(page)
		await use(guard)
		// Reported after the test body, so a model that failed to load shows the CSP message
		// or the 404 behind it as well as its own timeout.
		expect(guard.problems, 'CSP violations and failed requests for the app\'s own files').toEqual([])
	}, { auto: true }],
})

export { expect }

/**
 * Assert that a path under the app was requested and served, which shows that the app is
 * served from where this suite installed it and that the loader asked for the right place.
 *
 * @param guard - what the test watched
 * @param assetPath - e.g. `/custom_apps/threedviewer/occt/occt-import-js.wasm`
 */
export function expectServed(guard: Guard, assetPath: string) {
	expect(guard.assets.get(assetPath), `${assetPath} was requested and answered 200`).toBe(200)
}

/**
 * Wait until the light viewer (the Files viewer, a public share page) shows a loaded model,
 * and check the model has geometry.
 *
 * `.viewer-bottom-actions` only exists once the loader has finished. The model-info panel
 * then says what is in the scene, so an empty group or a failed decode cannot pass.
 *
 * @param page - the page the viewer is on
 */
export async function expectModelShown(page: Page) {
	// The Files viewer also mounts the neighbouring file, hidden and not loaded, so the
	// viewer to look at is the one that has finished.
	const wrapper = page.locator('.threedviewer-wrapper').filter({ has: page.locator('.viewer-bottom-actions') })
	await expect(wrapper).toBeVisible()
	await expect(wrapper.locator('canvas.threedviewer-canvas')).toBeVisible()

	await wrapper.getByRole('button', { name: 'Model info' }).click()
	const faces = wrapper.locator('.viewer-stats-panel .stats-row', { hasText: 'Faces' }).locator('.stats-value')
	await expect(faces).toBeVisible()
	const count = Number((await faces.innerText()).replace(/\D/g, ''))
	expect(count, 'the loaded model has faces').toBeGreaterThan(0)
}

/**
 * Wait until the full viewer page reports a finished load.
 *
 * @param page - the page /apps/threedviewer/f/{id} is on
 */
export async function expectStandaloneLoaded(page: Page) {
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true || (window as any).__LOAD_ERROR !== undefined)
	const state = await page.evaluate(() => ({
		complete: (window as any).__LOAD_COMPLETE,
		error: (window as any).__LOAD_ERROR,
	}))
	expect(state.error, 'the viewer reported no load error').toBeUndefined()
	expect(state.complete, 'the viewer reported the model loaded').toBe(true)
}
