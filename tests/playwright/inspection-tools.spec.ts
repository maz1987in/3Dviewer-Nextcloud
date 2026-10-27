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

const MODELS = {
	gcode: { id: 4242, name: 'print.gcode', body: GCODE },
	cube: { id: 4343, name: 'cube.obj', body: CUBE_OBJ },
	// A second cube, opened after the first in the same viewer
	cube2: { id: 4444, name: 'cube2.obj', body: CUBE_OBJ },
	// A glTF, which is in metres: a triangle 1 m on a side
	gltf: { id: 4545, name: 'triangle.gltf', body: fs.readFileSync(path.join(PROJECT_ROOT, 'tests/fixtures/triangle.gltf'), 'utf8') },
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
	<div id="threedviewer" data-file-id="${model.id}" data-filename="${model.name}" data-dir="/"></div>
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

test.describe('Inspection tools', () => {
	let server: { url: string, close: () => Promise<void> }
	test.beforeAll(async () => { server = await startServer() })
	test.afterAll(async () => { await server.close() })

	test('the G-code layer slider steps through the print', async ({ page }) => {
		const { errors } = await openLoadedViewer(page, server.url)
		const panel = page.locator('.gcode-layers')
		await expect(panel).toContainText('Layer 3 of 3')
		await expect(panel).toContainText('Z 0.60')

		await panel.locator('input[type="range"]').fill('1')
		await expect(panel).toContainText('Layer 1 of 3')
		await expect(panel).toContainText('Z 0.20')

		const slider = panel.getByRole('slider')
		await expect(slider).toHaveAttribute('aria-valuetext', 'Layer 1 of 3, Z 0.20')

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
				page.selectOption('.export-select', format),
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
				page.selectOption('.export-select', format),
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
		await page.selectOption('.export-select', '3mf')
		await expect(page.getByLabel('Export Failed')).toContainText('This model has no surfaces to save as 3MF.')
		expect(downloaded).toBe(false)
	})

	test('an angle taken with three clicks is saved as a shared angle note', async ({ page }) => {
		const { errors, writes } = await openLoadedViewer(page, server.url, 'cube')
		await page.locator('.slide-out-panel').getByText('Measurement', { exact: true }).click()
		const overlay = page.locator('.measurement-overlay')
		await overlay.getByRole('button', { name: 'Angle' }).click()

		// Three points on the cube's front, below the measurement panel and left of the
		// tools panel at this viewport
		for (const [x, y] of [[720, 340], [780, 370], [740, 400]]) {
			await page.mouse.click(x, y)
		}

		await expect(overlay.locator('.measurement-item')).toHaveCount(1)
		await expect(overlay.locator('.measurement-item')).toContainText('Angle 1')
		await expect(overlay.locator('.measurement-distance')).toContainText('°')
		await expect.poll(() => writes.length).toBe(1)
		expect(writes[0].method).toBe('POST')
		expect(writes[0].body.type).toBe('angle')
		expect(writes[0].body.payload.space).toBe('model')
		expect(writes[0].body.payload.points).toHaveLength(3)
		await expect(overlay).toContainText('Alice')
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
})
