/**
 * Gaussian splats in the full viewer, drawn by Spark for real: each format opens and
 * draws, a PLY opens as what it is, a damaged file says so, and Cancel loading stops a
 * splat. The reading itself is pinned by the Jest tests in tests/unit/splats/.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer, openViewer } from './helpers/viewerServer'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const fixture = (dir: string, name: string) => fs.readFileSync(path.join(HERE, '../fixtures', dir, name))
const GRID = {
	splat: { id: 7701, name: 'grid.splat', body: fixture('splats', 'grid.splat') },
	spz: { id: 7702, name: 'grid.spz', body: fixture('splats', 'grid.spz') },
	ply: { id: 7703, name: 'grid.ply', body: fixture('splats', 'grid.ply') },
}

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/** What the full viewer holds: a splat (and its count), points, or a mesh. */
const held = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	let mesh = false
	root?.traverse((o: any) => { if (o.isMesh && !o.userData.tdvBoundsProxy) mesh = true })
	return {
		splat: root?.userData?.tdvSplat?.count ?? null,
		points: Boolean(root?.isPoints),
		mesh,
		spark: Boolean(viewer.scene?.getObjectByName('tdv-spark')),
	}
})

/**
 * How many of a 24 × 24 grid of canvas samples the splat changes: the scene is drawn with
 * Spark's renderer shown and then hidden, and read back straight after each draw, so the
 * grid and the background cancel out. (Hiding the model root would not do: Spark draws
 * the splats it last gathered until its next update.)
 */
const splatPixels = (page: Page) => page.evaluate(async () => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const renderer = viewer.renderer
	const camera = viewer.camera.camera.value
	const gl = renderer.getContext()
	const { width, height } = gl.canvas
	const sample = () => {
		renderer.render(viewer.scene, camera)
		const out = []
		const pixel = new Uint8Array(4)
		for (let i = 1; i < 25; i++) {
			for (let j = 1; j < 25; j++) {
				gl.readPixels(Math.floor(width * i / 25), Math.floor(height * j / 25), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
				out.push(Array.from(pixel))
			}
		}
		return out
	}
	const spark = viewer.scene.getObjectByName('tdv-spark')
	const shown = sample()
	spark.visible = false
	const hidden = sample()
	spark.visible = true
	return shown.filter((p, i) => p.some((v, c) => Math.abs(v - hidden[i][c]) > 24)).length
})

/** Spark sorts after the first frames; wait until the splat is drawn. */
const drawn = async (page: Page) => {
	await expect.poll(() => splatPixels(page), { timeout: 20000 }).toBeGreaterThan(10)
}

for (const kind of ['splat', 'spz', 'ply'] as const) {
	test(`a .${kind} opens as a splat and is drawn`, async ({ page }) => {
		const { errors } = await openViewer(page, server.url, GRID[kind], { user: 'alice', openPanel: false })

		expect(await held(page)).toEqual({ splat: 1000, points: false, mesh: false, spark: true })
		await drawn(page)
		expect(errors).toEqual([])
	})
}

test('the three kinds of PLY each open as what they are', async ({ page }) => {
	await openViewer(page, server.url, { id: 7711, name: 'scan.ply', body: fixture('pointclouds', 'points-binary-le.ply') }, { user: 'alice', openPanel: false })
	expect(await held(page)).toMatchObject({ splat: null, points: true, spark: false })

	await openViewer(page, server.url, { id: 7712, name: 'triangle.ply', body: fixture('', 'triangle.ply') }, { user: 'alice', openPanel: false })
	expect(await held(page)).toMatchObject({ splat: null, points: false, mesh: true, spark: false })
})

test('a damaged splat says it couldn\'t be read', async ({ page }) => {
	const noise = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 97 + 13) & 0xff))
	const { errors } = await openViewer(page, server.url, { id: 7721, name: 'broken.spz', body: noise }, { user: 'alice', loads: false })

	await expect(page.locator('.error-display')).toContainText('This splat couldn\'t be read.', { timeout: 20000 })
	expect(await held(page)).toMatchObject({ splat: null, spark: false })
	expect(errors).toEqual([])
})

test('cancel while a splat downloads leaves no model and no error', async ({ page }) => {
	let release = () => {}
	const gate = new Promise<void>((resolve) => { release = resolve })
	const requested = page.waitForRequest(/\/api\/file\/7731/)
	const { errors } = await openViewer(page, server.url, { ...GRID.splat, id: 7731 }, { user: 'alice', loads: false, fileGate: gate })
	await requested

	await page.getByRole('button', { name: 'Cancel loading' }).click()
	release()

	await expect(page.locator('.loading')).toBeHidden({ timeout: 10000 })
	await expect(page.locator('.error-display')).toHaveCount(0)
	await page.waitForTimeout(3000)
	expect(await held(page)).toMatchObject({ splat: null, spark: false })
	expect(errors).toEqual([])
})

// The Cancel button shows while the viewer is still getting ready, before there is a
// download to abort; a Cancel pressed then must still stop the load
test('cancel before the download starts leaves no model and no error', async ({ page }) => {
	let release = () => {}
	const gate = new Promise<void>((resolve) => { release = resolve })
	const { errors } = await openViewer(page, server.url, { ...GRID.splat, id: 7732 }, { user: 'alice', loads: false, fileGate: gate })

	await page.getByRole('button', { name: 'Cancel loading' }).click()
	release()

	await expect(page.locator('.loading')).toBeHidden({ timeout: 10000 })
	await expect(page.locator('.error-display')).toHaveCount(0)
	await page.waitForTimeout(3000)
	expect(await held(page)).toMatchObject({ splat: null, spark: false })
	expect(errors).toEqual([])
})

// A link is a view of whatever its file is now; what is off for a splat stays off
test('a link\'s shading, cut and wireframe are not applied to a splat', async ({ page }) => {
	const view = `1.${Buffer.from(JSON.stringify({ c: { p: [3, 2, 3], t: [0, 0.5, 0], z: 1, o: 0 }, r: 'clay', k: { m: 'p', a: 'x', s: 0.25, f: 1 }, w: 1 })).toString('base64url')}`
	const { errors } = await openViewer(page, server.url, { ...GRID.spz, id: 7741 }, { user: 'alice', openPanel: false, query: `view=${view}` })

	const state = await page.evaluate(() => {
		const app = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
		const viewer = app.$refs.viewer
		return { renderMode: viewer.renderMode.mode.value, clipping: viewer.clippingPlane.isActive.value, wireframe: app.wireframe, camera: viewer.camera.camera.value.position.toArray() }
	})
	expect(state.renderMode).not.toBe('clay')
	expect(state.clipping).toBe(false)
	expect(state.wireframe).toBe(false)
	expect(errors).toEqual([])
})

test('the tools a splat has no use for are off, and say why', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, { ...GRID.splat, id: 7751 })
	const panel = page.locator('.slide-out-panel')
	const tool = (name: string) => panel.locator('button', { has: page.locator('.tool-label', { hasText: new RegExp(`^${name}$`) }) })
	const describedBy = async (name: string, key: string) => {
		await expect(tool(name)).toHaveAttribute('aria-disabled', 'true')
		await expect(tool(name)).toHaveAttribute('aria-describedby', `tdv-unavailable-${key}`)
	}

	await expect(page.locator('#tdv-unavailable-heading')).toHaveText('Not available for splats')
	await describedBy('Measurement', 'measure')
	await describedBy('Annotation', 'notes')
	await describedBy('Comparison', 'compare')
	await describedBy('Cross-Section', 'crossSection')
	await describedBy('Print check', 'printCheck')
	await describedBy('Transform', 'transform')
	await describedBy('Send to Slicer', 'export')
	for (const mode of ['Clay', 'Normals', 'X-ray']) {
		await expect(panel.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-describedby', 'tdv-unavailable-shading')
	}
	await expect(panel.getByRole('switch', { name: 'Wireframe' })).toHaveAttribute('aria-describedby', 'tdv-unavailable-shading')
	await expect(page.locator('#tdv-unavailable-measure')).toHaveText('Measurement: A splat has no real surface to measure.')

	// Pressing one does nothing, by its button or by its shortcut; it stays focusable, so a
	// keyboard user can hear why
	await tool('Cross-Section').focus()
	await page.keyboard.press('Enter')
	await page.locator('body').focus()
	await page.keyboard.press('m')
	const app = await page.evaluate(() => {
		const proxy = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
		return { measuring: proxy.measurementMode, clipping: proxy.$refs.viewer.clippingPlane.isActive.value }
	})
	expect(app).toMatchObject({ measuring: false, clipping: false })
	// A browser that could enter VR: the button stays hidden for a splat all the same
	await page.evaluate(() => { (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.webxrSupported = true })
	await expect(page.getByRole('button', { name: 'Enter VR' })).toHaveCount(0)

	// What still works for one is on
	await expect(panel.locator('[aria-describedby^="tdv-unavailable-"]', { hasText: 'Bookmark' })).toHaveCount(0)
	expect(errors).toEqual([])
})

test('a splat\'s statistics: its splats and its size', async ({ page }) => {
	await openViewer(page, server.url, { ...GRID.ply, id: 7752 }, { user: 'alice', openPanel: false })
	await page.keyboard.press('s')

	const stats = page.locator('.stats-panel-content')
	await expect(stats).toContainText('Splats:')
	await expect(stats).toContainText('1,000')
	await expect(stats).not.toContainText('Surface Area')
	await expect(stats).not.toContainText('Vertices')
	const size = await page.evaluate(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.modelStats.boundingBox)
	expect(size.x).toBeCloseTo(2, 2)
	expect(size.y).toBeCloseTo(1, 2)
	expect(size.z).toBeCloseTo(0.5, 2)
})

const rotationX = (page: Page) => page.evaluate(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.modelRoot.rotation.x)
/** The splat's height as it is placed, from the box that measures it. */
const placedHeight = (page: Page) => page.evaluate(() => {
	const root = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.modelRoot
	root.updateMatrixWorld(true)
	const proxy = root.getObjectByName('tdv-splat-bounds')
	proxy.geometry.computeBoundingBox()
	const b = proxy.geometry.boundingBox.clone().applyMatrix4(proxy.matrixWorld)
	return { height: b.max.y - b.min.y, bottom: b.min.y }
})

test('an editor turns a splat, saved for the file', async ({ page }) => {
	const { unitPuts } = await openViewer(page, server.url, { ...GRID.splat, id: 7761 })
	await expect(page.locator('#tdv-up')).toHaveValue('+y')
	expect((await placedHeight(page)).height).toBeCloseTo(1, 3)

	await page.locator('#tdv-up').selectOption('+z')

	await expect.poll(() => rotationX(page)).toBeCloseTo(-Math.PI / 2)
	await expect.poll(() => unitPuts).toContainEqual({ up: '+z' })
	const placed = await placedHeight(page)
	expect(placed.height).toBeCloseTo(0.5, 3)
	expect(placed.bottom).toBeCloseTo(0, 3)
})

test('the up saved for a splat turns it when it opens', async ({ page }) => {
	await openViewer(page, server.url, { ...GRID.spz, id: 7762 }, { user: 'alice', up: '-y' })

	await expect.poll(() => rotationX(page)).toBeCloseTo(Math.PI)
	await expect(page.locator('#tdv-up')).toHaveValue('-y')
})

test('a view-only colleague sees which way is up for a splat, and can\'t change it', async ({ page }) => {
	await openViewer(page, server.url, { ...GRID.ply, id: 7763 }, { user: 'bob', up: '+z', unitCanEdit: false })

	await expect(page.locator('.file-up-control')).toContainText('+Z up')
	await expect(page.locator('#tdv-up')).toHaveCount(0)
	await expect.poll(() => rotationX(page)).toBeCloseTo(-Math.PI / 2)
})

test('a public link shows a splat, turned the way the file says', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, { ...GRID.splat, id: 7771 }, { user: null, publicToken: 'splattok', lite: true, up: '-y' })

	const shown = () => page.evaluate(() => {
		const viewer = (document.querySelector('#threedviewer-public') as any)._vnode.component.subTree.component.proxy
		let found = null
		viewer.scene.traverse((child: any) => { if (child.userData?.tdvSplat) found = { count: child.userData.tdvSplat.count, x: child.rotation.x } })
		return { ...found, spark: Boolean(viewer.scene.getObjectByName('tdv-spark')), splats: viewer.modelStats?.splats ?? null }
	})
	await expect.poll(async () => (await shown()).x).toBeCloseTo(Math.PI)
	expect(await shown()).toMatchObject({ count: 1000, spark: true, splats: 1000 })
	expect(errors).toEqual([])
})
