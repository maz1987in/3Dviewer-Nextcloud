/**
 * View in AR through the whole app, in Chromium with the phone parts of the browser
 * stubbed: the button is hidden where nothing can show the model in a room; where a link
 * can open AR Quick Look (an iPhone), the model is written as a real USDZ file in metres and
 * handed to an `<a rel="ar">` link holding an image; where WebXR can start an
 * `immersive-ar` session (Android Chrome), the session is asked for with hit-test; and a
 * scan or splat has the button off, with the reason. The unit suites cover the placement
 * and the choice of way.
 *
 * What this cannot do: open Quick Look, or run a session on a camera. That takes a real
 * iPhone and a real Android phone (see the pull request).
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CUBE = { id: 8101, name: 'cube.stl', body: stlCube(10) }
const SPLAT = { id: 8102, name: 'grid.splat', body: fs.readFileSync(path.join(HERE, '../fixtures/splats/grid.splat')) }

/** A glTF triangle two metres along each leg: glTF is in metres. */
const TRIANGLE = (() => {
	const positions = Buffer.from(new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]).buffer)
	return {
		id: 8103,
		name: 'triangle.gltf',
		body: JSON.stringify({
			asset: { version: '2.0' },
			scene: 0,
			scenes: [{ nodes: [0] }],
			nodes: [{ mesh: 0 }],
			meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
			buffers: [{ byteLength: positions.length, uri: `data:application/octet-stream;base64,${positions.toString('base64')}` }],
			bufferViews: [{ buffer: 0, byteLength: positions.length, target: 34962 }],
			accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [2, 2, 0] }],
		}),
	}
})()

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

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

/** Open the model, and the panel's Export section, where the button is. */
async function open(page: Page, model: Parameters<typeof openViewer>[2]) {
	await openViewer(page, server.url, model)
	const header = page.locator('.slide-out-panel .section-header[aria-controls="panel-section-export"]')
	if (await header.getAttribute('aria-expanded') !== 'true') {
		await header.click()
	}
	return page.locator('.slide-out-panel').getByRole('button', { name: /AR$/ })
}

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

test('a desktop is not offered View in AR', async ({ page }) => {
	await open(page, CUBE)
	await expect(page.locator('.slide-out-panel').getByRole('button', { name: 'Screenshot' })).toBeVisible()
	await expect(page.getByRole('button', { name: /AR$/ })).toHaveCount(0)
})

test('on an iPhone the model goes to AR Quick Look as a USDZ file in metres', async ({ page }) => {
	await asIPhone(page)
	const button = await open(page, CUBE)
	await expect(button).toHaveText('View in AR')
	await expect(button).toBeEnabled()
	await expect(button).not.toHaveAttribute('aria-disabled', 'true')

	await button.click()
	await page.waitForFunction(() => (window as any).__arClicks.length === 1, null, { timeout: 20000 })

	const opened = await page.evaluate(() => (window as any).__arClicks[0])
	expect(opened.rel).toBe('ar')
	expect(opened.firstChild).toBe('IMG')
	expect(opened.href).toMatch(/^blob:.*#allowsContentScaling=0$/)
	const layer = usda(opened.bytes)
	expect(layer).toMatch(/metersPerUnit = 1\b/)
	// An STL is in millimetres: 10 of them are a centimetre in the room
	expect(extentInMetres(layer)).toBeCloseTo(0.01, 9)
	// and the button is ready for the next time
	await expect(button).toHaveText('View in AR')
	await expect(page.locator('.toast.error')).toHaveCount(0)
})

test('on an iPhone a glTF, which is in metres, is not shrunk', async ({ page }) => {
	await asIPhone(page)
	const button = await open(page, TRIANGLE)
	await button.click()
	await page.waitForFunction(() => (window as any).__arClicks.length === 1, null, { timeout: 20000 })
	const opened = await page.evaluate(() => (window as any).__arClicks[0])
	expect(extentInMetres(usda(opened.bytes))).toBeCloseTo(2, 9)
})

test('on Android Chrome a WebXR immersive-ar session is asked for, with hit-test and the page\'s own controls', async ({ page }) => {
	await asAndroid(page)
	const button = await open(page, CUBE)
	await expect(button).toBeVisible()

	await button.click()
	await page.waitForFunction(() => (window as any).__xrRequests.length === 1, null, { timeout: 20000 })

	expect(await page.evaluate(() => (window as any).__xrRequests[0])).toEqual({
		mode: 'immersive-ar',
		requiredFeatures: ['hit-test'],
		optionalFeatures: ['dom-overlay'],
		overlay: 'View in AR',
	})
	// The browser said no: the person is told, nothing is left over the page, and it can be tried again
	await expect(page.locator('.toast.error')).toContainText('AR could not start')
	await expect(page.locator('body > [role="region"][aria-label="View in AR"]')).toHaveCount(0)
	await expect(button).not.toHaveAttribute('aria-disabled', 'true')
	await expect(page.locator('canvas').first()).toBeVisible()
	// no USDZ is made on this way
	expect(await page.evaluate(() => (window as any).__arClicks)).toBeUndefined()
})

test('where a browser has both, a live session is chosen over Quick Look', async ({ page }) => {
	await asIPhone(page)
	await asAndroid(page)
	const button = await open(page, CUBE)
	await button.click()
	await page.waitForFunction(() => (window as any).__xrRequests.length === 1, null, { timeout: 20000 })
	expect(await page.evaluate(() => (window as any).__arClicks.length)).toBe(0)
})

test('a splat has the button off, and the panel says why', async ({ page }) => {
	await asIPhone(page)
	const button = await open(page, SPLAT)
	await expect(button).toHaveAttribute('aria-disabled', 'true')
	await expect(button).toHaveAttribute('aria-describedby', 'tdv-unavailable-ar')
	await expect(page.locator('#tdv-unavailable-ar')).toHaveText('View in AR: A splat has no real surface to stand in a room.')

	// Playwright waits for an aria-disabled button to be enabled; a person's tap does not
	await button.click({ force: true })
	await page.waitForTimeout(500)
	expect(await page.evaluate(() => (window as any).__arClicks.length)).toBe(0)
	await expect(page.locator('.toast')).toHaveCount(0)
})
