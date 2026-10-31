/**
 * The inspection tools, driven in a browser through the whole app: a G-code file is
 * served as if by Nextcloud, and each tool is reached the way a user reaches it — from
 * the tools panel. The unit suites cover what each tool computes; this covers that the
 * panel, the app and the viewer are wired to it, and that the real exporters (which the
 * unit suite mocks) produce files a reader will open.
 */
import { test, expect, type Page } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// Three layers, with a Z-hop in the first, so the slider must read "of 3" rather than "of 4"
const GCODE = [
	'G1 Z0.2 F600',
	'G1 X0 Y0 E0', 'G1 X20 Y0 E1', 'G1 X20 Y20 E2',
	'G1 Z0.6', 'G1 Z0.2',
	'G1 X0 Y20 E3',
	'G1 Z0.4',
	'G1 X0 Y0 E4', 'G1 X20 Y0 E5',
	'G1 Z0.6',
	'G1 X20 Y20 E6', 'G1 X0 Y20 E7',
].join('\n')

// A closed cube: the mesh the exporters are checked on. A toolpath has no triangles.
const CUBE_OBJ = [
	'v 0 0 0', 'v 10 0 0', 'v 10 10 0', 'v 0 10 0',
	'v 0 0 10', 'v 10 0 10', 'v 10 10 10', 'v 0 10 10',
	'f 1 4 3 2', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8',
].join('\n')

// Two cubes side by side, as two objects: two meshes, which Exploded view can take apart
const TWO_CUBES_OBJ = [
	'o left',
	'v 0 0 0', 'v 10 0 0', 'v 10 10 0', 'v 0 10 0',
	'v 0 0 10', 'v 10 0 10', 'v 10 10 10', 'v 0 10 10',
	'f 1 4 3 2', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8',
	'o right',
	'v 12 0 0', 'v 22 0 0', 'v 22 10 0', 'v 12 10 0',
	'v 12 0 10', 'v 22 0 10', 'v 22 10 10', 'v 12 10 10',
	'f 9 12 11 10', 'f 13 14 15 16', 'f 9 10 14 13', 'f 10 11 15 14', 'f 11 12 16 15', 'f 12 9 13 16',
].join('\n')

// A unit cube's faces, each a quad wound counter-clockwise seen from outside
const CUBE_QUADS = [
	[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
	[[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
	[[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
	[[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
	[[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
	[[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
]
const CUBE_TRIANGLES = CUBE_QUADS.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]])

// A glTF cube 1 m on a side: glTF is in metres
function cubeGltf() {
	const positions = new Float32Array(CUBE_TRIANGLES.flat(2))
	const buffer = Buffer.from(positions.buffer)
	return JSON.stringify({
		asset: { version: '2.0' },
		buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`, byteLength: buffer.length }],
		bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: buffer.length, target: 34962 }],
		accessors: [{ bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }],
		materials: [{ doubleSided: true }],
		meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0, mode: 4 }] }],
		nodes: [{ mesh: 0 }],
		scenes: [{ nodes: [0] }],
		scene: 0,
	})
}

// An ASCII STL cube 10 mm on a side: an STL carries no unit and is read as millimetres
function cubeStl() {
	const facets = CUBE_TRIANGLES.map((triangle) => [
		'facet normal 0 0 0', 'outer loop',
		...triangle.map(([x, y, z]) => `vertex ${x * 10} ${y * 10} ${z * 10}`),
		'endloop', 'endfacet',
	].join('\n'))
	return ['solid cube', ...facets, 'endsolid cube'].join('\n')
}

const MODELS = {
	gcode: { id: 4242, name: 'print.gcode', body: GCODE },
	cube: { id: 4343, name: 'cube.obj', body: CUBE_OBJ },
	// A second cube, opened after the first in the same viewer
	cube2: { id: 4444, name: 'cube2.obj', body: CUBE_OBJ },
	// A glTF, which is in metres: a triangle 1 m on a side
	gltf: { id: 4545, name: 'triangle.gltf', body: fs.readFileSync(path.join(PROJECT_ROOT, 'tests/fixtures/triangle.gltf'), 'utf8') },
	metreCube: { id: 4646, name: 'cube.gltf', body: cubeGltf() },
	stlCube: { id: 4747, name: 'cube.stl', body: cubeStl() },
	// Two parts, and a second copy opened after the first in the same viewer
	twoCubes: { id: 4848, name: 'parts.obj', body: TWO_CUBES_OBJ },
	twoCubes2: { id: 4949, name: 'parts2.obj', body: TWO_CUBES_OBJ },
}
type Model = keyof typeof MODELS

function startServer(): Promise<{ url: string, close: () => Promise<void> }> {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const urlPath = (req.url || '/').split('?')[0]
			if (urlPath === '/') {
				const model = new URL(req.url || '/', 'http://x').searchParams.get('model') as Model
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
				res.end(html(MODELS[model] ?? MODELS.gcode))
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
	return `<!doctype html><html><head><meta charset="utf-8"><title>Inspection tools</title>
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

type NotesBody = { canEdit: boolean, notes: object[], private: object[] }
type NoteWrite = { method: string, body: any }

/**
 * Answer the shared-notes routes the way the server does, and record every write.
 * @param page - the page
 * @param notes - what a read returns
 */
async function mockNotes(page: Page, notes: NotesBody = { canEdit: true, notes: [], private: [] }) {
	const writes: NoteWrite[] = []
	let nextId = 500
	await page.route('**/apps/threedviewer/api/notes/**', (route) => {
		const request = route.request()
		if (request.method() === 'GET') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(notes) })
		}
		writes.push({ method: request.method(), body: request.postDataJSON() })
		return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: nextId++, author: { uid: 'alice', displayName: 'Alice' } }) })
	})
	return writes
}

async function openLoadedViewer(page: Page, url: string, model: Model = 'gcode', notes?: NotesBody) {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	// Without Nextcloud's page globals, generateUrl puts the file URL on a host that does
	// not resolve (http://index.php/…); answering it here serves it wherever it points.
	for (const { id, body } of Object.values(MODELS)) {
		await page.route(`**/apps/threedviewer/api/file/${id}`, (route) => route.fulfill({
			status: 200,
			contentType: 'application/octet-stream',
			body,
		}))
	}
	// Every model has shared notes; unanswered, the viewer would say "Notes not loaded"
	const writes = await mockNotes(page, notes)
	await page.goto(`${url}?model=${model}`)
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	await page.click('[aria-label="Toggle tools panel"]')
	await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
	return { errors, writes }
}

/**
 * Three page positions on the loaded model's face that most faces the camera, each one
 * the canvas itself rather than a panel over it. Projected through the viewer's own
 * camera, so the test does not depend on where the layout puts the model.
 * @param page - the page, with a model loaded
 */
async function pointsOnTheCube(page: Page): Promise<number[][]> {
	return await page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		const root = viewer.modelRoot
		const camera = viewer.camera.camera.value
		const canvas = viewer.renderer.domElement
		const Vector3 = root.position.constructor
		root.updateMatrixWorld(true)
		// The model's world-space box, corner by corner
		const min = new Vector3(Infinity, Infinity, Infinity)
		const max = new Vector3(-Infinity, -Infinity, -Infinity)
		root.traverse((child: any) => {
			const position = child.isMesh && child.geometry.attributes.position
			for (let i = 0; position && i < position.count; i++) {
				const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
				min.min(p)
				max.max(p)
			}
		})
		const centre = min.clone().add(max).multiplyScalar(0.5)
		// The face whose outward normal points most toward the camera
		let best = { axis: 0, side: 1, score: -Infinity }
		for (let axis = 0; axis < 3; axis++) {
			for (const side of [-1, 1]) {
				const normal = new Vector3().setComponent(axis, side)
				const faceCentre = centre.clone().setComponent(axis, side > 0 ? max.getComponent(axis) : min.getComponent(axis))
				const score = normal.dot(camera.position.clone().sub(faceCentre).normalize())
				if (score > best.score) best = { axis, side, score }
			}
		}
		const [u, v] = [0, 1, 2].filter((a) => a !== best.axis)
		const rect = canvas.getBoundingClientRect()
		const found: number[][] = []
		// A corner, the middle and another corner make a real angle; the rest are fallbacks
		// for when a panel covers one of them
		const tries = [[0.25, 0.25], [0.5, 0.75], [0.75, 0.25], [0.3, 0.6], [0.7, 0.7], [0.6, 0.35], [0.4, 0.4], [0.65, 0.55]]
		for (const [fu, fv] of tries) {
			const p = centre.clone()
			p.setComponent(best.axis, best.side > 0 ? max.getComponent(best.axis) : min.getComponent(best.axis))
			p.setComponent(u, min.getComponent(u) + fu * (max.getComponent(u) - min.getComponent(u)))
			p.setComponent(v, min.getComponent(v) + fv * (max.getComponent(v) - min.getComponent(v)))
			const ndc = p.project(camera)
			const x = rect.left + (ndc.x + 1) / 2 * rect.width
			const y = rect.top + (1 - ndc.y) / 2 * rect.height
			const clear = document.elementFromPoint(x, y) === canvas
			const apart = found.every(([fx, fy]) => Math.hypot(fx - x, fy - y) > 15)
			if (clear && apart) found.push([x, y])
			if (found.length === 3) return found
		}
		throw new Error(`Only ${found.length} clear points on the model`)
	})
}

/**
 * Two page positions on the loaded model's face that most faces the camera, a fixed
 * fraction of the model apart, and how far apart they are in scene units. Projected
 * through the viewer's own camera, as pointsOnTheCube is.
 * @param page - the page, with a model loaded
 */
async function twoPointsOnTheCube(page: Page): Promise<{ points: number[][], sceneDistance: number }> {
	return await page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		const root = viewer.modelRoot
		const camera = viewer.camera.camera.value
		const canvas = viewer.renderer.domElement
		const Vector3 = root.position.constructor
		root.updateMatrixWorld(true)
		const min = new Vector3(Infinity, Infinity, Infinity)
		const max = new Vector3(-Infinity, -Infinity, -Infinity)
		root.traverse((child: any) => {
			const position = child.isMesh && child.geometry.attributes.position
			for (let i = 0; position && i < position.count; i++) {
				const p = new Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld)
				min.min(p)
				max.max(p)
			}
		})
		const centre = min.clone().add(max).multiplyScalar(0.5)
		let best = { axis: 0, side: 1, score: -Infinity }
		for (let axis = 0; axis < 3; axis++) {
			for (const side of [-1, 1]) {
				const normal = new Vector3().setComponent(axis, side)
				const faceCentre = centre.clone().setComponent(axis, side > 0 ? max.getComponent(axis) : min.getComponent(axis))
				const score = normal.dot(camera.position.clone().sub(faceCentre).normalize())
				if (score > best.score) best = { axis, side, score }
			}
		}
		const rect = canvas.getBoundingClientRect()
		const onFace = (u: number, fu: number, v: number, fv: number) => {
			const p = centre.clone()
			p.setComponent(best.axis, best.side > 0 ? max.getComponent(best.axis) : min.getComponent(best.axis))
			p.setComponent(u, min.getComponent(u) + fu * (max.getComponent(u) - min.getComponent(u)))
			p.setComponent(v, min.getComponent(v) + fv * (max.getComponent(v) - min.getComponent(v)))
			return p
		}
		const toPage = (p: any) => {
			const ndc = p.clone().project(camera)
			return [rect.left + (ndc.x + 1) / 2 * rect.width, rect.top + (1 - ndc.y) / 2 * rect.height]
		}
		const clear = ([x, y]: number[]) => document.elementFromPoint(x, y) === canvas
		const [a, b] = [0, 1, 2].filter((axis) => axis !== best.axis)
		// Across the face one way, then the other, at a few heights, until both ends are clear
		for (const [u, v] of [[a, b], [b, a]]) {
			for (const fv of [0.5, 0.4, 0.6, 0.3, 0.7]) {
				const ends = [onFace(u, 0.2, v, fv), onFace(u, 0.8, v, fv)]
				const points = ends.map(toPage)
				if (points.every(clear)) {
					return { points, sceneDistance: ends[0].distanceTo(ends[1]) }
				}
			}
		}
		throw new Error('No two clear points on the model')
	})
}

/**
 * Take a distance measurement between two points on the cube, and read it.
 * @param page - the page, with a model loaded and the tools panel open
 * @return the reading's number and unit, and the distance in scene units
 */
async function measureAcrossTheCube(page: Page) {
	await page.locator('.slide-out-panel').getByText('Measurement', { exact: true }).click()
	const overlay = page.locator('.measurement-overlay')
	await expect(overlay).toBeVisible()
	const { points, sceneDistance } = await twoPointsOnTheCube(page)
	for (const [x, y] of points) {
		await page.mouse.click(x, y)
	}
	await expect(overlay.locator('.measurement-item')).toHaveCount(1)
	const text = (await overlay.locator('.measurement-distance').textContent())!.trim()
	const [, value, unit] = text.match(/^(-?[\d.]+) (\S+)$/)!
	return { overlay, value: Number(value), unit, sceneDistance, text }
}

/**
 * Answer the thumbnail routes as the server does: `needed` are the files without a
 * thumbnail for their version, every other one has one. Each upload is recorded.
 * @param page - the page
 * @param needed - ids of the files that get a thumbnail
 * @return the uploaded PNGs, in order
 */
async function recordThumbnails(page: Page, needed: number[]) {
	const uploads: Buffer[] = []
	await page.route('**/apps/threedviewer/api/thumbnails/status**', (route) => {
		const ids = (new URL(route.request().url()).searchParams.get('ids') ?? '').split(',').map(Number)
		const files = Object.fromEntries(ids.map((id) => [id, { canEdit: true, hasThumbnail: !needed.includes(id), etag: 'v1' }]))
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) })
	})
	await page.route('**/apps/threedviewer/api/thumbnail/**', (route) => {
		uploads.push(route.request().postDataBuffer()!)
		return route.fulfill({ status: 201, body: '' })
	})
	return uploads
}

/**
 * Choose an export format and press Export, as a user does: choosing alone starts nothing.
 * @param page - the page, with the tools panel open and its Export section showing
 * @param format - the format's value in the select
 */
async function exportAs(page: Page, format: string) {
	await page.selectOption('.export-select', format)
	await page.locator('.export-btn').click()
}

/**
 * Open another model in the same viewer, as the file browser does (its URL update left
 * out: generateUrl has no Nextcloud host here), and wait for it to load.
 * @param page - the page, with a model loaded
 * @param model - the model to open
 */
async function openNext(page: Page, model: Model) {
	await page.evaluate(({ id, name }) => {
		(window as any).__LOAD_COMPLETE = false
		// The mounted root renders App; App is its only child
		const app = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
		app.currentFilename = name
		app.currentFileId = id
	}, MODELS[model])
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
}

/**
 * How many of a PNG's pixels the model covers (alpha above zero), and its middle
 * pixel's alpha.
 * @param page - any page, to decode the image in
 * @param png - the image
 */
async function coverage(page: Page, png: Buffer): Promise<{ covered: number, centreAlpha: number }> {
	return await page.evaluate(async (base64) => {
		const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
		const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
		const canvas = document.createElement('canvas')
		canvas.width = bitmap.width
		canvas.height = bitmap.height
		const context = canvas.getContext('2d')!
		context.drawImage(bitmap, 0, 0)
		const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height)
		let covered = 0
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] > 0) covered++
		}
		const centre = (Math.floor(bitmap.height / 2) * bitmap.width + Math.floor(bitmap.width / 2)) * 4
		return { covered, centreAlpha: data[centre + 3] }
	}, png.toString('base64'))
}

/**
 * The thumbnail a model gets when it is the first one opened, with every tool as it
 * starts: what a capture made under any viewer state must match.
 * @param page - a fresh page
 * @param url - the test server
 * @param model - the model
 */
async function plainThumbnail(page: Page, url: string, model: Model) {
	const uploads = await recordThumbnails(page, [MODELS[model].id])
	await openLoadedViewer(page, url, model)
	await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)
	return await coverage(page, uploads[0])
}

/**
 * Switch a tool on the moment the first model has loaded, inside the half second before
 * the viewer captures its thumbnail, as a quick user would. The switch is made from the
 * page, in the next task after the load sets `__LOAD_COMPLETE`, and both times are kept
 * so the test can check it came before the capture. Call before the page loads.
 * @param page - the page, not yet loaded
 * @param tool - which tool to switch on
 */
async function switchOnAtLoad(page: Page, tool: 'wireframe' | 'exploded') {
	await page.addInitScript((which) => {
		const w = window as any
		let loaded = false
		Object.defineProperty(w, '__LOAD_COMPLETE', {
			configurable: true,
			get: () => loaded,
			set: (value) => {
				loaded = value
				if (!value || w.__loadedAt !== undefined) return
				w.__loadedAt = performance.now()
				setTimeout(() => {
					const app = w.__THREEDVIEWER_APP.$.subTree.component.proxy
					if (which === 'wireframe') {
						app.wireframe = true
					} else {
						app.onToggleExplodedView()
						app.onSetExplodedFactor(1)
					}
					w.__switchedAt = performance.now()
				}, 0)
			},
		})
	}, tool)
}

test.describe('Inspection tools', () => {
	let server: { url: string, close: () => Promise<void> }
	test.beforeAll(async () => { server = await startServer() })
	test.afterAll(async () => { await server.close() })

	test('the G-code layer slider steps through the print', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url)
		const panel = page.locator('.gcode-layers')
		await expect(panel).toContainText('Layer 3 of 3')
		await expect(panel).toContainText('Height 0.60 mm')

		await panel.locator('input[type="range"]').fill('1')
		await expect(panel).toContainText('Layer 1 of 3')
		await expect(panel).toContainText('Height 0.20 mm')

		const slider = panel.getByRole('slider')
		await expect(slider).toHaveAttribute('aria-valuetext', 'Layer 1 of 3, Height 0.20 mm')

		// A switch reached and worked from the keyboard, not only by pointer
		const onlyThisLayer = panel.getByRole('switch', { name: 'Only this layer' })
		await expect(onlyThisLayer).toHaveAttribute('aria-checked', 'false')
		await onlyThisLayer.focus()
		await page.keyboard.press('Space')
		await expect(onlyThisLayer).toHaveAttribute('aria-checked', 'true')
		await expect(panel.locator('.toggle-switch')).toHaveClass(/on/)

		// The slider steps from the keyboard as well
		await slider.focus()
		await page.keyboard.press('ArrowRight')
		await expect(panel).toContainText('Layer 2 of 3')
		expect(errors).toEqual([])
	})

	test('shading switches mode and back', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url)
		const button = (name: string) => page.locator('.preset-btn', { hasText: new RegExp(`^\\s*${name}\\s*$`) })
		await expect(page.getByRole('group', { name: 'Shading' })).toBeVisible()

		await expect(button('Standard')).toHaveAttribute('aria-pressed', 'true')
		for (const mode of ['Clay', 'Normals', 'X-ray', 'Standard']) {
			await button(mode).click()
			await expect(button(mode)).toHaveAttribute('aria-pressed', 'true')
		}
		expect(errors).toEqual([])
	})

	test('the measurement panel switches to angles', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url)
		await page.locator('.slide-out-panel').getByText('Measurement', { exact: true }).click()
		const overlay = page.locator('.measurement-overlay')
		await expect(overlay).toBeVisible()
		await expect(overlay).toContainText('Click two points')

		await overlay.getByRole('button', { name: 'Angle' }).click()
		await expect(overlay.getByRole('button', { name: 'Angle' })).toHaveAttribute('aria-pressed', 'true')
		await expect(overlay).toContainText('the second is the corner')
		expect(errors).toEqual([])
	})

	for (const [format, check] of [
		['3mf', (bytes: Buffer) => {
			const files = unzipSync(new Uint8Array(bytes))
			expect(Object.keys(files)).toContain('3D/3dmodel.model')
			const model = strFromU8(files['3D/3dmodel.model'])
			expect(model).toContain('<model unit="millimeter"')
			// Six quads, as triangles
			expect(model.match(/<triangle /g)).toHaveLength(12)
		}],
		['ply', (bytes: Buffer) => {
			expect(bytes.subarray(0, 3).toString()).toBe('ply')
			expect(bytes.toString('latin1', 0, 200)).toContain('format binary_little_endian 1.0')
		}],
		['usdz', (bytes: Buffer) => {
			// A USDZ is a zip whose first entry is the USD layer
			const files = unzipSync(new Uint8Array(bytes))
			expect(Object.keys(files)[0]).toMatch(/\.usda$/)
			// One viewer unit is a millimetre and USD's unit here a metre: the model sits
			// under a 1/1000 scale, so AR Quick Look shows the 10 mm cube 10 mm across
			const layer = strFromU8(files[Object.keys(files)[0]])
			expect(layer).toContain('metersPerUnit = 1')
			expect(layer).toContain('matrix4d xformOp:transform = ( (0.001, 0, 0, 0), (0, 0.001, 0, 0), (0, 0, 0.001, 0), (0, 0, 0, 1) )')
		}],
	] as const) {
		test(`exports the model as ${format}`, async ({ page }) => {
			const { errors } = await openLoadedViewer(page, server.url, 'cube')
			await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
			const [download] = await Promise.all([
				page.waitForEvent('download', { timeout: 20000 }),
				exportAs(page, format),
			])
			expect(download.suggestedFilename()).toBe(`cube.${format}`)
			const file = await download.path()
			check(fs.readFileSync(file!))
			expect(errors).toEqual([])
		})
	}

	/*
	 * 3MF is written in millimetres and USDZ in metres. The cube above is an OBJ, taken as
	 * millimetres; a glTF is in metres, so its 3MF is scaled up a thousandfold and its USDZ
	 * goes out unscaled.
	 */
	test('a glTF, in metres, exports at its real size', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url, 'gltf')
		await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
		const save = async (format: string) => {
			const [download] = await Promise.all([
				page.waitForEvent('download', { timeout: 20000 }),
				exportAs(page, format),
			])
			return fs.readFileSync((await download.path())!)
		}

		const model = strFromU8(unzipSync(new Uint8Array(await save('3mf')))['3D/3dmodel.model'])
		const coordinates = [...model.matchAll(/ [xyz]="(-?[\d.e+-]+)"/g)].map((m) => Math.abs(Number(m[1])))
		expect(Math.max(...coordinates)).toBeCloseTo(1000, 3)

		const usdz = unzipSync(new Uint8Array(await save('usdz')))
		const layer = strFromU8(usdz[Object.keys(usdz)[0]])
		expect(layer).toContain('metersPerUnit = 1')
		expect(layer).not.toContain('(0.001, 0, 0, 0)')
		expect(errors).toEqual([])
	})

	test('says why a toolpath cannot be exported as 3MF, instead of saving an empty file', async ({ page }) => {
		let downloaded = false
		page.on('download', () => { downloaded = true })
		await openLoadedViewer(page, server.url)
		await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
		await exportAs(page, '3mf')
		await expect(page.getByLabel('Export Failed')).toContainText('This model has no surfaces to save as 3MF.')
		expect(downloaded).toBe(false)
	})

	test('an angle taken with three clicks is saved as a shared angle note', async ({ page }) => {
		const { errors, writes } = await openLoadedViewer(page, server.url, 'cube')
		await page.locator('.slide-out-panel').getByText('Measurement', { exact: true }).click()
		const overlay = page.locator('.measurement-overlay')
		await overlay.getByRole('button', { name: 'Angle' }).click()

		// Three points on the cube, found through the camera rather than fixed pixels:
		for (const [x, y] of await pointsOnTheCube(page)) {
			await page.mouse.click(x, y)
		}

		await expect(overlay.locator('.measurement-item')).toHaveCount(1)
		await expect(overlay.locator('.measurement-item')).toContainText('Angle 1')
		await expect(overlay.getByRole('button', { name: 'Delete angle 1' })).toBeVisible()
		await expect(overlay.locator('.measurement-distance')).toContainText('°')
		await expect.poll(() => writes.length).toBe(1)
		expect(writes[0].method).toBe('POST')
		expect(writes[0].body.type).toBe('angle')
		expect(writes[0].body.payload.space).toBe('model')
		expect(writes[0].body.payload.points).toHaveLength(3)
		await expect(overlay).toContainText('Alice')
		expect(errors).toEqual([])
	})

	/*
	 * A distance reads in the model's own unit: a glTF is in metres, so a cube 1 m on a
	 * side measures about 0.6 m between points 20% and 80% of the way across a face,
	 * where it used to read 0.6 mm. An STL is read exactly as before, in millimetres.
	 */
	test('a glTF in metres measures in metres', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url, 'metreCube')
		const { overlay, value, unit, sceneDistance } = await measureAcrossTheCube(page)
		expect(sceneDistance).toBeCloseTo(0.6, 6)
		expect(unit).toBe('m')
		expect(value).toBeCloseTo(0.6, 1)
		expect(Math.abs(value - 0.6)).toBeLessThan(0.6 * 0.03)
		await expect(overlay.locator('select')).toHaveValue('meters')

		// The same reading in millimetres is a thousand times the number, not the same one
		await overlay.locator('select').selectOption('millimeters')
		const millimetres = Number((await overlay.locator('.measurement-distance').textContent())!.trim().split(' ')[0])
		expect(millimetres).toBeCloseTo(value * 1000, 0)
		expect(errors).toEqual([])
	})

	test('an STL measures in millimetres, as it always has', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url, 'stlCube')
		const { overlay, value, unit, sceneDistance, text } = await measureAcrossTheCube(page)
		expect(sceneDistance).toBeCloseTo(6, 6)
		expect(unit).toBe('mm')
		expect(Math.abs(value - 6)).toBeLessThan(6 * 0.03)
		await expect(overlay.locator('select')).toHaveValue('millimeters')
		// A scene unit is a millimetre: the reading is the scene distance itself
		const picked = await page.evaluate(() => {
			const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			return viewer.measurements[0].distance
		})
		expect(text).toBe(`${picked.toFixed(3)} mm`)
		expect(errors).toEqual([])
	})

	test('a stored angle is drawn when the model opens, with its author', async ({ page }) => {
		const { errors, writes } = await openLoadedViewer(page, server.url, 'cube', {
			canEdit: false,
			notes: [{
				id: 9,
				type: 'angle',
				payload: { space: 'model', points: [{ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 10, z: 0 }] },
				author: { uid: 'bob', displayName: 'Bob' },
				createdAt: 1,
				updatedAt: 1,
			}],
			private: [],
		})
		await page.locator('.slide-out-panel').getByText('Measurement', { exact: true }).click()
		const overlay = page.locator('.measurement-overlay')
		await expect(overlay.locator('.measurement-item')).toContainText('Angle 1')
		await expect(overlay.locator('.measurement-distance')).toHaveText('90.00°')
		await expect(overlay).toContainText('Bob')
		expect(writes).toEqual([])
		expect(errors).toEqual([])
	})

	/*
	 * A thumbnail is shared with everyone who can see the file. The viewer keeps its
	 * shading from one model to the next and captures the next model half a second after
	 * it opens: in X-ray that capture must still show the model's own, opaque materials.
	 */
	test('a thumbnail captured in X-ray shows the model\'s own materials', async ({ page }) => {
		const uploads: Buffer[] = []
		await page.route('**/apps/threedviewer/api/thumbnails/status**', (route) => {
			const ids = new URL(route.request().url()).searchParams.get('ids')
			const files = ids === String(MODELS.cube2.id)
				? { [MODELS.cube2.id]: { canEdit: true, hasThumbnail: false, etag: 'v1' } }
				: { [MODELS.cube.id]: { canEdit: true, hasThumbnail: true, etag: 'v1' } }
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files }) })
		})
		await page.route(`**/apps/threedviewer/api/thumbnail/${MODELS.cube2.id}**`, (route) => {
			uploads.push(route.request().postDataBuffer()!)
			return route.fulfill({ status: 201, body: '' })
		})

		const { errors } = await openLoadedViewer(page, server.url, 'cube')
		const xray = page.locator('.preset-btn', { hasText: /^\s*X-ray\s*$/ })
		await xray.click()
		await expect(xray).toHaveAttribute('aria-pressed', 'true')

		// Open the next model in the same viewer, as the file browser does (its URL update
		// left out: generateUrl has no Nextcloud host here)
		await page.evaluate(({ id, name }) => {
			(window as any).__LOAD_COMPLETE = false
			// The mounted root renders App; App is its only child
			const app = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy
			app.currentFilename = name
			app.currentFileId = id
		}, MODELS.cube2)
		await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
		await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)

		// The viewer is still in X-ray
		await expect(xray).toHaveAttribute('aria-pressed', 'true')

		// The cube covers the middle of the thumbnail. X-ray draws it at a quarter opacity,
		// so the pixel there would be translucent; the model's own material is opaque.
		const alpha = await page.evaluate(async (base64) => {
			const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
			const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
			const canvas = document.createElement('canvas')
			canvas.width = bitmap.width
			canvas.height = bitmap.height
			const context = canvas.getContext('2d')!
			context.drawImage(bitmap, 0, 0)
			const { data } = context.getImageData(bitmap.width / 2, bitmap.height / 2, 1, 1)
			return data[3]
		}, uploads[0].toString('base64'))
		expect(alpha).toBe(255)
		expect(errors).toEqual([])
	})
	/*
	 * Wireframe stays on for the next model, as the toggle shows, and the next model's
	 * thumbnail, captured half a second after it opens, must still be solid: the same
	 * picture a model gets with nothing switched on.
	 *
	 * This reaches the thumbnail fix through the carry-over to the next model (9c0d60c).
	 * Without the carry-over the next model would not be in wireframe and the thumbnail
	 * comparison would pass with nothing to check; the check that the model is drawn in
	 * wireframe fails instead. The capture-window test further down does not depend on
	 * the carry-over.
	 */
	test('a thumbnail captured with Wireframe on is solid', async ({ page, browser }) => {
		const plainPage = await browser.newPage()
		const plain = await plainThumbnail(plainPage, server.url, 'cube2')
		await plainPage.close()

		const uploads = await recordThumbnails(page, [MODELS.cube2.id])
		const { errors } = await openLoadedViewer(page, server.url, 'cube')
		const wireframe = page.locator('.slide-out-panel .toggle-row', { hasText: 'Wireframe' })
		await wireframe.click()
		await expect(wireframe.locator('.toggle-switch')).toHaveClass(/on/)

		await openNext(page, 'cube2')
		await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)

		// The new model is drawn in wireframe, as the toggle says
		await expect(wireframe.locator('.toggle-switch')).toHaveClass(/on/)
		expect(await page.evaluate(() => {
			const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			const materials: any[] = []
			viewer.modelRoot.traverse((child: any) => { if (child.isMesh) materials.push(...[child.material].flat()) })
			return materials.length > 0 && materials.every((m) => m.wireframe === true)
		})).toBe(true)

		// A wireframe covers a fraction of what the solid cube does; the thumbnail is solid
		const captured = await coverage(page, uploads[0])
		expect(captured.centreAlpha).toBe(255)
		expect(Math.abs(captured.covered - plain.covered)).toBeLessThanOrEqual(plain.covered * 0.01)
		expect(errors).toEqual([])
	})

	/*
	 * Exploded view stays on for the next model it can take apart, by the same amount,
	 * and that model's thumbnail must show its parts together, framed as they are when
	 * nothing is exploded.
	 *
	 * Like the Wireframe test above, this reaches the thumbnail fix through the carry-over
	 * (9c0d60c), and checks that the next model really is exploded so it cannot pass
	 * empty; the capture-window test below does not depend on the carry-over.
	 */
	test('a thumbnail captured in Exploded view has the parts together', async ({ page, browser }) => {
		const plainPage = await browser.newPage()
		const plain = await plainThumbnail(plainPage, server.url, 'twoCubes2')
		await plainPage.close()

		const uploads = await recordThumbnails(page, [MODELS.twoCubes2.id])
		const { errors } = await openLoadedViewer(page, server.url, 'twoCubes')
		const explode = page.locator('.slide-out-panel .tool-btn', { hasText: 'Exploded View' })
		await explode.click()
		await expect(explode).toContainText('Active')
		// All the way apart, where a camera fitted to the parts together loses them
		await page.locator('.slide-out-panel .tool-group', { hasText: 'Explosion' }).locator('input[type="range"]').fill('1')

		await openNext(page, 'twoCubes2')
		await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)

		// The new model is exploded, as the panel says
		await expect(explode).toContainText('Active')
		const gap = await page.evaluate(() => {
			const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			const meshes: any[] = []
			viewer.modelRoot.traverse((child: any) => { if (child.isMesh) meshes.push(child) })
			return meshes.map((mesh) => mesh.position.length())
		})
		expect(Math.max(...gap)).toBeGreaterThan(1)

		// The camera is fitted to the parts as they are shown, so none has left the view
		const outside = await page.evaluate(() => {
			const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
			const root = viewer.modelRoot
			const camera = viewer.camera.camera.value
			const Vector3 = root.position.constructor
			root.updateMatrixWorld(true)
			camera.updateMatrixWorld(true)
			let worst = 0
			root.traverse((child: any) => {
				const position = child.isMesh && child.geometry.attributes.position
				for (let i = 0; position && i < position.count; i++) {
					const ndc = new Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).project(camera)
					worst = Math.max(worst, Math.abs(ndc.x), Math.abs(ndc.y))
				}
			})
			return worst
		})
		expect(outside).toBeLessThanOrEqual(1)

		// Flung apart, the parts would be framed smaller, with a gap between them
		const captured = await coverage(page, uploads[0])
		expect(Math.abs(captured.covered - plain.covered)).toBeLessThanOrEqual(plain.covered * 0.01)
		expect(captured.centreAlpha).toBe(plain.centreAlpha)
		expect(errors).toEqual([])
	})
	/*
	 * The same two fixes without the carry-over to the next model: the tool is switched
	 * on in the half second between the model opening and the viewer capturing it.
	 */
	for (const [tool, model] of [['wireframe', 'cube2'], ['exploded', 'twoCubes2']] as const) {
		test(`a thumbnail captured just after ${tool === 'wireframe' ? 'Wireframe' : 'Exploded view'} is switched on matches a plain one`, async ({ page, browser }) => {
			const plainPage = await browser.newPage()
			const plain = await plainThumbnail(plainPage, server.url, model)
			await plainPage.close()

			const shownAtCapture: boolean[] = []
			const uploads: Buffer[] = []
			await page.route('**/apps/threedviewer/api/thumbnails/status**', (route) => route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ files: { [MODELS[model].id]: { canEdit: true, hasThumbnail: false, etag: 'v1' } } }),
			}))
			await page.route('**/apps/threedviewer/api/thumbnail/**', async (route) => {
				uploads.push(route.request().postDataBuffer()!)
				// What the viewer shows as the upload arrives, just after the capture
				shownAtCapture.push(await page.evaluate((which) => {
					const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
					const meshes: any[] = []
					viewer.modelRoot.traverse((child: any) => { if (child.isMesh) meshes.push(child) })
					return which === 'wireframe'
						? meshes.every((mesh) => [mesh.material].flat().every((m: any) => m.wireframe))
						: Math.max(...meshes.map((mesh) => mesh.position.length())) > 1
				}, tool))
				return route.fulfill({ status: 201, body: '' })
			})
			await switchOnAtLoad(page, tool)

			const { errors } = await openLoadedViewer(page, server.url, model)
			await expect.poll(() => uploads.length, { timeout: 15000 }).toBe(1)

			// Switched on well inside the half second the capture waits, and on when it ran
			const { loadedAt, switchedAt } = await page.evaluate(() => ({ loadedAt: (window as any).__loadedAt, switchedAt: (window as any).__switchedAt }))
			expect(switchedAt - loadedAt).toBeLessThan(250)
			expect(shownAtCapture).toEqual([true])

			const captured = await coverage(page, uploads[0])
			expect(Math.abs(captured.covered - plain.covered)).toBeLessThanOrEqual(plain.covered * 0.01)
			expect(captured.centreAlpha).toBe(plain.centreAlpha)
			expect(errors).toEqual([])
		})
	}
})
