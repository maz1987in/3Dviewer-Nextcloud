/**
 * The full viewer's toolbar on a phone, in a real Nextcloud, whose own styles decide how
 * much room the bar has. View in AR sits in the bar on a phone that can show a model in the
 * room; with Enter VR beside it on Android, the bar has to fit a 360 px phone without
 * pushing Tools, the way into everything else, off the screen.
 */
import type { Page } from '@playwright/test'
import { INDEX, expect, expectStandaloneLoaded, readState, test } from './helpers'

/** An iPhone (AR Quick Look) or an Android phone (WebXR AR and VR) */
async function asPhone(page: Page, kind: 'iphone' | 'android') {
	await page.addInitScript((kind) => {
		if (kind === 'iphone') {
			const supports = DOMTokenList.prototype.supports
			DOMTokenList.prototype.supports = function (token: string) {
				return token === 'ar' ? true : supports.call(this, token)
			}
		} else {
			Object.defineProperty(navigator, 'xr', {
				configurable: true,
				value: { isSessionSupported: async () => true, requestSession: async () => { throw new DOMException('No camera', 'NotAllowedError') } },
			})
		}
	}, kind)
}

for (const [kind, width] of [['iphone', 375], ['iphone', 393], ['android', 360], ['android', 412]] as const) {
	test(`on a ${width} px ${kind === 'iphone' ? 'iPhone' : 'Android phone'} the toolbar has View in AR and still fits Tools`, async ({ page }) => {
		await page.setViewportSize({ width, height: 800 })
		await asPhone(page, kind)
		await page.goto(`${INDEX}/apps/threedviewer/f/${readState().fileIds.stl}`)
		await expectStandaloneLoaded(page)

		const bar = page.locator('.minimal-top-bar')
		const ar = bar.getByRole('button', { name: 'View in AR' })
		const tools = bar.getByRole('button', { name: 'Toggle tools panel' })
		await expect(ar).toBeVisible()
		await expect(tools).toBeVisible()
		if (kind === 'android') {
			await expect(bar.getByRole('button', { name: 'Enter VR' })).toBeVisible()
		}
		const fit = await page.evaluate(() => {
			const element = document.querySelector('.minimal-top-bar') as HTMLElement
			const right = Math.max(...[...element.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent).map((b) => b.getBoundingClientRect().right))
			return { overflow: element.scrollWidth - element.clientWidth, right, width: innerWidth }
		})
		expect(fit.overflow, 'nothing in the bar is past its edge').toBeLessThanOrEqual(0)
		expect(fit.right, 'every button is on the screen').toBeLessThanOrEqual(fit.width)
	})
}
