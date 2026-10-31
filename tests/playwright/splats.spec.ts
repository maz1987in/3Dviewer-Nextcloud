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
