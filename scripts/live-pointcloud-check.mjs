#!/usr/bin/env node
/**
 * Scans against a running Nextcloud, in Chromium: each scan format is uploaded, opened in
 * the full viewer and checked to be a cloud of the points its fixture holds, with no page
 * errors; "Which way is up" is saved through the real route and read back; and one scan
 * is opened through a public link, in the light viewer.
 *
 * Usage:
 *   TDV_BASE=http://localhost:8089 TDV_USER=someone TDV_PASSWORD=... node scripts/live-pointcloud-check.mjs
 * The password is never printed. Exits non-zero on any failure, and cleans up after itself.
 */
import { chromium } from '@playwright/test'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

const BASE = (process.env.TDV_BASE || '').replace(/\/$/, '')
const USER = process.env.TDV_USER || ''
const PASSWORD = process.env.TDV_PASSWORD || ''
const FOLDER = `tdv-scan-check-${Date.now()}`
const FIXTURES = path.resolve('tests/fixtures/pointclouds')

/** Each scan format, and the points its fixture holds. */
const SCANS = [
	{ file: 'cube-rgb.xyz', points: 1000 },
	{ file: 'cube-compressed.pcd', points: 1000 },
	{ file: 'points-rgb.ply', points: 1000 },
	{ file: 'utm-1.2.las', points: 1000 },
	{ file: 'simple.laz', points: 1065 },
	{ file: 'tinyCartesianFloatRgb.e57', points: 2090 },
]

if (!BASE || !USER || !PASSWORD) {
	console.error('Set TDV_BASE, TDV_USER and TDV_PASSWORD')
	process.exit(2)
}

// eslint-disable-next-line no-console -- a script's report
const log = (...args) => console.log('[live-scans]', ...args)
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}` }
const dav = (name = '') => `${BASE}/remote.php/dav/files/${encodeURIComponent(USER)}/${FOLDER}${name ? `/${name}` : ''}`

async function request(url, options = {}) {
	const response = await fetch(url, { ...options, headers: { ...auth, ...options.headers } })
	if (!response.ok) {
		throw new Error(`${options.method || 'GET'} ${url.replace(BASE, '')}: ${response.status}`)
	}
	return response
}

async function fileId(name) {
	const response = await request(dav(name), {
		method: 'PROPFIND',
		headers: { Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	return Number(/<oc:fileid>(\d+)<\/oc:fileid>/.exec(await response.text())[1])
}

/** What the full viewer holds once the model is in. */
const fullViewerScan = () => {
	const viewer = window.__THREEDVIEWER_APP?.$.subTree.component.proxy.$refs.viewer
	const root = viewer?.modelRoot
	return { points: Boolean(root?.isPoints), count: root?.userData?.tdvPointCloud?.count ?? null, error: window.__LOAD_ERROR ?? null }
}

let share = null
let ok = true
const fail = (message) => {
	ok = false
	console.error(`[live-scans] FAIL ${message}`)
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
	await request(dav(), { method: 'MKCOL' })
	const ids = {}
	for (const { file } of SCANS) {
		await request(dav(file), { method: 'PUT', body: fs.readFileSync(path.join(FIXTURES, file)) })
		ids[file] = await fileId(file)
	}
	log(`uploaded ${SCANS.length} scans to /${FOLDER}`)

	const page = await browser.newPage()
	const errors = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto(`${BASE}/login`)
	await page.fill('input[name="user"]', USER)
	await page.fill('input[name="password"]', PASSWORD)
	await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/login')), page.click('button[type="submit"]')])

	for (const { file, points } of SCANS) {
		errors.length = 0
		await page.goto(`${BASE}/index.php/apps/threedviewer/f/${ids[file]}`)
		await page.waitForFunction(() => window.__LOAD_COMPLETE === true || window.__LOAD_ERROR !== undefined, null, { timeout: 60000 }).catch(() => {})
		const scan = await page.evaluate(fullViewerScan)
		if (!scan.points || scan.count !== points || scan.error || errors.length) {
			fail(`${file}: ${JSON.stringify({ ...scan, errors })}`)
		} else {
			log(`${file}: ${scan.count} points, no errors`)
		}
	}

	// Which way is up, through the route the viewer saves it with
	const las = ids['utm-1.2.las']
	const saved = await page.evaluate(async ({ base, id }) => {
		const response = await fetch(`${base}/index.php/apps/threedviewer/api/file-settings/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', requesttoken: window.OC.requestToken },
			body: JSON.stringify({ up: '-z' }),
		})
		return response.status
	}, { base: BASE, id: las })
	// Read back as a client does, outside the page: Basic auth needs the OCS-APIRequest header past the CSRF check
	const read = await (await request(`${BASE}/index.php/apps/threedviewer/api/file-settings/${las}`, { headers: { 'OCS-APIRequest': 'true' } })).json()
	if (saved !== 200 || read.up !== '-z') {
		fail(`which way is up: saved ${saved}, read ${JSON.stringify(read)}`)
	} else {
		log('which way is up: saved and read back')
	}

	// One scan through a public link, in the light viewer
	const created = await request(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
		method: 'POST',
		headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ path: `/${FOLDER}/utm-1.2.las`, shareType: 3 }),
	})
	share = (await created.json()).ocs.data
	const visitor = await browser.newPage()
	const visitorErrors = []
	visitor.on('pageerror', (error) => visitorErrors.push(error.message))
	await visitor.goto(`${BASE}/index.php/s/${share.token}`)
	// On Nextcloud 35 the share page opens the file in the Viewer app, which mounts the
	// light viewer itself; on older ones the app mounts it at #threedviewer-public. Either
	// way it is the component holding a scene, found from the Vue apps on the page.
	const lightViewerScan = () => {
		const find = (vnode) => {
			if (!vnode || typeof vnode !== 'object') return null
			if (vnode.component) {
				if (vnode.component.proxy?.scene?.traverse) return vnode.component.proxy
				const below = find(vnode.component.subTree)
				if (below) return below
			}
			for (const child of Array.isArray(vnode.children) ? vnode.children : []) {
				const found = find(child)
				if (found) return found
			}
			return null
		}
		let viewer = null
		for (const element of document.querySelectorAll('*')) {
			viewer = viewer ?? (element._vnode ? find(element._vnode) : null)
		}
		let found = null
		viewer?.scene?.traverse((child) => { if (child.isPoints) found = { count: child.userData.tdvPointCloud.count, rotationX: child.rotation.x } })
		return found
	}
	// The saved up arrives after the scan is shown: wait for the turn. Polled from here, as
	// the page's policy forbids the eval a waitForFunction string would need
	let turned = null
	for (let tries = 0; tries < 120; tries++) {
		turned = await visitor.evaluate(lightViewerScan)
		if (turned && Math.abs(turned.rotationX - Math.PI / 2) < 1e-6) {
			break
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	if (!turned || turned.count !== 1000 || Math.abs(turned.rotationX - Math.PI / 2) > 1e-6 || visitorErrors.length) {
		const page = await visitor.evaluate(() => ({
			hosts: [...document.querySelectorAll('[id*="threedviewer"]')].map((e) => e.id),
			canvases: document.querySelectorAll('canvas').length,
			text: document.body.innerText.slice(0, 200),
		}))
		fail(`public link: ${JSON.stringify({ turned, visitorErrors, page })}`)
	} else {
		log('public link: the scan shows, turned the way the file says')
	}
} catch (error) {
	fail(error.message)
} finally {
	await browser.close()
	if (share) {
		await request(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares/${share.id}`, { method: 'DELETE', headers: { 'OCS-APIRequest': 'true' } }).catch(() => {})
	}
	await request(dav(), { method: 'DELETE' }).catch(() => {})
}

log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
