/**
 * The Parts panel in the full viewer: a glTF assembly whose parts are three flat colours
 * is opened, and parts are hidden, isolated and chosen the way a user does it, from the
 * list, from the keyboard and by clicking the model. What was drawn is read back from the
 * canvas (the renderer keeps its drawing buffer), so a part that is hidden is shown to be
 * gone from the picture and not only from a list. The pure logic is pinned by the Jest
 * tests in tests/unit/utils/partsTree.test.js and tests/unit/composables/usePartsTree.test.js.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer, openViewer } from './helpers/viewerServer'

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures')

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

// A unit cube, as 12 triangles
const CUBE = [
	[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 1, 1], [1, 0, 1],
	[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 0, 0], [0, 1, 1], [0, 1, 0],
	[0, 1, 0], [0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 1], [1, 1, 0],
	[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 0], [1, 0, 1], [0, 0, 1],
	[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1], [0, 1, 1],
	[0, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0],
].map(([x, y, z]) => [x - 0.5, y - 0.5, z - 0.5])

/**
 * Assembly > [ Housing > [Lid, Base], Bolt, Shaft > Gear, an unnamed mesh ], each part one
 * flat colour that no light changes: Housing red, Bolt green, Gear blue, the unnamed one yellow.
 * Shaft holds only Gear, so the two are one row.
 */
function assemblyGltf() {
	const positions = new Float32Array(CUBE.flat())
	const buffer = Buffer.from(positions.buffer)
	const unlit = (r: number, g: number, b: number) => ({ pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1] }, extensions: { KHR_materials_unlit: {} } })
	return JSON.stringify({
		asset: { version: '2.0' },
		extensionsUsed: ['KHR_materials_unlit'],
		buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`, byteLength: buffer.length }],
		bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.length, target: 34962 }],
		accessors: [{ bufferView: 0, componentType: 5126, count: 36, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }],
		materials: [unlit(1, 0, 0), unlit(0, 1, 0), unlit(0, 0, 1), unlit(1, 1, 0)].map((material) => ({ ...material, doubleSided: true })),
		meshes: [0, 1, 2, 3].map((material) => ({ primitives: [{ attributes: { POSITION: 0 }, material }] })),
		nodes: [
			{ name: 'Assembly', children: [1, 2, 3, 4, 6] },
			{ name: 'Housing', children: [7, 8] },
			{ name: 'Bolt', mesh: 1, translation: [0, 0, 0] },
			{ name: 'Shaft', children: [5] },
			{ mesh: 3, translation: [0, -3, 0] },
			{ name: 'Gear', mesh: 2, translation: [3, 0, 0] },
			{ name: 'Spacer', mesh: 3, translation: [-3, -3, 0] },
			{ name: 'Lid', mesh: 0, translation: [-3, 0.8, 0], scale: [1.5, 0.6, 1] },
			{ name: 'Base', mesh: 0, translation: [-3, -0.8, 0], scale: [1.5, 0.6, 1] },
		],
		scenes: [{ nodes: [0] }],
		scene: 0,
	})
}

const ASSEMBLY = { id: 8101, name: 'assembly.gltf', body: assemblyGltf() }

/** Three thousand one-triangle objects: a model whose list could not be built row by row */
const MANY = {
	id: 8102,
	name: 'many.obj',
	body: Array.from({ length: 3000 }, (_, i) => `o Part ${i + 1}\nv ${i % 60} ${Math.floor(i / 60)} 0\nv ${(i % 60) + 0.8} ${Math.floor(i / 60)} 0\nv ${i % 60} ${Math.floor(i / 60) + 0.8} 0\nf ${i * 3 + 1} ${i * 3 + 2} ${i * 3 + 3}`).join('\n'),
}

const panel = (page: Page) => page.locator('.slide-out-panel')
const tree = (page: Page) => panel(page).getByRole('tree', { name: 'Parts' })
const row = (page: Page, name: string | RegExp) => tree(page).getByRole('treeitem', { name })
const action = (page: Page, name: string) => panel(page).getByRole('group', { name: 'Selected part' }).getByRole('button', { name, exact: true })

/** Open the Parts section, which starts closed, and switch off the grid and axes, whose lines are red, green and blue. */
async function openParts(page: Page) {
	await panel(page).getByRole('button', { name: 'Parts', exact: true }).click()
	await expect(tree(page)).toBeVisible()
	for (const name of ['Grid', 'Axes']) {
		const toggle = panel(page).getByRole('switch', { name })
		if (await toggle.getAttribute('aria-checked') === 'true') await toggle.click()
	}
}

/** What the viewer's canvas shows, as the number of pixels of each flat colour */
const colours = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const canvas = viewer.renderer.domElement as HTMLCanvasElement
	const copy = document.createElement('canvas')
	copy.width = canvas.width
	copy.height = canvas.height
	const ctx = copy.getContext('2d')!
	ctx.drawImage(canvas, 0, 0)
	const { data } = ctx.getImageData(0, 0, copy.width, copy.height)
	const count = { red: 0, green: 0, blue: 0, yellow: 0 }
	for (let i = 0; i < data.length; i += 4) {
		const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
		if (r > 100 && g < r * 0.4 && b < r * 0.4) count.red++
		else if (g > 100 && r < g * 0.4 && b < g * 0.4) count.green++
		else if (b > 100 && r < b * 0.4 && g < b * 0.4) count.blue++
		else if (r > 100 && g > 100 && b < r * 0.4 && Math.abs(r - g) < 0.25 * r) count.yellow++
	}
	return count
})

/** The model's nodes and the scene's tint, as the viewer holds them */
const sceneState = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const root = viewer.modelRoot
	const visible = (name: string) => root.getObjectByName(name)?.visible
	return {
		housing: visible('Housing'),
		bolt: visible('Bolt'),
		shaft: visible('Shaft'),
		gear: visible('Gear'),
		tint: viewer.scene.children.filter((child: any) => child.name === 'parts-highlight').reduce((n: number, group: any) => n + group.children.length, 0),
		target: viewer.camera.controls.value.target.toArray() as number[],
	}
})

/** A point of bare canvas, away from the model and from what is drawn over the canvas */
const bareCanvas = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const canvas = viewer.renderer.domElement as HTMLCanvasElement
	const rect = canvas.getBoundingClientRect()
	for (const [fx, fy] of [[0.1, 0.25], [0.3, 0.12], [0.1, 0.5], [0.3, 0.8], [0.5, 0.92]]) {
		const x = rect.left + rect.width * fx
		const y = rect.top + rect.height * fy
		if (document.elementFromPoint(x, y) === canvas) return { x, y }
	}
	throw new Error('no bare canvas to click')
})

/** Click where nothing is drawn: it chooses no part */
async function clickNothing(page: Page) {
	const { x, y } = await bareCanvas(page)
	await page.mouse.click(x, y)
}

/** Where on the page a named part is drawn, if it is on bare canvas */
const screenOf = (page: Page, name: string) => page.evaluate((partName) => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const node = viewer.modelRoot.getObjectByName(partName)
	const centre = new (viewer.modelRoot.position.constructor)()
	node.updateWorldMatrix(true, true)
	centre.setFromMatrixPosition(node.matrixWorld).project(viewer.camera.camera.value)
	const rect = viewer.renderer.domElement.getBoundingClientRect()
	const x = rect.left + ((centre.x + 1) / 2) * rect.width
	const y = rect.top + ((1 - centre.y) / 2) * rect.height
	return { x, y, onCanvas: document.elementFromPoint(x, y) === viewer.renderer.domElement }
}, name)

test.describe('the Parts panel', () => {
	test('lists the parts, collapsed, with a name for each part and a way to open the group', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)

		// The wrapper with one thing in it is not a row: the list starts at the first choice,
		// a single-child chain is one row, and a part with no name has one made for it
		await expect(tree(page).getByRole('treeitem')).toHaveCount(5)
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-expanded', 'false')
		await expect(row(page, /^Housing/)).toHaveAccessibleName('Housing, 2 parts')
		await expect(row(page, /^Bolt/)).not.toHaveAttribute('aria-expanded', /.*/)
		await expect(row(page, /^Shaft › Gear/)).toBeVisible()
		await expect(row(page, /^Mesh 4/)).toBeVisible()
		await expect(row(page, /^Spacer/)).toBeVisible()
		await expect(panel(page).getByRole('status').filter({ hasText: '6 parts' })).toBeVisible()

		// Opening a group makes its rows, one level in
		await row(page, /^Housing/).locator('.parts-twisty').click()
		await expect(tree(page).getByRole('treeitem')).toHaveCount(7)
		await expect(row(page, /^Lid/)).toHaveAttribute('aria-level', '2')
		await expect(row(page, /^Lid/)).toHaveAttribute('aria-posinset', '1')
		await expect(row(page, /^Lid/)).toHaveAttribute('aria-setsize', '2')
		expect(errors).toEqual([])
	})

	test('hides a part from the picture and shows it again, through render modes and Exploded view', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)
		await expect.poll(() => colours(page)).toMatchObject({ red: expect.any(Number) })
		const whole = await colours(page)
		expect(whole.red).toBeGreaterThan(200)
		expect(whole.green).toBeGreaterThan(200)
		expect(whole.blue).toBeGreaterThan(200)

		// Choose the bolt and hide it: no green is drawn, the rest is untouched
		await row(page, /^Bolt/).click()
		await action(page, 'Hide').click()
		await expect(row(page, /^Bolt/)).toHaveAccessibleName('Bolt, hidden')
		await expect(action(page, 'Show')).toBeVisible()
		await expect.poll(async () => (await colours(page)).green).toBeLessThan(20)
		const hidden = await colours(page)
		expect(hidden.red).toBeGreaterThan(whole.red * 0.8)
		expect(hidden.blue).toBeGreaterThan(whole.blue * 0.8)

		// It stays hidden through every render mode and through Exploded view
		for (const mode of ['Clay', 'Normals', 'X-ray', 'Standard']) {
			await panel(page).getByRole('button', { name: mode, exact: true }).click()
			expect((await sceneState(page)).bolt).toBe(false)
		}
		await panel(page).getByRole('button', { name: 'Exploded View' }).click()
		await expect(panel(page).getByRole('slider', { name: 'Explosion' })).toBeVisible()
		await panel(page).getByRole('slider', { name: 'Explosion' }).fill('1')
		expect((await sceneState(page)).bolt).toBe(false)
		await expect.poll(async () => (await colours(page)).green).toBeLessThan(20)
		await panel(page).getByRole('button', { name: 'Exploded View' }).click()

		await action(page, 'Show').click()
		await expect(row(page, /^Bolt/)).toHaveAccessibleName('Bolt')
		// The chosen part is tinted over its own colour: choose nothing to read the colour
		await clickNothing(page)
		await expect.poll(async () => (await colours(page)).green).toBeGreaterThan(whole.green * 0.8)
		expect(errors).toEqual([])
	})

	test('isolates a part, and Show all brings everything back', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)
		await expect.poll(async () => (await colours(page)).green).toBeGreaterThan(200)

		await row(page, /^Housing/).click()
		await action(page, 'Isolate').click()
		await expect(action(page, 'Isolate')).toHaveAttribute('aria-pressed', 'true')
		await expect(row(page, /^Housing/)).toHaveAccessibleName('Housing, 2 parts, isolated')
		await clickNothing(page)
		await expect.poll(async () => (await colours(page)).green).toBeLessThan(20)
		const isolated = await colours(page)
		expect(isolated.green).toBeLessThan(20)
		expect(isolated.blue).toBeLessThan(20)
		expect(isolated.yellow).toBeLessThan(20)
		expect(isolated.red).toBeGreaterThan(200)

		// A second press shows what was showing; hide two, then Show all
		await row(page, /^Housing/).click()
		await action(page, 'Isolate').click()
		await expect(action(page, 'Isolate')).toHaveAttribute('aria-pressed', 'false')
		await expect.poll(async () => (await colours(page)).green).toBeGreaterThan(200)

		await row(page, /^Bolt/).click()
		await action(page, 'Hide').click()
		await row(page, /^Shaft/).click()
		await action(page, 'Hide').click()
		await expect(panel(page).getByRole('status').filter({ hasText: '2 hidden' })).toBeVisible()
		await clickNothing(page)
		await expect.poll(async () => (await colours(page)).blue).toBeLessThan(20)

		await action(page, 'Show all').click()
		const state = await sceneState(page)
		expect([state.bolt, state.shaft, state.gear, state.housing]).toEqual([true, true, true, true])
		await expect.poll(async () => (await colours(page)).blue).toBeGreaterThan(200)
		await expect.poll(async () => (await colours(page)).green).toBeGreaterThan(200)
		await expect(action(page, 'Show all')).toBeDisabled()
		expect(errors).toEqual([])
	})

	test('a part chosen in the list is tinted in the model, and one clicked in the model is chosen in the list', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)
		await expect.poll(async () => (await colours(page)).green).toBeGreaterThan(200)
		const wholeRed = (await colours(page)).red

		// List to model: choosing a group tints every mesh of it, over its own colour
		await row(page, /^Housing/).click()
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-selected', 'true')
		expect((await sceneState(page)).tint).toBe(2)
		// ...so the red the housing is drawn in is covered by the accent colour
		await expect.poll(async () => (await colours(page)).red).toBeLessThan(wholeRed * 0.5)
		await expect(panel(page).locator('.parts-detail-name')).toHaveText('Housing')
		await expect(panel(page).locator('.parts-facts')).toContainText('2 parts')

		// Model to list: a click on the bolt chooses it, and a click on nothing chooses none
		const bolt = await screenOf(page, 'Bolt')
		expect(bolt.onCanvas).toBe(true)
		await page.mouse.click(bolt.x, bolt.y)
		await expect(row(page, /^Bolt/)).toHaveAttribute('aria-selected', 'true')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-selected', 'false')
		expect((await sceneState(page)).tint).toBe(1)

		// A click on a part inside a group opens the group in the list
		const lid = await screenOf(page, 'Lid')
		expect(lid.onCanvas).toBe(true)
		await page.mouse.click(lid.x, lid.y)
		await expect(row(page, /^Lid/)).toHaveAttribute('aria-selected', 'true')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-expanded', 'true')

		// Orbiting the model is not a choice: a drag that ends over the bolt leaves it as it was
		await page.mouse.move(bolt.x - 40, bolt.y + 5)
		await page.mouse.down()
		await page.mouse.move(bolt.x, bolt.y, { steps: 5 })
		await page.mouse.up()
		await expect(row(page, /^Lid/)).toHaveAttribute('aria-selected', 'true')
		// The drag turned the model, so where the bolt is drawn has changed
		const turned = await screenOf(page, 'Bolt')

		await clickNothing(page)
		await expect(tree(page).locator('[aria-selected="true"]')).toHaveCount(0)
		expect((await sceneState(page)).tint).toBe(0)

		// A hidden part cannot be clicked
		await row(page, /^Bolt/).click()
		await action(page, 'Hide').click()
		await expect(row(page, /^Bolt/)).toHaveAttribute('aria-selected', 'true')
		await page.mouse.click(turned.x, turned.y)
		// Nothing is drawn there now, so nothing is chosen
		await expect(tree(page).locator('[aria-selected="true"]')).toHaveCount(0)
		expect(errors).toEqual([])
	})

	test('zooms to a part without moving where Reset View goes back to', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)
		const before = await sceneState(page)
		// The viewer sets the model down on its grid, so the gear is not where the file put it
		const gear = await page.evaluate(() => {
			const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			return viewer.modelRoot.getObjectByName('Gear').getWorldPosition(viewer.modelRoot.position.clone()).toArray() as number[]
		})
		expect(Math.abs(gear[0] - before.target[0])).toBeGreaterThan(2)

		await row(page, /^Shaft › Gear/).click()
		await action(page, 'Zoom to').click()
		await expect.poll(async () => {
			const { target } = await sceneState(page)
			return Math.abs(target[0] - gear[0]) + Math.abs(target[1] - gear[1]) + Math.abs(target[2] - gear[2])
		}).toBeLessThan(0.3)
		await panel(page).getByRole('button', { name: /^Reset View/ }).click()
		await expect.poll(async () => {
			const { target } = await sceneState(page)
			return Math.abs(target[0] - before.target[0]) + Math.abs(target[1] - before.target[1])
		}).toBeLessThan(0.3)
		expect(errors).toEqual([])
	})

	test('the filter lists matches by name from anywhere in the tree, and Escape clears it', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)

		const filter = panel(page).getByRole('searchbox', { name: 'Filter parts by name' })
		await filter.fill('ba')
		await expect(tree(page).getByRole('treeitem')).toHaveCount(1)
		await expect(row(page, /^Base/)).toHaveAccessibleName('Base, Housing')
		await expect(panel(page).getByRole('status').filter({ hasText: '1 match' })).toBeVisible()

		await filter.fill('zzz')
		await expect(panel(page).getByText('No part has that name.')).toBeVisible()

		await filter.press('Escape')
		await expect(filter).toHaveValue('')
		await expect(panel(page)).toBeVisible()
		await expect(tree(page).getByRole('treeitem')).toHaveCount(5)
		expect(errors).toEqual([])
	})
})

test.describe('the Parts tree from the keyboard', () => {
	test('is one tab stop, and arrow keys, Enter, Space and the part keys work it', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)
		// The row the keyboard is on is the one the tree names as its active descendant
		const expectActive = async (name: RegExp) => {
			const id = await row(page, name).getAttribute('id')
			await expect(tree(page)).toHaveAttribute('aria-activedescendant', id!)
		}

		// Tab from the filter lands on the tree, once; its first row is the one the keyboard is on
		await panel(page).getByRole('searchbox', { name: 'Filter parts by name' }).focus()
		await page.keyboard.press('Tab')
		await expect(tree(page)).toBeFocused()
		await expectActive(/^Housing/)

		// Down and Up move; the tree keeps the focus and names the row it is on
		await page.keyboard.press('ArrowDown')
		await expectActive(/^Bolt/)
		await page.keyboard.press('ArrowUp')
		await expectActive(/^Housing/)
		await page.keyboard.press('End')
		await expectActive(/^Spacer/)
		await page.keyboard.press('Home')
		await expectActive(/^Housing/)

		// Right opens a group, and a second Right goes into it; Left goes back out and then closes it
		await page.keyboard.press('ArrowRight')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-expanded', 'true')
		await expect(tree(page).getByRole('treeitem')).toHaveCount(7)
		await page.keyboard.press('ArrowRight')
		await expectActive(/^Lid/)
		await page.keyboard.press('ArrowLeft')
		await expectActive(/^Housing/)
		await page.keyboard.press('ArrowLeft')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-expanded', 'false')

		// Moving does not choose; Enter chooses, and so does Space
		await expect(tree(page).locator('[aria-selected="true"]')).toHaveCount(0)
		await page.keyboard.press('Enter')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-selected', 'true')
		await page.keyboard.press('ArrowDown')
		await page.keyboard.press('Space')
		await expect(row(page, /^Bolt/)).toHaveAttribute('aria-selected', 'true')
		await expect(row(page, /^Housing/)).toHaveAttribute('aria-selected', 'false')
		expect((await sceneState(page)).tint).toBe(1)

		// H hides and shows, I isolates, Z zooms: what the buttons below do, from the row the keyboard is on
		await page.keyboard.press('h')
		await expect(row(page, /^Bolt/)).toHaveAccessibleName('Bolt, hidden')
		expect((await sceneState(page)).bolt).toBe(false)
		await page.keyboard.press('h')
		expect((await sceneState(page)).bolt).toBe(true)
		await page.keyboard.press('i')
		await expect(row(page, /^Bolt/)).toHaveAccessibleName('Bolt, isolated')
		expect((await sceneState(page)).housing).toBe(false)
		await page.keyboard.press('i')
		expect((await sceneState(page)).housing).toBe(true)
		const before = (await sceneState(page)).target
		await page.keyboard.press('z')
		// The bolt sits higher than where the camera was looking
		await expect.poll(async () => (await sceneState(page)).target[1]).toBeGreaterThan(before[1] + 0.5)

		// The tools panel is still there: none of those keys was taken for one of its own shortcuts
		await expect(panel(page)).toBeVisible()
		expect(errors).toEqual([])
	})

	test('a screen reader is told what each row is, and the buttons are an ordinary tab stop each', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)

		await expect(tree(page)).toHaveAttribute('role', 'tree')
		await expect(tree(page).getByRole('treeitem').first()).toHaveAttribute('aria-level', '1')
		await expect(tree(page).getByRole('treeitem').first()).toHaveAttribute('aria-selected', 'false')
		// The eye drawn in a row is for a pointer: the buttons below are what an assistive technology reaches
		await expect(tree(page).getByRole('button')).toHaveCount(0)
		await expect(action(page, 'Hide')).toBeDisabled()

		await row(page, /^Bolt/).click()
		await expect(action(page, 'Hide')).toBeEnabled()
		await action(page, 'Zoom to').focus()
		await page.keyboard.press('Shift+Tab')
		await expect(action(page, 'Isolate')).toBeFocused()
		await page.keyboard.press('Space')
		await expect(action(page, 'Isolate')).toHaveAttribute('aria-pressed', 'true')
		expect(errors).toEqual([])
	})
})

test.describe('large models', () => {
	test('lists three thousand parts without putting three thousand rows in the page', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, MANY)
		await openParts(page)

		await expect(panel(page).getByRole('status').filter({ hasText: '3000 parts' })).toBeVisible()
		const rendered = await tree(page).getByRole('treeitem').count()
		expect(rendered).toBeGreaterThan(5)
		expect(rendered).toBeLessThan(40)
		await expect(row(page, /^Part 1$/)).toHaveAttribute('aria-setsize', '3000')

		// The last row is there to reach: End goes to it and the list scrolls so it is drawn
		await tree(page).focus()
		await page.keyboard.press('End')
		await expect(row(page, /^Part 3000$/)).toBeVisible()
		await expect(row(page, /^Part 3000$/)).toHaveAttribute('aria-posinset', '3000')
		expect(await tree(page).getByRole('treeitem').count()).toBeLessThan(40)

		// A filter reaches a part that is not drawn
		await panel(page).getByRole('searchbox', { name: 'Filter parts by name' }).fill('Part 1234')
		await expect(row(page, /^Part 1234$/)).toBeVisible()
		expect(errors).toEqual([])
	})
})

test.describe('IFC', () => {
	const IFC = { id: 8103, name: 'two-walls.ifc', body: fs.readFileSync(path.join(FIXTURES, 'two-walls.ifc')) }

	test('groups elements by storey, and reads an element\'s properties when it is chosen', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, IFC)
		await openParts(page)

		// Elements are grouped by the storey that holds them; a storey with one element is one row
		await expect(tree(page).getByRole('treeitem')).toHaveCount(2)
		await expect(row(page, /^Level 1/)).toHaveAccessibleName('Level 1, Building Storey, 2 parts')
		await expect(row(page, /^Level 2 › Upper wall/)).toBeVisible()
		await row(page, /^Level 1/).locator('.parts-twisty').click()
		await expect(row(page, /^North wall/)).toHaveAccessibleName('North wall, Wall')
		await expect(row(page, /^South wall/)).toBeVisible()

		await row(page, /^North wall/).click()
		const detail = panel(page).locator('.parts-detail')
		await expect(detail.locator('.parts-detail-name')).toHaveText('North wall')
		await expect(detail.locator('.parts-facts').first()).toContainText('Type')
		await expect(detail.locator('.parts-facts').first()).toContainText('Wall')
		await expect(detail.locator('.parts-facts').first()).toContainText('Level 1')

		// The properties come in after the file is read for them
		const pset = detail.locator('details', { hasText: 'Pset_WallCommon' })
		await expect(pset).toBeVisible({ timeout: 15000 })
		await pset.locator('summary').click()
		await expect(pset).toContainText('FireRating')
		await expect(pset).toContainText('2HR')
		await expect(pset).toContainText('IsExternal')
		await expect(pset).toContainText('Yes')
		await expect(detail.locator('details', { hasText: 'Attributes' })).toContainText('Exterior wall')

		// The other wall has none
		await row(page, /^South wall/).click()
		await expect(detail.getByText('This element has no properties in the file.')).toBeVisible({ timeout: 15000 })
		expect(errors).toEqual([])
	})
})

test.describe('where there are no parts', () => {
	const SCAN = { id: 8104, name: 'cube-rgb.xyz', body: fs.readFileSync(path.join(FIXTURES, 'pointclouds/cube-rgb.xyz')) }

	test('a scan says why its Parts list is off, as the other tools it cannot use do', async ({ page }) => {
		const { errors } = await openViewer(page, server.url, SCAN)
		await panel(page).getByRole('button', { name: 'Parts', exact: true }).click()

		const gated = panel(page).locator('#panel-section-parts button')
		await expect(gated).toHaveAttribute('aria-disabled', 'true')
		await expect(gated).toHaveAttribute('aria-describedby', 'tdv-unavailable-parts')
		await expect(page.locator('#tdv-unavailable-parts')).toContainText('no parts to list or hide')
		await expect(panel(page).getByRole('tree')).toHaveCount(0)
		expect(errors).toEqual([])
	})
})

test.describe('on a phone', () => {
	test('the list is short, and the panel leaves the model in view', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 800 })
		const { errors } = await openViewer(page, server.url, ASSEMBLY)
		await openParts(page)

		const treeBox = (await tree(page).boundingBox())!
		const panelBox = (await panel(page).boundingBox())!
		// Five rows of 40 px at most, and a sheet that leaves the upper part of the screen to the model
		expect(treeBox.height).toBeLessThanOrEqual(204)
		expect(panelBox.y).toBeGreaterThanOrEqual(800 * 0.29)
		// A row can be touched: it is as tall as a finger needs
		expect((await row(page, /^Bolt/).boundingBox())!.height).toBeGreaterThanOrEqual(40)
		expect(errors).toEqual([])
	})
})
