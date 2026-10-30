/**
 * Scans in the full viewer: they open as points, a chemistry .xyz says it isn't one, and
 * Cancel loading stops a scan being read. The readers themselves are pinned by the Jest
 * tests in tests/unit/pointclouds/.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer, openViewer } from './helpers/viewerServer'

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/pointclouds')
const CUBE_RGB = { id: 7601, name: 'cube-rgb.xyz', body: fs.readFileSync(path.join(FIXTURES, 'cube-rgb.xyz')) }
const MOLECULE = { id: 7602, name: 'molecule.xyz', body: fs.readFileSync(path.join(FIXTURES, 'molecule.xyz')) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/** What the full viewer holds: whether its model is a scan, and how many points. */
const scene = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	return { points: Boolean(root?.isPoints), count: root?.userData?.tdvPointCloud?.count ?? null }
})

test('an XYZ scan opens as points', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, CUBE_RGB)

	await expect(page.locator('canvas').first()).toBeVisible()
	expect(await scene(page)).toEqual({ points: true, count: 1000 })
	expect(errors).toEqual([])
})

test('a chemistry .xyz says it lists atoms', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, MOLECULE, { user: 'alice', loads: false })

	await expect(page.locator('.error-display')).toContainText('This .xyz file lists atoms, not a scan, so it can\'t be shown here.')
	expect(await scene(page)).toEqual({ points: false, count: null })
	expect(errors).toEqual([])
})

test('cancel while a scan is read leaves no model and no error', async ({ page }) => {
	// Large enough that reading it outlasts the click
	const lines = Array.from({ length: 1_500_000 }, (_, i) => `${i % 1000} ${(i / 1000) | 0} ${i % 7}`).join('\n')
	const { errors } = await openViewer(page, server.url, { id: 7603, name: 'big.xyz', body: lines }, { user: 'alice', loads: false })

	await page.getByRole('button', { name: 'Cancel loading' }).click()

	await expect(page.locator('.loading')).toBeHidden({ timeout: 10000 })
	await expect(page.locator('.error-display')).toHaveCount(0)
	// Long enough for a read that wasn't stopped to have landed
	await page.waitForTimeout(3000)
	expect(await scene(page)).toEqual({ points: false, count: null })
	expect(errors).toEqual([])
})

/** The cloud as the viewer holds it. */
const cloud = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	const colours = root.geometry.getAttribute('color').array
	return { colourBy: root.userData.tdvPointCloud.colourBy, size: root.material.size, colour: Array.from(colours.slice(0, 3)) }
})

/**
 * Two of the cloud's points that are drawn on bare canvas, nothing over them, as far
 * apart on screen as can be found: where each is drawn, nudged by `offset` px, and where
 * it is in the world.
 */
const twoOnScreen = (page: Page, offset: number) => page.evaluate((d) => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	const camera = viewer.camera.camera.value
	const canvas = viewer.renderer.domElement
	const rect = canvas.getBoundingClientRect()
	root.updateMatrixWorld(true)
	const position = root.geometry.getAttribute('position')
	const seen = []
	for (let i = 0; i < position.count; i += 37) {
		const p = new root.position.constructor().fromBufferAttribute(position, i).applyMatrix4(root.matrixWorld)
		const world = p.toArray()
		p.project(camera)
		const x = rect.left + (p.x + 1) / 2 * rect.width + d
		const y = rect.top + (1 - p.y) / 2 * rect.height + d
		if (document.elementFromPoint(x, y) === canvas) {
			seen.push({ x, y, world })
		}
	}
	let best = [seen[0], seen[1]]
	for (const a of seen) {
		for (const b of seen) {
			if (Math.hypot(a.x - b.x, a.y - b.y) > Math.hypot(best[0].x - best[1].x, best[0].y - best[1].y)) best = [a, b]
		}
	}
	return best
}, offset)

const panel = (page: Page) => page.locator('.slide-out-panel')

test('the scan\'s controls, and the tools that are off and why', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, CUBE_RGB)

	await expect(page.locator('#tdv-colour-by')).toHaveValue('file')
	/** A tool button by its visible label: its name also carries its shortcut hint. */
	const tool = (name: string) => panel(page).locator('button', { has: page.locator('.tool-label', { hasText: new RegExp(`^${name}$`) }) })
	const describedBy = async (name: string, key: string) => {
		const control = tool(name)
		await expect(control).toHaveAttribute('aria-disabled', 'true')
		await expect(control).toHaveAttribute('aria-describedby', `tdv-unavailable-${key}`)
	}
	await describedBy('Print check', 'printCheck')
	await describedBy('Comparison', 'compare')
	await expect(page.locator('#tdv-unavailable-printCheck')).toContainText('nothing to check for printing')
	for (const mode of ['Clay', 'Normals', 'X-ray']) {
		await expect(panel(page).getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-describedby', 'tdv-unavailable-shading')
	}
	await expect(panel(page).getByRole('switch', { name: 'Wireframe' })).toHaveAttribute('aria-disabled', 'true')
	await expect(panel(page).getByRole('switch', { name: 'Wireframe' })).toHaveAttribute('aria-describedby', 'tdv-unavailable-shading')
	await expect(panel(page).locator('[aria-describedby="tdv-unavailable-export"]').first()).toHaveAttribute('aria-disabled', 'true')

	// Pressing one does nothing; it stays focusable, so a keyboard user can hear why
	await tool('Print check').focus()
	await page.keyboard.press('Enter')
	await expect(page.locator('.print-check-card')).toHaveCount(0)
	expect(errors).toEqual([])
})

test('colour by and point size change the cloud', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB)
	const before = await cloud(page)
	expect(before).toMatchObject({ colourBy: 'file', size: 2 })

	await page.locator('#tdv-colour-by').selectOption('single')
	await page.locator('#tdv-point-size').fill('5')

	await expect.poll(() => cloud(page)).toMatchObject({ colourBy: 'single', size: 5, colour: [0x8f, 0xa3, 0xb3] })
})

test('measurement snaps to a point', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB)
	await panel(page).getByText('Measurement', { exact: true }).click()

	// Two points of the cloud, each clicked a little off
	const [a, b] = await twoOnScreen(page, 2)
	await page.mouse.click(a.x, a.y)
	await page.mouse.click(b.x, b.y)

	const picked = await page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		const [m] = viewer.measurement.measurements.value
		return m ? [m.point1.toArray(), m.point2.toArray()] : null
	})
	expect(picked).not.toBeNull()
	picked!.forEach((point, i) => point.forEach((v, axis) => expect(v).toBeCloseTo([a, b][i].world[axis], 4)))
})

test('a view link restores colour by and point size', async ({ page }) => {
	const view = `1.${Buffer.from(JSON.stringify({ c: { p: [25, 20, 25], t: [0, 0, 0], z: 1, o: 0 }, ps: 4, cb: 'height' })).toString('base64url')}`
	await openViewer(page, server.url, CUBE_RGB, { user: 'alice', query: `view=${view}` })

	await expect.poll(() => cloud(page)).toMatchObject({ colourBy: 'height', size: 4 })
	await expect(page.locator('#tdv-colour-by')).toHaveValue('height')
	await expect(page.locator('#tdv-point-size')).toHaveValue('4')
})

test('the cross-section cuts the cloud', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB)

	await panel(page).getByText('Cross-Section', { exact: true }).click()

	await expect.poll(() => page.evaluate(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.renderer.clippingPlanes.length)).toBeGreaterThan(0)
	expect(await scene(page)).toMatchObject({ points: true })
})

test('the transform gizmo moves a scan', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB)

	// The gizmo stays on only once it has attached to the model root, the scan
	const active = await page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		viewer.toggleTransformGizmo()
		return viewer.transformGizmo.isActive.value
	})

	expect(active).toBe(true)
})

const rotationX = (page: Page) => page.evaluate(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.modelRoot.rotation.x)

test('an editor turns a scan, saved for the file', async ({ page }) => {
	const { unitPuts } = await openViewer(page, server.url, CUBE_RGB)
	await expect(page.locator('#tdv-up')).toHaveValue('+y')

	await page.locator('#tdv-up').selectOption('+z')

	await expect.poll(() => rotationX(page)).toBeCloseTo(-Math.PI / 2)
	await expect.poll(() => unitPuts).toContainEqual({ up: '+z' })
	// Still on the grid, turned
	const bottom = await page.evaluate(() => {
		const root = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.modelRoot
		root.geometry.computeBoundingBox()
		return root.geometry.boundingBox.clone().applyMatrix4(root.matrixWorld).min.y
	})
	expect(bottom).toBeCloseTo(0, 3)
})

test('the up saved for a scan turns it when it opens', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB, { user: 'alice', up: '-y' })

	await expect.poll(() => rotationX(page)).toBeCloseTo(Math.PI)
	await expect(page.locator('#tdv-up')).toHaveValue('-y')
})

test('a view-only colleague sees which way is up, and can\'t change it', async ({ page }) => {
	await openViewer(page, server.url, CUBE_RGB, { user: 'bob', up: '+z', unitCanEdit: false })

	await expect(page.locator('.file-up-control')).toContainText('+Z up')
	await expect(page.locator('.file-up-control')).toContainText('Only people who can edit this file can change this.')
	await expect(page.locator('#tdv-up')).toHaveCount(0)
	await expect.poll(() => rotationX(page)).toBeCloseTo(-Math.PI / 2)
})

test('a public link turns the scan the way the file says', async ({ page }) => {
	const { errors } = await openViewer(page, server.url, CUBE_RGB, { user: null, publicToken: 'scantok', lite: true, up: '-z' })

	await expect.poll(() => page.evaluate(() => {
		const viewer = (document.querySelector('#threedviewer-public') as any)._vnode.component.subTree.component.proxy
		let x = null
		viewer.scene.traverse((child: any) => { if (child.isPoints) x = child.rotation.x })
		return x
	})).toBeCloseTo(Math.PI / 2)
	expect(errors).toEqual([])
})

test('a PLY with no faces opens as points, coloured by its own colours', async ({ page }) => {
	const ply = { id: 7604, name: 'room.ply', body: fs.readFileSync(path.join(FIXTURES, 'points-rgb.ply')) }
	const { errors } = await openViewer(page, server.url, ply)

	expect(await scene(page)).toEqual({ points: true, count: 1000 })
	await expect(page.locator('#tdv-colour-by')).toHaveValue('file')
	expect(errors).toEqual([])
})

test('a compressed PCD opens as points, coloured by its own colours', async ({ page }) => {
	const pcd = { id: 7605, name: 'scan.pcd', body: fs.readFileSync(path.join(FIXTURES, 'cube-compressed.pcd')) }
	const { errors } = await openViewer(page, server.url, pcd)

	expect(await scene(page)).toEqual({ points: true, count: 1000 })
	await expect(page.locator('#tdv-colour-by')).toHaveValue('file')
	await expect(page.locator('#tdv-colour-by option[value="classification"]')).toHaveCount(1)
	expect(errors).toEqual([])
})

test('a LAS survey opens Z up, in the unit its coordinate system names', async ({ page }) => {
	const las = { id: 7606, name: 'survey.las', body: fs.readFileSync(path.join(FIXTURES, 'utm-1.2.las')) }
	const { errors } = await openViewer(page, server.url, las)

	expect(await scene(page)).toEqual({ points: true, count: 1000 })
	await expect.poll(() => rotationX(page)).toBeCloseTo(-Math.PI / 2)
	await panel(page).getByRole('button', { name: /^Model Statistics/ }).click()
	const stats = page.locator('.model-stats-overlay')
	await expect(stats).toContainText('Points')
	await expect(stats.locator('.stats-file-unit')).toContainText('From the file')
	await expect(stats.locator('.stats-file-unit select')).toHaveCount(0)
	expect(errors).toEqual([])
})
