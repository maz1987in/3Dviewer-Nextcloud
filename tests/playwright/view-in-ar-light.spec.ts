/**
 * View in AR in the light viewer: the viewer a public link to one model opens (and the Files
 * app's preview), in Chromium with the phone parts of the browser stubbed, as
 * view-in-ar.spec.ts does for the full viewer. The button is among the viewer's own buttons
 * only where AR is possible; a visitor's iPhone gets a real USDZ file at the size the file's
 * unit says, from the share's own settings route; Android Chrome is asked for a WebXR
 * session with hit-test; a splat has it off with the reason; and a frame on another site
 * does not offer it.
 *
 * What this cannot do: open Quick Look, or run a session on a camera (see the pull request).
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { startServer, openViewer, stlCube, type Viewer } from './helpers/viewerServer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CUBE = { id: 8201, name: 'cube.stl', body: stlCube(10) }
const SPLAT = { id: 8202, name: 'grid.splat', body: fs.readFileSync(path.join(HERE, '../fixtures/splats/grid.splat')) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/** A visitor with no account, on the page a public link to one model opens. */
const visitor = (token: string, more: Viewer = {}): Viewer => ({ user: null, publicToken: token, lite: true, ...more })

/** An iPhone's Safari: links with rel="ar" can open AR Quick Look. Taps on them are caught, not followed. */
async function asIPhone(page: Page) {
	await page.addInitScript(() => {
		const supports = DOMTokenList.prototype.supports
		DOMTokenList.prototype.supports = function (token: string) {
			return token === 'ar' ? true : supports.call(this, token)
		}
		;(window as any).__arClicks = []
		document.addEventListener('click', async (event) => {
			const anchor = event.target instanceof Element ? event.target.closest('a[rel~="ar"]') : null
			if (!anchor) return
			event.preventDefault()
			const href = anchor.getAttribute('href') as string
			const body = await (await fetch(href.split('#')[0])).arrayBuffer()
			;(window as any).__arClicks.push({
				href,
				rel: anchor.getAttribute('rel'),
				firstChild: anchor.firstElementChild?.tagName,
				bytes: Array.from(new Uint8Array(body)),
			})
		}, true)
	})
}

/** Android Chrome: WebXR can start an immersive-ar session. The session is asked for and refused, so the request can be read. */
async function asAndroid(page: Page) {
	await page.addInitScript(() => {
		;(window as any).__xrRequests = []
		Object.defineProperty(navigator, 'xr', {
			configurable: true,
			value: {
				isSessionSupported: async (mode: string) => mode === 'immersive-ar',
				requestSession: async (mode: string, init: any) => {
					;(window as any).__xrRequests.push({
						mode,
						requiredFeatures: init.requiredFeatures,
						optionalFeatures: init.optionalFeatures,
						overlay: init.domOverlay?.root?.getAttribute('aria-label') ?? null,
					})
					throw new DOMException('The camera is not allowed', 'NotAllowedError')
				},
			},
		})
	})
}

/** The light viewer's own buttons */
const actions = (page: Page) => page.locator('.viewer-bottom-actions')
const arButton = (page: Page) => actions(page).getByRole('button', { name: /AR$/ })

/** The USD files of a USDZ, as one text. */
const usda = (bytes: number[]) => Object.values(unzipSync(Uint8Array.from(bytes))).map((file) => strFromU8(file as Uint8Array)).join('\n')

/** How big the model is in the file, in metres: its largest extent under the scales it is put in. */
function extentInMetres(layer: string) {
	const scales = [...layer.matchAll(/matrix4d xformOp:transform = \(\s*\(([-\d.e]+),/g)].map((m) => Number(m[1]))
	const points = layer.match(/point3f\[\] points = \[(.*)\]/)![1]
	const sizes = [0, 1, 2].map((axis) => {
		const values = [...points.matchAll(/\(([-\d.e]+), ([-\d.e]+), ([-\d.e]+)\)/g)].map((m) => Number(m[axis + 1]))
		return Math.max(...values) - Math.min(...values)
	})
	return Math.max(...sizes) * scales.reduce((a, b) => a * b, 1)
}

/** Press View in AR on an "iPhone" and read the file Quick Look was handed. */
async function quickLookFile(page: Page) {
	await arButton(page).click()
	await page.waitForFunction(() => (window as any).__arClicks.length === 1, null, { timeout: 20000 })
	return page.evaluate(() => (window as any).__arClicks[0])
}

test('a desktop visitor is not offered View in AR', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, CUBE, visitor('ardesk'))
	await expect(actions(page).getByRole('button', { name: 'Screenshot' })).toBeVisible()
	await expect(page.getByRole('button', { name: /AR$/ })).toHaveCount(0)
	expect(errors).toEqual([])
})

test('a visitor\'s iPhone gets the model in AR Quick Look as a USDZ file in metres', async ({ page }) => {
	await asIPhone(page)
	const { errors } = await openViewer(page, server.url, CUBE, visitor('arphone'))
	const button = arButton(page)
	await expect(button).toHaveText('View in AR')
	await expect(button).not.toHaveAttribute('aria-disabled', 'true')
	// First, before the icons: it is what a visitor on a phone came for
	await expect(actions(page).locator('button').first()).toHaveText('View in AR')

	const opened = await quickLookFile(page)
	expect(opened.rel).toBe('ar')
	expect(opened.firstChild).toBe('IMG')
	expect(opened.href).toMatch(/^blob:.*#allowsContentScaling=0$/)
	const layer = usda(opened.bytes)
	expect(layer).toMatch(/metersPerUnit = 1\b/)
	// An STL is in millimetres: 10 of them are a centimetre in the room
	expect(extentInMetres(layer)).toBeCloseTo(0.01, 9)
	await expect(button).toHaveText('View in AR')
	await expect(page.locator('.viewer-ar-message--error')).toHaveText('')
	expect(errors).toEqual([])
})

test('the unit chosen for the file, read through the share, sets the size in the room', async ({ page }) => {
	await asIPhone(page)
	await openViewer(page, server.url, CUBE, visitor('arunit', { unit: 'cm' }))
	// 10 of the file's units, chosen as centimetres, are 10 cm
	expect(extentInMetres(usda((await quickLookFile(page)).bytes))).toBeCloseTo(0.1, 9)
})

test('a visitor\'s Android phone is asked for a WebXR immersive-ar session with hit-test, and told when it is refused', async ({ page }) => {
	await asAndroid(page)
	const { errors } = await openViewer(page, server.url, CUBE, visitor('arandroid'))
	const button = arButton(page)
	await expect(button).toHaveText('View in AR')

	await button.click()
	await page.waitForFunction(() => (window as any).__xrRequests.length === 1, null, { timeout: 20000 })
	expect(await page.evaluate(() => (window as any).__xrRequests[0])).toEqual({
		mode: 'immersive-ar',
		requiredFeatures: ['hit-test'],
		optionalFeatures: ['dom-overlay'],
		overlay: 'View in AR',
	})

	// No toast reaches a share page: the viewer says it, in its urgent line
	await expect(page.getByRole('alert').filter({ hasText: 'AR could not start' })).toBeVisible()
	// Nothing is left over the page, the viewer still draws, and it can be tried again
	await expect(page.locator('body > [role="region"][aria-label="View in AR"]')).toHaveCount(0)
	await expect(button).not.toHaveAttribute('aria-disabled', 'true')
	await expect(page.locator('canvas.threedviewer-canvas')).toBeVisible()
	expect(await page.evaluate(() => (window as any).__arClicks)).toBeUndefined()

	await button.click()
	await page.waitForFunction(() => (window as any).__xrRequests.length === 2, null, { timeout: 20000 })
	expect(errors).toEqual([])
})

test('a splat has the button off, and says why when it is pressed', async ({ page }) => {
	await asIPhone(page)
	const { errors } = await openViewer(page, server.url, SPLAT, visitor('arsplat'))
	const button = arButton(page)
	await expect(button).toHaveAttribute('aria-disabled', 'true')
	await expect(button).toHaveAccessibleDescription('A splat has no real surface to stand in a room.')

	// Playwright waits for an aria-disabled button to be enabled; a person's tap does not
	await button.click({ force: true })
	await expect(page.getByRole('status').filter({ hasText: 'A splat has no real surface to stand in a room.' })).toBeVisible()
	await page.waitForTimeout(500)
	expect(await page.evaluate(() => (window as any).__arClicks.length)).toBe(0)
	expect(errors).toEqual([])
})

test('a frame on another site does not offer View in AR', async ({ page }) => {
	await asIPhone(page)
	await asAndroid(page)
	const { errors } = await openViewer(page, server.url, CUBE, {
		user: null,
		publicToken: 'aremb',
		embed: { shareUrl: 'https://cloud.example/s/aremb', downloadUrl: null },
	})
	await expect(actions(page)).toBeVisible()
	await expect(page.getByRole('button', { name: /AR$/ })).toHaveCount(0)
	expect(errors).toEqual([])
})
