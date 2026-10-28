/**
 * View links through the whole app: a link opens the model as its sender saw it, and
 * copying one captures what is on screen. The format itself is pinned in
 * `tests/unit/utils/viewLink.test.js`; this covers that the viewer reads and applies it.
 */
import { test, expect, type Page } from '@playwright/test'
import { startServer, openViewer, type Viewer } from './helpers/viewerServer'

/** A `view` value as the app writes it: version 1, base64url JSON with one-letter keys. */
const link = (view: object) => `1.${Buffer.from(JSON.stringify(view)).toString('base64url')}`
const decode = (value: string) => JSON.parse(Buffer.from(value.slice(2), 'base64url').toString())

/** Two separate boxes in one OBJ: two meshes, so the exploded view has parts to spread. */
function twoBoxesObj(): string {
	const lines: string[] = []
	let base = 0
	for (const [name, x] of [['left', 0], ['right', 20]] as const) {
		lines.push(`o ${name}`)
		for (const [dx, dy, dz] of [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]]) {
			lines.push(`v ${x + dx} ${dy} ${dz}`)
		}
		for (const [a, b, c, d] of [[1, 4, 3, 2], [5, 6, 7, 8], [1, 2, 6, 5], [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8]]) {
			lines.push(`f ${a + base} ${b + base} ${c + base} ${d + base}`)
		}
		base += 8
	}
	return lines.join('\n')
}

const MODEL = { id: 7301, name: 'two-boxes.obj', body: twoBoxesObj() }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

async function open(page: Page, query?: string, viewer: Viewer = { user: 'alice' }) {
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	return openViewer(page, server.url, MODEL, { ...viewer, query })
}

/** What the viewer is showing, read off the app and its viewer. */
const shown = (page: Page) => page.evaluate(() => {
	const app = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
	const viewer = app.$refs.viewer
	const camera = viewer.camera.camera.value
	const clip = viewer.clippingPlane
	return {
		position: camera.position.toArray(),
		target: viewer.camera.controls.value.target.toArray(),
		zoom: camera.zoom,
		orthographic: !!camera.isOrthographicCamera,
		renderMode: viewer.renderMode.mode.value,
		lighting: viewer.lightingPresets.currentPreset.value,
		clipping: { active: clip.isActive.value, mode: clip.mode.value, axis: clip.axis.value, position: clip.position.value, flipped: clip.flipped.value },
		exploded: { active: viewer.explodedView.isActive.value, factor: viewer.explodedView.factor.value },
		app: { renderMode: app.renderMode, lighting: app.lightingPreset, clippingActive: app.clippingActive, clippingAxis: app.clippingAxis, explodedFactor: app.explodedViewFactor, wireframe: app.wireframe, cameraType: app.cameraType },
	}
})

const near = (actual: number[], expected: number[]) => {
	actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
}

test('a view link restores camera, Clay, Studio lighting, a plane cut and exploded factor', async ({ page }) => {
	const { errors } = await open(page, `view=${link({ c: { p: [30, 40, 50], t: [15, 5, 5], z: 1, o: 0 }, r: 'clay', l: 'studio', k: { m: 'p', a: 'x', s: 0.25, f: 1 }, e: 0.6 })}`)
	const state = await shown(page)
	near(state.position, [30, 40, 50])
	near(state.target, [15, 5, 5])
	expect(state.renderMode).toBe('clay')
	expect(state.lighting).toBe('studio')
	expect(state.clipping).toEqual({ active: true, mode: 'plane', axis: 'x', position: 0.25, flipped: true })
	expect(state.exploded.active).toBe(true)
	expect(state.exploded.factor).toBeCloseTo(0.6, 3)
	// And the tools panel shows it, since it reads the app's copy of each
	expect(state.app).toMatchObject({ renderMode: 'clay', lighting: 'studio', clippingActive: true, clippingAxis: 'x' })
	expect(state.app.explodedFactor).toBeCloseTo(0.6, 3)
	expect(errors).toEqual([])
})

test('opening a link with wireframe does not change saved preferences', async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('seeded')) {
			localStorage.setItem('threedviewer:prefs', JSON.stringify({ grid: true, axes: true, wireframe: false, background: null, v: 1 }))
			sessionStorage.setItem('seeded', '1')
		}
	})
	await open(page, `view=${link({ c: { p: [30, 40, 50], t: [15, 5, 5], z: 1, o: 0 }, w: 1 })}`)
	expect((await shown(page)).app.wireframe).toBe(true)
	const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('threedviewer:prefs') || '{}'))
	expect((await prefs()).wireframe).toBe(false)

	// A preference the recipient does change is saved, without the link's wireframe
	await page.evaluate(() => { (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.grid = false })
	await expect.poll(async () => (await prefs()).grid).toBe(false)
	expect((await prefs()).wireframe).toBe(false)
})

test('an orthographic link keeps its zoom', async ({ page }) => {
	await open(page, `view=${link({ c: { p: [30, 40, 50], t: [15, 5, 5], z: 2.5, o: 1 } })}`)
	const state = await shown(page)
	expect(state.orthographic).toBe(true)
	expect(state.zoom).toBeCloseTo(2.5, 3)
	near(state.position, [30, 40, 50])
	expect(state.app.cameraType).toBe('orthographic')
})

test('a camera aimed far from the model falls back to the usual framing', async ({ page, browser }) => {
	await open(page)
	const usual = await shown(page)

	const other = await browser.newPage()
	await open(other, `view=${link({ c: { p: [1e6, 10, 10], t: [1e6, 0, 0], z: 1, o: 0 } })}`)
	const fallback = await shown(other)
	near(fallback.position, usual.position)
	near(fallback.target, usual.target)
	await other.close()
})

test('the legacy cam link still sets the camera', async ({ page }) => {
	await open(page, 'cam=30,40,50,15,5,5,1')
	const state = await shown(page)
	near(state.position, [30, 40, 50])
	near(state.target, [15, 5, 5])
})

test('the view applies to the first load only', async ({ page }) => {
	await open(page, `view=${link({ c: { p: [30, 40, 50], t: [15, 5, 5], z: 1, o: 0 }, r: 'clay' })}`)
	near((await shown(page)).position, [30, 40, 50])

	// Loading again in the same page, with the link still in the address, frames as usual
	await page.evaluate(async () => {
		(window as any).__LOAD_COMPLETE = false
		await (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.retryLoad()
	})
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	const again = await shown(page)
	expect(Math.abs(again.position[0] - 30) + Math.abs(again.position[1] - 40) + Math.abs(again.position[2] - 50)).toBeGreaterThan(1)
})

test('copying from the panel gives a link that reproduces the view', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await open(page)
	await page.locator('.slide-out-panel').getByRole('button', { name: 'Clay', exact: true }).click()
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Copy link to this view/ }).click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	expect(copied.pathname).toMatch(/\/apps\/threedviewer\/f\/7301$/)
	expect(decode(copied.searchParams.get('view')!).r).toBe('clay')
})

/** A shared note as the notes route returns it. */
const note = (id: number, text: string, x: number) => ({
	id, type: 'annotation', payload: { space: 'model', point: { x, y: 5, z: 5 }, text }, author: { uid: 'bob', displayName: 'Bob' }, createdAt: 1, updatedAt: 1,
})
const NOTES = [note(5, 'Hole', 5), note(6, 'Edge', 25)]
const camera = { p: [30, 40, 50], t: [15, 5, 5], z: 1, o: 0 }

test('a note link opens Annotations with that note highlighted and focused', async ({ page }) => {
	// The panel stays closed: opening it would take the focus this checks for
	await open(page, `view=${link({ c: camera, n: 6 })}`, { user: 'alice', notes: NOTES, openPanel: false })
	const highlighted = page.locator('.annotation-overlay .annotation-item.is-highlighted')
	await expect(highlighted).toHaveCount(1)
	await expect(highlighted.locator('.annotation-text-input')).toHaveValue('Edge')
	await expect(highlighted).toBeFocused()
})

test('a link to a note that is gone opens normally', async ({ page }) => {
	const { errors } = await open(page, `view=${link({ c: camera, n: 999 })}`, { user: 'alice', notes: NOTES })
	near((await shown(page)).position, [30, 40, 50])
	await expect(page.locator('.annotation-overlay')).toHaveCount(0)
	expect(errors).toEqual([])
})

test('Copy link to this note gives a link with that note', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await open(page, undefined, { user: 'alice', notes: NOTES })
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Annotation/ }).click()
	const actions = page.locator('.annotation-overlay').getByRole('button', { name: /^Copy link to this note/ })
	await expect(actions).toHaveCount(2)
	await actions.nth(1).click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	expect(decode(copied.searchParams.get('view')!).n).toBe(6)
})

test("a bookmark's Copy link carries the bookmark's camera", async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await open(page, `view=${link({ c: camera })}`)
	await page.locator('.slide-out-panel').getByRole('button', { name: 'Save View' }).click()
	// Move away, so the link can only have the camera from the bookmark
	await page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		viewer.camera.camera.value.position.set(80, 10, 10)
		viewer.camera.controls.value.update()
	})
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Copy link: View 1/ }).click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	const view = decode(copied.searchParams.get('view')!)
	near(view.c.p, [30, 40, 50])
	near(view.c.t, [15, 5, 5])
})

/** The light viewer's camera, read off the component the share page mounts. */
const liteCamera = (page: Page) => page.evaluate(() => {
	// A production build keeps no app instance, so through the root vnode Vue leaves on the container
	const viewer = (document.querySelector('#threedviewer-public') as any)._vnode.component.subTree.component.proxy
	return { position: viewer.camera.position.toArray(), target: viewer.controls.target.toArray() }
})
const VISITOR: Viewer = { user: null, publicToken: 'abc123', lite: true }

test('a public link with a view opens the light viewer at that camera', async ({ page }) => {
	const { errors } = await open(page, `view=${link({ c: camera })}`, VISITOR)
	const state = await liteCamera(page)
	near(state.position, [30, 40, 50])
	near(state.target, [15, 5, 5])
	expect(errors).toEqual([])
})

test('the light viewer applies the camera and ignores the rest', async ({ page }) => {
	const { errors } = await open(page, `view=${link({ c: camera, r: 'clay', k: { m: 'p', a: 'x', s: 0.2, f: 0 }, e: 0.5, n: 6 })}`, VISITOR)
	near((await liteCamera(page)).position, [30, 40, 50])
	expect(errors).toEqual([])
})

test('the light viewer keeps its usual framing for a camera aimed far from the model', async ({ page, browser }) => {
	await open(page, undefined, VISITOR)
	const usual = await liteCamera(page)
	const other = await browser.newPage()
	await open(other, `view=${link({ c: { p: [1e6, 10, 10], t: [1e6, 0, 0], z: 1, o: 0 } })}`, VISITOR)
	near((await liteCamera(other)).position, usual.position)
	await other.close()
})

test("a visitor's Copy link to this view keeps the page and adds only the camera", async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await open(page, undefined, VISITOR)
	const button = page.getByRole('button', { name: 'Copy link to this view' })
	await button.click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	const here = new URL(page.url())
	expect(copied.pathname).toBe(here.pathname)
	expect(copied.searchParams.get('page')).toBe(here.searchParams.get('page'))
	expect(Object.keys(decode(copied.searchParams.get('view')!))).toEqual(['c'])
	await expect(page.getByRole('status')).toContainText('Link copied')
})

/** Answer the sharing API with these link shares of the model. */
async function withShares(page: Page, shares: object[]) {
	await page.route('**/ocs/v2.php/apps/files_sharing/api/v1/shares*', (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ ocs: { meta: { status: 'ok' }, data: shares } }),
	}))
}
const linkShare = (id: string, label: string, stime: number) => ({
	id, share_type: 3, token: `tok${id}`, url: `https://cloud.test/s/tok${id}`, label, stime, expiration: null, password: null, hide_download: 0, permissions: 1,
})

test('a user who manages a link share copies its URL with the camera', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await withShares(page, [linkShare('21', 'Client', 1761600000)])
	await open(page, `view=${link({ c: camera, r: 'clay' })}`)
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Copy public link to this view/ }).click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	expect(`${copied.origin}${copied.pathname}`).toBe('https://cloud.test/s/tok21')
	// A public page applies the camera only, so that is all the link carries
	const view = decode(copied.searchParams.get('view')!)
	expect(Object.keys(view)).toEqual(['c'])
	near(view.c.p, [30, 40, 50])
})

test('without a link share there is no public link to copy', async ({ page }) => {
	await withShares(page, [])
	await open(page)
	await expect(page.locator('.slide-out-panel').getByRole('button', { name: /^Copy link to this view/ })).toBeVisible()
	await expect(page.locator('.slide-out-panel').getByRole('button', { name: /^Copy public link to this view/ })).toHaveCount(0)
})

test('with two link shares the user picks one, listed by label and date', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await withShares(page, [linkShare('21', 'Client', 1761600000), linkShare('22', '', 1761700000)])
	await open(page)
	const panel = page.locator('.slide-out-panel')
	const opener = panel.getByRole('button', { name: /^Copy public link to this view/ })
	await opener.click()
	await expect(opener).toHaveAttribute('aria-expanded', 'true')
	const choices = panel.locator('.public-link-choices').getByRole('button')
	await expect(choices).toHaveCount(2)
	// Newest first; one without a label is called what it is
	await expect(choices.nth(0)).toContainText('Public link')
	await expect(choices.nth(1)).toContainText('Client')
	await choices.nth(1).click()
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()))
	expect(copied.pathname).toBe('/s/tok21')
})
