/**
 * The tools panel, driven from the keyboard through the whole app.
 *
 * Grid, Axes, Wireframe and the animation Loop were a label with a click handler around a
 * bare track. A label with no control inside takes no keyboard focus, so a keyboard user
 * could not reach them and a screen reader announced neither a switch nor whether it was
 * on. This reaches each one the way a keyboard user does — Tab, then Space — and reads what
 * a screen reader reads, its role, name and state, from the page's accessibility tree.
 *
 * The same page also checks the panel as a whole: that every control a pointer can operate
 * is reached by Tab, so the next one written the old way fails here rather than in someone's
 * hands.
 */
import { test, expect, type Page } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const GCODE = [
	'G1 Z0.2 F600',
	'G1 X0 Y0 E0', 'G1 X20 Y0 E1', 'G1 X20 Y20 E2',
	'G1 Z0.4',
	'G1 X0 Y20 E3', 'G1 X0 Y0 E4',
	'G1 Z0.6',
	'G1 X20 Y0 E5', 'G1 X20 Y20 E6',
].join('\n')

// A closed cube: a model with a surface, so Wireframe has something to draw
const CUBE_OBJ = [
	'v 0 0 0', 'v 10 0 0', 'v 10 10 0', 'v 0 10 0',
	'v 0 0 10', 'v 10 0 10', 'v 10 10 10', 'v 0 10 10',
	'f 1 4 3 2', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8',
].join('\n')

/**
 * A glTF triangle that slides one metre along X over one second: a model with an
 * animation, so the panel offers the Animation section and its Loop switch.
 */
function animatedGltf() {
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
	const times = new Float32Array([0, 1])
	const translations = new Float32Array([0, 0, 0, 1, 0, 0])
	const buffer = Buffer.concat([positions, times, translations].map((a) => Buffer.from(a.buffer)))
	return JSON.stringify({
		asset: { version: '2.0' },
		buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`, byteLength: buffer.length }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
			{ buffer: 0, byteOffset: 36, byteLength: 8 },
			{ buffer: 0, byteOffset: 44, byteLength: 24 },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
			{ bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
			{ bufferView: 2, componentType: 5126, count: 2, type: 'VEC3' },
		],
		materials: [{ doubleSided: true }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }],
		nodes: [{ mesh: 0 }],
		scenes: [{ nodes: [0] }],
		scene: 0,
		animations: [{
			name: 'slide',
			samplers: [{ input: 1, output: 2, interpolation: 'LINEAR' }],
			channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
		}],
	})
}

const MODELS = {
	gcode: { id: 5101, name: 'print.gcode', body: GCODE },
	cube: { id: 5202, name: 'cube.obj', body: CUBE_OBJ },
	animated: { id: 5303, name: 'slide.gltf', body: animatedGltf() },
}
type Model = keyof typeof MODELS

function startServer(): Promise<{ url: string, close: () => Promise<void> }> {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const urlPath = (req.url || '/').split('?')[0]
			if (urlPath === '/') {
				const model = new URL(req.url || '/', 'http://x').searchParams.get('model') as Model
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
				res.end(html(MODELS[model] ?? MODELS.cube))
				return
			}
			const filePath = path.join(PROJECT_ROOT, urlPath.replace(/^\//, ''))
			if (!filePath.startsWith(PROJECT_ROOT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
				res.writeHead(404)
				res.end()
				return
			}
			const ext = path.extname(filePath)
			const type = ext === '.css' ? 'text/css' : (ext === '.mjs' || ext === '.js') ? 'application/javascript' : 'application/octet-stream'
			res.writeHead(200, { 'Content-Type': type })
			fs.createReadStream(filePath).pipe(res)
		})
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address()
			const port = addr && typeof addr === 'object' ? addr.port : 0
			resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) })
		})
	})
}

function html(model: { id: number, name: string }) {
	return `<!doctype html><html><head><meta charset="utf-8"><title>Tool panel keyboard</title>
	<link rel="stylesheet" href="/css/threedviewer-main.css">
	<style>html, body { margin: 0; height: 100%; } #threedviewer { height: 100vh; }</style>
	</head><body>
	<div id="skip-actions" style="position: absolute; top: -999px; overflow: hidden"></div><div id="threedviewer" data-file-id="${model.id}" data-filename="${model.name}" data-dir="/"></div>
	<script>
		window.t = function (_app, s, vars) { if (vars) { for (const k in vars) s = s.replace('{' + k + '}', vars[k]) } return s }
		window.n = function (_app, s, n) { return n + ' ' + s }
		window.OC = { config: { version: 'test' }, webroot: '', filePath: function (_app, type, file) { return '/' + (type ? type + '/' : '') + file } }
		window.OCA = {}
		window.OCP = {}
		window._oc_config = { session_lifetime: 0 }
	</script>
	<script type="module" src="/js/threedviewer-main.mjs"></script>
	</body></html>`
}

/**
 * Open a model with the tools panel showing, every section open.
 * @param page - the page
 * @param url - the test server
 * @param model - the model to open
 */
async function openPanel(page: Page, url: string, model: Model) {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	for (const { id, body } of Object.values(MODELS)) {
		await page.route(`**/apps/threedviewer/api/file/${id}`, (route) => route.fulfill({
			status: 200,
			contentType: 'application/octet-stream',
			body,
		}))
	}
	await page.route('**/apps/threedviewer/api/notes/**', (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify({ canEdit: true, notes: [], private: [] }),
	}))
	// Sections that start closed (Export, Settings) are opened below with the keyboard
	await page.addInitScript(() => {
		try { localStorage.removeItem('3dviewer-panel-sections') } catch { /* ignore */ }
	})
	await page.goto(`${url}?model=${model}`)
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	await page.click('[aria-label="Toggle tools panel"]')
	await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
	return { errors }
}


/**
 * What the app and the scene say about the three switches.
 * @param page - the page
 */
const sceneState = (page: Page) => page.evaluate(() => {
	const app = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
	const viewer = app.$refs.viewer
	// A helper that is switched off stays in the scene, hidden
	const shown = (type: string) => viewer.scene.children.some((child: any) => child.type === type && child.visible)
	const materials: any[] = []
	viewer.modelRoot.traverse((child: any) => { if (child.isMesh) materials.push(...[child.material].flat()) })
	return {
		app: { grid: app.grid, axes: app.axes, wireframe: app.wireframe },
		grid: shown('GridHelper'),
		axes: shown('AxesHelper'),
		wireframe: materials.length > 0 && materials.every((m) => m.wireframe === true),
	}
})

/**
 * What the focused element is, as a screen reader would say it.
 * @param page - the page
 */
const focused = (page: Page) => page.evaluate(() => {
	const el = document.activeElement as HTMLElement
	return {
		role: el.getAttribute('role') ?? el.tagName.toLowerCase(),
		text: (el.textContent ?? '').trim(),
		checked: el.getAttribute('aria-checked'),
	}
})

/**
 * Open every collapsed section of the panel from the keyboard, as a keyboard user does.
 * @param page - the page
 */
async function openEverySection(page: Page) {
	const headers = page.locator('.slide-out-panel .section-header')
	for (let i = 0; i < await headers.count(); i++) {
		const header = headers.nth(i)
		if (await header.getAttribute('aria-expanded') === 'false') {
			await header.focus()
			await page.keyboard.press('Enter')
		}
		await expect(header).toHaveAttribute('aria-expanded', 'true')
	}
}

const loopingState = (page: Page) => page.evaluate(() => (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.isAnimationLooping)

test.describe('Tools panel from the keyboard', () => {
	let server: { url: string, close: () => Promise<void> }
	test.beforeAll(async () => { server = await startServer() })
	test.afterAll(async () => { await server.close() })

	test('Grid, Axes and Wireframe are switches, reached by Tab and operated by Space', async ({ page }) => {
		const { errors } = await openPanel(page, server.url, 'cube')
		const panel = page.locator('.slide-out-panel')
		const grid = panel.getByRole('switch', { name: 'Grid' })
		const axes = panel.getByRole('switch', { name: 'Axes' })
		const wireframe = panel.getByRole('switch', { name: 'Wireframe' })

		// What a screen reader is told: a switch, its name, and whether it is on
		await expect(panel.getByRole('switch')).toHaveCount(3)
		await expect(grid).toHaveAttribute('aria-checked', 'true')
		await expect(axes).toHaveAttribute('aria-checked', 'true')
		await expect(wireframe).toHaveAttribute('aria-checked', 'false')
		// The track is decoration: it is not announced as well
		await expect(panel.locator('.toggle-switch[aria-hidden="true"]')).toHaveCount(3)
		await expect(panel.locator('.section-content').nth(1)).toMatchAriaSnapshot(`
			- switch "Grid" [checked]
			- switch "Axes" [checked]
			- switch "Wireframe"
		`)
		await expect.poll(() => sceneState(page)).toMatchObject({ grid: true, axes: true, wireframe: false })

		// Tab from the Scene header lands on each switch in turn
		await panel.getByRole('button', { name: 'Scene' }).focus()
		await page.keyboard.press('Tab')
		expect(await focused(page)).toMatchObject({ role: 'switch', text: 'Grid', checked: 'true' })

		// Space toggles it: the announced state, the app's state and the scene all follow
		await page.keyboard.press('Space')
		await expect(grid).toHaveAttribute('aria-checked', 'false')
		await expect.poll(() => sceneState(page)).toMatchObject({ app: { grid: false }, grid: false })
		await page.keyboard.press('Space')
		await expect(grid).toHaveAttribute('aria-checked', 'true')
		await expect.poll(() => sceneState(page)).toMatchObject({ app: { grid: true }, grid: true })

		await page.keyboard.press('Tab')
		expect(await focused(page)).toMatchObject({ role: 'switch', text: 'Axes', checked: 'true' })
		await page.keyboard.press('Space')
		await expect(axes).toHaveAttribute('aria-checked', 'false')
		await expect.poll(() => sceneState(page)).toMatchObject({ app: { axes: false }, axes: false })

		await page.keyboard.press('Tab')
		expect(await focused(page)).toMatchObject({ role: 'switch', text: 'Wireframe', checked: 'false' })
		// Enter works as well as Space, as it does on any button
		await page.keyboard.press('Enter')
		await expect(wireframe).toHaveAttribute('aria-checked', 'true')
		await expect.poll(() => sceneState(page)).toMatchObject({ app: { wireframe: true }, wireframe: true })
		await expect(panel.locator('.toggle-row', { hasText: 'Wireframe' }).locator('.toggle-switch')).toHaveClass(/on/)

		// Each press toggled once, and nothing else took the key: the panel is still open
		await expect(panel).toBeVisible()
		expect(errors).toEqual([])
	})

	test('a focused switch shows a focus ring', async ({ page }) => {
		await openPanel(page, server.url, 'cube')
		const panel = page.locator('.slide-out-panel')
		const grid = panel.getByRole('switch', { name: 'Grid' })
		await panel.getByRole('button', { name: 'Scene' }).focus()
		await page.keyboard.press('Tab')
		await expect(grid).toBeFocused()
		const outline = await grid.evaluate((el) => {
			const style = getComputedStyle(el)
			return { width: parseFloat(style.outlineWidth), style: style.outlineStyle }
		})
		expect(outline.width).toBeGreaterThan(0)
		expect(outline.style).not.toBe('none')
	})

	test('the Loop switch is reached by Tab from Play and operated by Space', async ({ page }) => {
		const { errors } = await openPanel(page, server.url, 'animated')
		const panel = page.locator('.slide-out-panel')
		const loop = panel.getByRole('switch', { name: 'Loop' })
		await expect(loop).toBeVisible()

		const before = await loopingState(page)
		await expect(loop).toHaveAttribute('aria-checked', String(before))

		await panel.getByRole('button', { name: /^(Play|Pause)$/ }).focus()
		await page.keyboard.press('Tab')
		expect(await focused(page)).toMatchObject({ role: 'switch', text: 'Loop' })

		await page.keyboard.press('Space')
		await expect(loop).toHaveAttribute('aria-checked', String(!before))
		expect(await loopingState(page)).toBe(!before)
		await page.keyboard.press('Enter')
		await expect(loop).toHaveAttribute('aria-checked', String(before))
		expect(await loopingState(page)).toBe(before)

		// The timeline and its step buttons have names a screen reader can say
		await expect(panel.getByRole('slider', { name: 'Animation' })).toBeVisible()
		await expect(panel.getByRole('button', { name: 'Step back' })).toBeVisible()
		await expect(panel.getByRole('button', { name: 'Step forward' })).toBeVisible()
		expect(errors).toEqual([])
	})

	/*
	 * Play and Loop share a flex row. Loop was given the full width of a panel row, which
	 * became its flex basis and squeezed Play to its minimum, and Loop jumped sideways
	 * whenever Play changed to Pause. Measured in the real app, on a model with an animation.
	 *
	 * Every figure is taken from one layout, in one evaluation, and positions are relative to
	 * the row. An earlier version read each element's position with a call of its own while
	 * the panel was still sliding in: on a slower machine the two reads were of different
	 * frames, and Loop appeared to start beyond the end of Play.
	 */
	test('Loop is as wide as its content, and Play fills the rest of the row and stays put', async ({ page }) => {
		await openPanel(page, server.url, 'animated')
		const panel = page.locator('.slide-out-panel')
		const play = panel.getByRole('button', { name: /^(Play|Pause)$/ })
		await expect(panel.getByRole('switch', { name: 'Loop' })).toBeVisible()

		// The panel slides in; measure it where it rests
		await panel.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))

		const measure = () => panel.evaluate((el) => {
			const row = el.querySelector('.animation-controls') as HTMLElement
			const playButton = row.querySelector('.tool-btn') as HTMLElement
			const loopButton = row.querySelector('[role="switch"]') as HTMLElement
			const rect = (node: Element) => node.getBoundingClientRect()
			const r = rect(row)
			const p = rect(playButton)
			const l = rect(loopButton)
			// What Loop needs: its padding, its track, the gap, and its word
			const style = getComputedStyle(loopButton)
			const track = rect(loopButton.querySelector('.toggle-switch')!).width
			const word = rect(loopButton.querySelector('.toggle-text')!).width
			const content = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
				+ track + parseFloat(style.columnGap) + word
			return {
				rowWidth: r.width,
				playWidth: p.width,
				loopWidth: l.width,
				loopContent: content,
				// positions along the row, from its own left edge
				playStart: p.left - r.left,
				playEnd: p.right - r.left,
				loopStart: l.left - r.left,
				loopEnd: l.right - r.left,
				overflows: row.scrollWidth > row.clientWidth,
			}
		})

		const before = await measure()
		// Loop is as wide as its own content, give or take rounding
		expect(Math.abs(before.loopWidth - before.loopContent)).toBeLessThanOrEqual(1)
		// and Play, which has the rest of the row, is the wider of the two
		expect(before.playWidth).toBeGreaterThan(before.loopWidth)
		// They sit one after the other inside the row: no overlap, nothing past its end
		expect(before.playEnd).toBeLessThanOrEqual(before.loopStart + 0.5)
		expect(before.loopEnd).toBeLessThanOrEqual(before.rowWidth + 0.5)
		expect(before.overflows).toBe(false)
		// Play fills what Loop leaves: the two and the gap between them are the row
		expect(before.playEnd - before.playStart + before.loopWidth).toBeGreaterThan(before.rowWidth * 0.9)

		// Pause is a different word from Play, so the button's own content changes width;
		// Loop must not move for it
		const name = (await play.textContent())!.trim()
		await play.click()
		await expect(play).not.toHaveText(name)
		const after = await measure()
		expect(Math.abs(after.loopStart - before.loopStart)).toBeLessThanOrEqual(0.5)
		expect(Math.abs(after.loopWidth - before.loopWidth)).toBeLessThanOrEqual(0.5)
		expect(Math.abs(after.playWidth - before.playWidth)).toBeLessThanOrEqual(0.5)
		expect(after.overflows).toBe(false)
	})

	test('section headers are buttons that say whether they are open, and open on Enter and Space', async ({ page }) => {
		await openPanel(page, server.url, 'gcode')
		const panel = page.locator('.slide-out-panel')
		const headers = panel.locator('.section-header')
		expect(await headers.count()).toBeGreaterThanOrEqual(5)

		for (let i = 0; i < await headers.count(); i++) {
			const header = headers.nth(i)
			expect(await header.evaluate((el) => el.tagName)).toBe('BUTTON')
			const controls = await header.getAttribute('aria-controls')
			expect(controls).toBeTruthy()
			const content = panel.locator(`#${controls}`)
			expect(['true', 'false']).toContain(await header.getAttribute('aria-expanded'))

			const open = (await header.getAttribute('aria-expanded')) === 'true'
			await header.focus()
			await page.keyboard.press('Enter')
			await expect(header).toHaveAttribute('aria-expanded', String(!open))
			if (open) await expect(content).toBeHidden()
			else await expect(content).toBeVisible()

			await page.keyboard.press('Space')
			await expect(header).toHaveAttribute('aria-expanded', String(open))
			if (open) await expect(content).toBeVisible()
			else await expect(content).toBeHidden()
		}
	})

	test('what is chosen is announced: pressed state on the mode, axis and lighting buttons', async ({ page }) => {
		await openPanel(page, server.url, 'gcode')
		const panel = page.locator('.slide-out-panel')

		// Lighting presets: one chosen, and the rest say they are not
		const presets = panel.locator('.tool-group', { hasText: 'Lighting' }).locator('.preset-btn')
		expect(await presets.count()).toBeGreaterThan(1)
		const pressed = await presets.evaluateAll((els) => els.map((el) => el.getAttribute('aria-pressed')))
		expect(pressed.every((value) => value === 'true' || value === 'false')).toBe(true)
		expect(pressed.filter((value) => value === 'true')).toHaveLength(1)

		// Cross-section: the mode and the axis, chosen by keyboard
		await panel.getByRole('button', { name: /^Cross-Section/ }).focus()
		await page.keyboard.press('Enter')
		await expect(panel.getByRole('button', { name: 'Plane', pressed: true })).toBeVisible()
		await expect(panel.getByRole('button', { name: 'Box', pressed: false })).toBeVisible()

		await panel.getByRole('button', { name: 'Z', exact: true }).focus()
		await page.keyboard.press('Enter')
		await expect(panel.getByRole('button', { name: 'Z', exact: true, pressed: true })).toBeVisible()
		await expect(panel.getByRole('button', { name: 'Y', exact: true, pressed: false })).toBeVisible()
		await expect(panel.getByRole('slider', { name: 'Position' })).toBeVisible()

		await panel.getByRole('button', { name: 'Box' }).focus()
		await page.keyboard.press('Space')
		await expect(panel.getByRole('button', { name: 'Box', pressed: true })).toBeVisible()
		await expect(panel.getByRole('button', { name: 'Plane', pressed: false })).toBeVisible()
	})

	test('Enter and Space on a panel control do not also fire a viewer shortcut', async ({ page }) => {
		await openPanel(page, server.url, 'cube')
		const panel = page.locator('.slide-out-panel')

		// The panel calls preventDefault on a key it takes as a shortcut; note which keys
		// arrive that way
		await page.evaluate(() => {
			const w = window as any
			w.__takenKeys = []
			window.addEventListener('keydown', (event) => {
				queueMicrotask(() => { if (event.defaultPrevented) w.__takenKeys.push(event.key) })
			})
		})
		await panel.getByRole('switch', { name: 'Grid' }).focus()
		await page.keyboard.press('Space')
		await page.keyboard.press('Enter')
		await panel.getByRole('button', { name: 'Scene' }).focus()
		await page.keyboard.press('Space')
		await page.keyboard.press('Enter')
		await page.keyboard.press('Space')
		// The key the panel's own switches use never counts as a shortcut taken by the page
		// handler; a letter does, which shows the probe is listening
		await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', cancelable: true })))
		const taken = await page.evaluate(() => (window as any).__takenKeys)
		expect(taken.filter((key: string) => key === ' ' || key === 'Enter')).toEqual([])
		expect(taken).toContain('r')
		await expect(panel).toBeVisible()

		// A key held with Ctrl is the browser's, not the panel's
		await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', ctrlKey: true })))
		await expect(panel).toBeVisible()
		// and a bare T is the panel's, which shows the event above reached its handler
		await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 't' })))
		await expect(panel).toBeHidden()
	})

	/*
	 * Choosing a format must not start an export (WCAG 3.2.2, On Input). In Chrome and
	 * Firefox on Windows and Linux ArrowDown on a closed select changes its value and fires
	 * `change`, so with the export on `change` the first arrow press wrote a GLB file.
	 */
	test('arrowing through the export formats chooses one without exporting; the button exports', async ({ page }) => {
		const { errors } = await openPanel(page, server.url, 'cube')
		const panel = page.locator('.slide-out-panel')
		const downloads: string[] = []
		page.on('download', (download) => downloads.push(download.suggestedFilename()))
		// Count what reaches the viewer's exporter, and with which format
		await page.evaluate(() => {
			const w = window as any
			const viewer = w.__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			const original = viewer.handleExport
			w.__exports = []
			viewer.handleExport = (format: string) => { w.__exports.push(format); return original(format) }
		})

		await panel.getByRole('button', { name: 'Export', exact: true }).first().focus()
		await page.keyboard.press('Enter')
		const select = panel.getByRole('combobox', { name: 'Export model format' })
		await expect(select).toBeVisible()
		// GLB is chosen to begin with: there is no "Select format..." entry to pass through
		await expect(select).toHaveValue('glb')
		expect(await select.locator('option').evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))).not.toContain('')

		// ArrowDown changes the value of a closed select, and fires `change`, on Windows and
		// Linux; on macOS it opens the list instead and headless Chromium has no list to
		// drive. So the keys are pressed, and a choice is then made outright: a `change`
		// event is the same whichever way it arrives.
		await select.focus()
		await page.keyboard.press('ArrowDown')
		await page.keyboard.press('ArrowDown')
		await select.selectOption('stl')
		const chosen = 'stl'
		await expect(select).toHaveValue(chosen)

		// Give an export, had one started, time to show: no call, no file, no progress
		await page.waitForTimeout(1000)
		expect(await page.evaluate(() => (window as any).__exports)).toEqual([])
		expect(downloads).toEqual([])
		await expect(page.locator('.export-progress-overlay')).toHaveCount(0)

		// The button is a named button, reached by Tab from the select
		const exportButton = panel.locator('.export-btn')
		await select.focus()
		await page.keyboard.press('Tab')
		await expect(exportButton).toBeFocused()
		await expect(exportButton).toHaveText('Export')
		expect(await exportButton.getAttribute('type')).toBe('button')

		// Enter starts it, in the format chosen
		const [first] = await Promise.all([
			page.waitForEvent('download', { timeout: 20000 }),
			page.keyboard.press('Enter'),
		])
		expect(first.suggestedFilename()).toBe(`cube.${chosen}`)
		expect(await page.evaluate(() => (window as any).__exports)).toEqual([chosen])

		// The choice is remembered, and focus stays on the button for the next press
		await expect(select).toHaveValue(chosen)
		await expect(exportButton).toBeFocused()

		// and Space does the same
		await select.selectOption('ply')
		await exportButton.focus()
		const [second] = await Promise.all([
			page.waitForEvent('download', { timeout: 20000 }),
			page.keyboard.press('Space'),
		])
		expect(second.suggestedFilename()).toBe('cube.ply')
		expect(await page.evaluate(() => (window as any).__exports)).toEqual([chosen, 'ply'])
		expect(errors).toEqual([])
	})

	for (const model of ['gcode', 'animated'] as const) {
		test(`nothing in the panel that a pointer can operate is skipped by Tab (${model})`, async ({ page }) => {
			const { errors } = await openPanel(page, server.url, model)
			const panel = page.locator('.slide-out-panel')
			await openEverySection(page)

			// Reveal the controls behind the tool buttons, by keyboard
			for (const name of [/^Cross-Section/, /^Transform/]) {
				await panel.getByRole('button', { name }).focus()
				await page.keyboard.press('Enter')
			}
			await panel.getByRole('button', { name: 'Box' }).focus()
			await page.keyboard.press('Enter')
			await panel.getByRole('button', { name: 'Plane' }).focus()
			await page.keyboard.press('Enter')

			// Everything a pointer can operate: native controls, and anything that shows a
			// pointer cursor without being, or holding, one
			const audit = await page.evaluate(() => {
				const root = document.querySelector('.slide-out-panel') as HTMLElement
				const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0
					&& getComputedStyle(el).visibility !== 'hidden'
				const native = 'button, a[href], input, select, textarea, summary, [role="switch"], [role="button"], [role="checkbox"], [tabindex]'
				const operable = [...root.querySelectorAll<HTMLElement>(native)]
					.filter((el) => visible(el) && !(el as HTMLButtonElement).disabled)
				const label = (el: HTMLElement) => (el.getAttribute('aria-label') ?? el.textContent ?? el.className).trim().replace(/\s+/g, ' ').slice(0, 40)
				const pointerOnly = [...root.querySelectorAll<HTMLElement>('*')]
					.filter((el) => visible(el) && getComputedStyle(el).cursor === 'pointer')
					.filter((el) => !el.matches(native) && !el.closest(native) && !el.querySelector(native))
					// a <label for> hands its click to the control it names
					.filter((el) => !(el instanceof HTMLLabelElement && el.control))
					.map(label)
				operable.forEach((el, index) => { el.dataset.k4Index = String(index) })
				return {
					operable: operable.map(label),
					negativeTabindex: operable.filter((el) => el.tabIndex < 0).map(label),
					pointerOnly,
				}
			})
			expect(audit.operable.length).toBeGreaterThan(25)
			expect(audit.negativeTabindex).toEqual([])
			// A label or a div that does something on click, with nothing focusable in it
			expect(audit.pointerOnly).toEqual([])

			// Now Tab through, from the first control to the last, and see what is reached
			await panel.locator('.close-btn').focus()
			const reached = new Set<number>()
			for (let step = 0; step < 300; step++) {
				const where = await page.evaluate(() => {
					const el = document.activeElement as HTMLElement
					return { inside: !!el.closest('.slide-out-panel'), index: el.dataset.k4Index }
				})
				if (!where.inside) break
				if (where.index !== undefined) reached.add(Number(where.index))
				await page.keyboard.press('Tab')
			}
			const missed = audit.operable.filter((_, index) => !reached.has(index))
			expect(missed).toEqual([])
			expect(errors).toEqual([])
		})
	}
})
