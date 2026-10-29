/**
 * Serve the built app as Nextcloud would, for a spec that opens one model in the viewer.
 *
 * The page is the viewer's mount point with the globals Nextcloud puts on every page, the
 * model is answered on the route the viewer fetches it from, and every other path is a
 * file of the build. A spec says who is looking: a logged-in user (`data-user` on the
 * head, as Nextcloud writes it) or a public-link visitor (the share's initial state).
 */
import type { Page } from '@playwright/test'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export type ViewerModel = { id: number, name: string, body: string | Buffer }
/**
 * `query` is added to the page's own address, as a link's parameters would be; `notes`
 * are the shared notes the server answers with for a logged-in user. The tools panel is
 * opened once the model is in, unless `openPanel` is false: opening it moves the focus.
 *
 * `lite` serves the page a public link to a single file gets, where the light viewer
 * (ViewerComponent) replaces the share page's content instead of the full app mounting.
 *
 * `unit` is the unit saved for the file and `unitCanEdit` whether the user may change it
 * (default: yes when logged in); `unitSaveStatus` makes a save fail with that status, and
 * `unitGate` holds the unit's answer back until it resolves.
 */
export type Viewer = {
	user?: string | null, publicToken?: string | null, dir?: string, query?: string, notes?: object[], openPanel?: boolean, lite?: boolean,
	unit?: string | null, unitCanEdit?: boolean, unitSaveStatus?: number, unitGate?: Promise<void>,
}

const pages = new Map<string, { model: ViewerModel, viewer: Viewer }>()

/**
 * The page for one model, as `GET /?page=<key>` serves it.
 * @param model - the model the page opens
 * @param viewer - who is looking
 */
function html({ model, viewer }: { model: ViewerModel, viewer: Viewer }) {
	const user = viewer.user ? ` data-user="${viewer.user}" data-user-displayname="${viewer.user}"` : ''
	const share = viewer.publicToken
		? `<input type="hidden" id="initial-state-threedviewer-publicShare" value="${Buffer.from(JSON.stringify({ token: viewer.publicToken, fileId: model.id, filename: model.name, ...(viewer.lite ? { isSingleFile: true, mime: 'application/octet-stream' } : {}) })).toString('base64')}">`
		: ''
	return `<!doctype html><html><head${user}><meta charset="utf-8"><title>Viewer</title>
	<meta name="requesttoken" content="test-token">
	<link rel="stylesheet" href="/css/threedviewer-main.css">
	<style>html, body { margin: 0; height: 100%; } #threedviewer { height: 100vh; }</style>
	</head><body>
	${share}
	${viewer.lite
		? '<div id="content" style="height: 100vh"></div>'
		: `<div id="threedviewer" data-file-id="${model.id}" data-filename="${model.name}" data-dir="${viewer.dir ?? '/models'}"></div>`}
	<script>
		window.t = function (_app, s, vars) { if (vars) { for (const k in vars) s = s.replace('{' + k + '}', vars[k]) } return s }
		window.n = function (_app, s, p, n) { return (n === 1 ? s : p).replace('%n', n) }
		window.OC = { config: { version: 'test' }, webroot: '', requestToken: 'test-token', filePath: function (_app, type, file) { return '/' + (type ? type + '/' : '') + file } }
		window.OCA = {}
		window.OCP = {}
		window._oc_config = { session_lifetime: 0 }
	</script>
	<script type="module" src="/js/threedviewer-main.mjs"></script>
	</body></html>`
}

/**
 * Start a server for the build.
 */
export function startServer(): Promise<{ url: string, close: () => Promise<void> }> {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const requestUrl = new URL(req.url || '/', 'http://x')
			if (requestUrl.pathname === '/') {
				const entry = pages.get(requestUrl.searchParams.get('page') || '')
				res.writeHead(entry ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' })
				res.end(entry ? html(entry) : '')
				return
			}
			const filePath = path.join(PROJECT_ROOT, requestUrl.pathname.replace(/^\//, ''))
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

/**
 * Open a model in the viewer and wait until it has loaded and the tools panel is open.
 * @param page - the page
 * @param url - the server's URL
 * @param model - the model to open
 * @param viewer - who is looking (default: the logged-in user alice)
 */
export async function openViewer(page: Page, url: string, model: ViewerModel, viewer: Viewer = { user: 'alice' }) {
	const errors: string[] = []
	page.on('pageerror', (err) => errors.push(err.message))
	const key = `${model.id}-${viewer.user ?? 'anon'}-${viewer.publicToken ?? ''}`
	pages.set(key, { model, viewer })

	const fileRoute = viewer.publicToken
		? `**/apps/threedviewer/public/file/${viewer.publicToken}/${model.id}*`
		: `**/apps/threedviewer/api/file/${model.id}*`
	await page.route(fileRoute, (route) => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: model.body }))
	// Unanswered, the viewer would report its shared notes as not loaded
	await page.route(/\/(api|public)\/notes\//, (route) => route.fulfill({
		status: 200,
		contentType: 'application/json',
		body: JSON.stringify(viewer.publicToken ? { ocs: { data: { canEdit: false, notes: [] } } } : { canEdit: true, notes: viewer.notes ?? [], private: [] }),
	}))

	// The file's saved unit; every save is recorded in `unitPuts`
	const unitPuts: object[] = []
	let savedUnit = viewer.unit ?? null
	await page.route(/\/(api|public)\/file-settings\//, async (route) => {
		const request = route.request()
		if (request.method() === 'GET' && viewer.unitGate) {
			await viewer.unitGate
		}
		const canEdit = !viewer.publicToken && (viewer.unitCanEdit ?? true)
		if (request.method() === 'PUT') {
			const body = request.postDataJSON()
			unitPuts.push(body)
			if (viewer.unitSaveStatus) {
				return route.fulfill({ status: viewer.unitSaveStatus, contentType: 'application/json', body: '{"error":"Failed"}' })
			}
			savedUnit = body.unit
		}
		return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canEdit, unit: savedUnit }) })
	})

	await page.goto(`${url}?page=${encodeURIComponent(key)}${viewer.query ? `&${viewer.query}` : ''}`)
	if (viewer.lite) {
		// The light viewer shows its own buttons once the model is in
		await page.waitForSelector('.viewer-bottom-actions', { timeout: 30000 })
		return { errors, unitPuts }
	}
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	if (viewer.openPanel !== false) {
		await page.click('[aria-label="Toggle tools panel"]')
		await page.waitForSelector('.slide-out-panel', { timeout: 5000 })
	}
	return { errors, unitPuts }
}

/**
 * An ASCII STL cube, `size` mm on a side: an STL carries no unit and is read as millimetres.
 * @param size - the edge length
 */
export function stlCube(size: number): string {
	const corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
	const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
	const facets = quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]).map((triangle) => [
		'facet normal 0 0 0', 'outer loop',
		...triangle.map((i) => `vertex ${corners[i].map((v) => v * size).join(' ')}`),
		'endloop', 'endfacet',
	].join('\n'))
	return ['solid cube', ...facets, 'endsolid cube'].join('\n')
}
