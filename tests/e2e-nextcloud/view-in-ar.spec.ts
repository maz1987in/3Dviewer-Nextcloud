/**
 * View in AR on a public link, in a real Nextcloud, for a visitor who is not logged in.
 *
 * The share page has a Content-Security-Policy of its own, and View in AR loads its code
 * only when the button is pressed: the flow, the size limits, the WebXR session, and on an
 * iPhone the USDZ exporter. A chunk the policy refuses, or one served from the wrong place,
 * would show only on a phone. This presses the button with the phone parts of the browser
 * stubbed (as tests/playwright/view-in-ar-light.spec.ts does) and lets the guard fail the
 * test on any policy violation or missing file.
 *
 * What this cannot do: open Quick Look, or run a session on a camera.
 */
import type { Page } from '@playwright/test'
import { INDEX, expect, expectModelShown, readState, test } from './helpers'

test.use({ storageState: { cookies: [], origins: [] } })

/** The light viewer's View in AR button */
const arButton = (page: Page) => page.locator('.viewer-bottom-actions').getByRole('button', { name: /AR$/ })

test('a visitor\'s Android phone is asked for an AR session from a public link', async ({ page }) => {
	await page.addInitScript(() => {
		;(window as any).__xrRequests = []
		Object.defineProperty(navigator, 'xr', {
			configurable: true,
			value: {
				isSessionSupported: async (mode: string) => mode === 'immersive-ar',
				requestSession: async (mode: string, init: any) => {
					;(window as any).__xrRequests.push({ mode, requiredFeatures: init.requiredFeatures })
					// Refused, as a browser with no camera would: the request is what is checked
					throw new DOMException('The camera is not allowed', 'NotAllowedError')
				},
			},
		})
	})
	await page.goto(`${INDEX}/s/${readState().shares.stl}`)
	await expectModelShown(page)

	const button = arButton(page)
	await expect(button).toHaveText('View in AR')
	await button.click()
	await page.waitForFunction(() => (window as any).__xrRequests.length === 1)
	expect(await page.evaluate(() => (window as any).__xrRequests[0])).toEqual({ mode: 'immersive-ar', requiredFeatures: ['hit-test'] })
	await expect(page.getByRole('alert').filter({ hasText: 'AR could not start' })).toBeVisible()
	await expect(button).not.toHaveAttribute('aria-disabled', 'true')
})

test('a visitor\'s iPhone gets a USDZ file for AR Quick Look from a public link', async ({ page }) => {
	await page.addInitScript(() => {
		const supports = DOMTokenList.prototype.supports
		DOMTokenList.prototype.supports = function (token: string) {
			return token === 'ar' ? true : supports.call(this, token)
		}
		// The file is read where it is made: fetching a blob: address back could itself
		// break the page's policy, which is not what is under test
		;(window as any).__usdz = []
		const createObjectURL = URL.createObjectURL.bind(URL)
		URL.createObjectURL = (object: Blob | MediaSource) => {
			const url = createObjectURL(object)
			if (object instanceof Blob && object.type === 'model/vnd.usdz+zip') {
				;(window as any).__usdz.push({ url, size: object.size })
			}
			return url
		}
		;(window as any).__arClicks = []
		document.addEventListener('click', (event) => {
			const anchor = event.target instanceof Element ? event.target.closest('a[rel~="ar"]') : null
			if (anchor) {
				event.preventDefault()
				;(window as any).__arClicks.push({ href: anchor.getAttribute('href'), firstChild: anchor.firstElementChild?.tagName })
			}
		}, true)
	})
	await page.goto(`${INDEX}/s/${readState().shares.stl}`)
	await expectModelShown(page)

	await arButton(page).click()
	await page.waitForFunction(() => (window as any).__arClicks.length === 1)
	const { clicks, files } = await page.evaluate(() => ({ clicks: (window as any).__arClicks, files: (window as any).__usdz }))
	expect(files).toHaveLength(1)
	expect(files[0].size).toBeGreaterThan(0)
	expect(clicks[0]).toEqual({ href: `${files[0].url}#allowsContentScaling=0`, firstChild: 'IMG' })
	await expect(page.locator('.viewer-ar-message--error')).toHaveText('')
})
