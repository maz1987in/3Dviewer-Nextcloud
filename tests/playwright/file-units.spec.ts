/**
 * File units through the whole app: the unit saved for a file that records none sizes
 * the model everywhere, people who can edit the file choose it, everyone else reads it.
 * The unit table itself is pinned in `tests/unit/utils/sourceUnits.test.js`.
 */
import { test, expect, type Page } from '@playwright/test'
import { startServer, openViewer, stlCube, type Viewer } from './helpers/viewerServer'

const CUBE = { id: 7401, name: 'cube.stl', body: stlCube(10) }
// A minimal glTF: one triangle, 10 units across; glTF is metres by specification
const GLTF = {
	id: 7402,
	name: 'triangle.gltf',
	body: JSON.stringify({
		asset: { version: '2.0' },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ mesh: 0 }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
		buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.from(new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]).buffer).toString('base64') }],
		bufferViews: [{ buffer: 0, byteLength: 36 }],
		accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [10, 10, 0] }],
	}),
}

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

async function open(page: Page, viewer: Viewer = { user: 'alice' }, model: { id: number, name: string, body: string } = CUBE) {
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	return openViewer(page, server.url, model, viewer)
}

const stats = (page: Page) => page.locator('.model-stats-overlay')
const card = (page: Page) => page.locator('.print-check-card')

async function openStats(page: Page) {
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Model Statistics/ }).click()
	await expect(stats(page)).toBeVisible()
}

async function openPrintCheck(page: Page) {
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Print check/ }).click()
	await expect(card(page)).toBeVisible()
}

test('an editor sets inches and the sizes follow', async ({ page }) => {
	const { errors, unitPuts } = await open(page)
	await openStats(page)
	await expect(stats(page)).toContainText('Width (X):10.00 mm')

	await stats(page).locator('#stats-file-unit').selectOption('in')

	await expect(stats(page).locator('[role="status"]')).toHaveText('Saved')
	await expect(stats(page)).toContainText('Width (X):10.00 in')
	expect(unitPuts).toEqual([{ unit: 'in' }])
	await openPrintCheck(page)
	await expect(card(page).locator('#print-check-unit')).toHaveValue('in')
	// A 10-inch cube is 254 mm across: more than the default printer's bed
	await expect(card(page)).toContainText('too wide')
	expect(errors).toEqual([])
})

test('a saved unit applies on open for a read-only user', async ({ page }) => {
	const { errors } = await open(page, { user: 'bob', unit: 'in', unitCanEdit: false })
	await openStats(page)

	await expect(stats(page)).toContainText('Width (X):10.00 in')
	await expect(stats(page).locator('#stats-file-unit')).toHaveCount(0)
	await expect(stats(page)).toContainText('Inches')
	await expect(stats(page)).toContainText('Set for this file')
	expect(errors).toEqual([])
})

test('a glTF shows metres from the file, and asks the server nothing', async ({ page }) => {
	let asked = 0
	page.on('request', (request) => { if (request.url().includes('/file-settings/')) asked++ })
	const { errors } = await open(page, { user: 'alice' }, GLTF)
	await openStats(page)

	await expect(stats(page)).toContainText('Metres')
	await expect(stats(page)).toContainText('From the file')
	await expect(stats(page).locator('#stats-file-unit')).toHaveCount(0)
	expect(asked).toBe(0)
	expect(errors).toEqual([])
})

test('a failed save leaves the unit in force', async ({ page }) => {
	const { errors, unitPuts } = await open(page, { user: 'alice', unitSaveStatus: 500 })
	await openStats(page)

	await stats(page).locator('#stats-file-unit').selectOption('ft')

	await expect(stats(page).locator('[role="status"]')).toHaveText("Couldn't save the units")
	await expect(stats(page).locator('#stats-file-unit')).toHaveValue('mm')
	await expect(stats(page)).toContainText('Width (X):10.00 mm')
	expect(unitPuts).toEqual([{ unit: 'ft' }])
	expect(errors).toEqual([])
})

test('the select works from the keyboard', async ({ page }) => {
	const { unitPuts } = await open(page)
	await openStats(page)
	const select = stats(page).locator('#stats-file-unit')
	await expect(select).toHaveAccessibleName('File units')
	await expect(select).toHaveAccessibleDescription("Assumed, because this file doesn't record a unit Saved with the file for everyone who can open it")

	// Typing a unit's first letter picks it, on every platform (an arrow key opens the
	// menu on macOS instead)
	await select.focus()
	await page.keyboard.press('c')

	await expect(stats(page).locator('[role="status"]')).toHaveText('Saved')
	expect(unitPuts).toEqual([{ unit: 'cm' }])
})

async function openLiteStats(page: Page, viewer: Viewer) {
	await open(page, { user: null, publicToken: 'unitstok', lite: true, ...viewer })
	await page.locator('[aria-controls="viewer-stats-panel"]').click()
	return page.locator('#viewer-stats-panel')
}

test('light viewer shows the size in the file\'s unit', async ({ page }) => {
	const panel = await openLiteStats(page, { unit: 'in' })

	await expect(panel).toContainText('10.00 × 10.00 × 10.00 in')
	await expect(panel.locator('select')).toHaveCount(0)
})

test('light viewer shows millimetres when no unit is set', async ({ page }) => {
	const panel = await openLiteStats(page, { unit: null })

	await expect(panel).toContainText('10.00 × 10.00 × 10.00 mm')
})

/** The x extent of a binary STL, in its own numbers. */
function stlWidth(body: Buffer): number {
	const triangles = body.readUInt32LE(80)
	let min = Infinity
	let max = -Infinity
	for (let t = 0; t < triangles; t++) {
		for (let v = 0; v < 3; v++) {
			const x = body.readFloatLE(84 + t * 50 + 12 + v * 12)
			min = Math.min(min, x)
			max = Math.max(max, x)
		}
	}
	return max - min
}

test('Send to Slicer writes the model in millimetres, with a unit that arrives while it is open', async ({ page }) => {
	let release: () => void = () => {}
	const unitGate = new Promise<void>((resolve) => { release = resolve })
	const uploads: Buffer[] = []
	await page.route('**/apps/threedviewer/api/slicer/temp*', (route) => {
		uploads.push(route.request().postDataBuffer() ?? Buffer.alloc(0))
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, downloadUrl: 'http://127.0.0.1:9/model.stl', fileId: 1 }) })
	})
	await open(page, { user: 'alice', unit: 'in', unitGate })

	// Its row is in the Export section, which starts collapsed
	await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
	await page.locator('.slide-out-panel').getByRole('button', { name: /^Send to Slicer/ }).click()
	await expect(page.locator('.slicer-modal')).toBeVisible()
	release()
	// The unit has arrived once the stats say so
	await page.waitForFunction(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer.fileUnitChosen === 'in')
	await page.locator('.slicer-modal').getByRole('button', { name: /^Open in / }).first().click()

	await expect.poll(() => uploads.length).toBe(1)
	// A 10-inch cube: 254 mm across
	expect(stlWidth(uploads[0])).toBeCloseTo(254, 3)
})
