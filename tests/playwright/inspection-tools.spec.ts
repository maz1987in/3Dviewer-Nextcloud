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

async function openLoadedViewer(page: Page, url: string, model: Model = 'gcode') {
	const { id, body } = MODELS[model]
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	// Without Nextcloud's page globals, generateUrl puts the file URL on a host that does
	// not resolve (http://index.php/…); answering it here serves it wherever it points.
	await page.route(`**/apps/threedviewer/api/file/${id}`, (route) => route.fulfill({
		status: 200,
		contentType: 'application/octet-stream',
		body,
	}))
	await page.goto(`${url}?model=${model}`)
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	await page.click('[aria-label="Toggle tools panel"]')
	await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
	return errors
}

test.describe('Inspection tools', () => {
	let server: { url: string, close: () => Promise<void> }
	test.beforeAll(async () => { server = await startServer() })
	test.afterAll(async () => { await server.close() })

	test('the G-code layer slider steps through the print', async ({ page }) => {
		const errors = await openLoadedViewer(page, server.url)
		const panel = page.locator('.gcode-layers')
		await expect(panel).toContainText('Layer 3 of 3')
		await expect(panel).toContainText('Z 0.60')

		await panel.locator('input[type="range"]').fill('1')
		await expect(panel).toContainText('Layer 1 of 3')
		await expect(panel).toContainText('Z 0.20')

		await panel.getByText('Only this layer').click()
		await expect(panel.locator('.toggle-switch')).toHaveClass(/on/)
		expect(errors).toEqual([])
	})

	test('shading switches mode and back', async ({ page }) => {
		const errors = await openLoadedViewer(page, server.url)
		const button = (name: string) => page.locator('.preset-btn', { hasText: new RegExp(`^\\s*${name}\\s*$`) })

		await expect(button('Standard')).toHaveAttribute('aria-pressed', 'true')
		for (const mode of ['Clay', 'Normals', 'X-ray', 'Standard']) {
			await button(mode).click()
			await expect(button(mode)).toHaveAttribute('aria-pressed', 'true')
		}
		expect(errors).toEqual([])
	})

	test('the measurement panel switches to angles', async ({ page }) => {
		const errors = await openLoadedViewer(page, server.url)
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
		}],
	] as const) {
		test(`exports the model as ${format}`, async ({ page }) => {
			const errors = await openLoadedViewer(page, server.url, 'cube')
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

	test('says why a toolpath cannot be exported as 3MF, instead of saving an empty file', async ({ page }) => {
		let downloaded = false
		page.on('download', () => { downloaded = true })
		await openLoadedViewer(page, server.url)
		await page.locator('.slide-out-panel').getByText('Export', { exact: true }).first().click()
		await page.selectOption('.export-select', '3mf')
		await expect(page.locator('.toast.error')).toContainText('no triangle meshes')
		expect(downloaded).toBe(false)
	})
})
