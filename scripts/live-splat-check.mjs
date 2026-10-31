#!/usr/bin/env node
/**
 * Gaussian splats against a running Nextcloud, in Chromium: each splat fixture is
 * uploaded, opened in the full viewer and checked to hold the splats it should, with no
 * page errors and nothing refused by the Content Security Policy (Spark starts its
 * workers from blob: URLs); "Which way is up" is saved through the real route and read
 * back; and one splat is opened through a public link, in the light viewer, turned the
 * way the file says.
 *
 * Usage:
 *   TDV_BASE=http://localhost:8089 TDV_USER=someone TDV_PASSWORD=... node scripts/live-splat-check.mjs
 * The password is never printed. Exits non-zero on any failure, and cleans up after itself.
 */
import { chromium } from '@playwright/test'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

const BASE = (process.env.TDV_BASE || '').replace(/\/$/, '')
const USER = process.env.TDV_USER || ''
const PASSWORD = process.env.TDV_PASSWORD || ''
const FOLDER = `tdv-splat-check-${Date.now()}`
const FIXTURES = path.resolve('tests/fixtures/splats')

/** Each splat fixture; every one is the same grid of 1000. */
const SPLATS = ['grid.splat', 'grid.spz', 'grid.ply', 'grid-sh3.ply']
const COUNT = 1000

if (!BASE || !USER || !PASSWORD) {
	console.error('Set TDV_BASE, TDV_USER and TDV_PASSWORD')
	process.exit(2)
}

// eslint-disable-next-line no-console -- a script's report
const log = (...args) => console.log('[live-splats]', ...args)
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
const fullViewerSplat = () => {
	const viewer = window.__THREEDVIEWER_APP?.$.subTree.component.proxy.$refs.viewer
	const root = viewer?.modelRoot
	return {
		count: root?.userData?.tdvSplat?.count ?? null,
		spark: Boolean(viewer?.scene?.getObjectByName('tdv-spark')),
		error: window.__LOAD_ERROR ?? null,
	}
}

/** Watch a page for errors, and for anything the Content Security Policy refused. */
const watch = (page) => {
	const problems = []
	page.on('pageerror', (error) => problems.push(error.message))
	page.on('console', (message) => {
		if (message.text().includes('Content Security Policy')) {
			problems.push(message.text())
		}
	})
	return problems
}

let share = null
let ok = true
const fail = (message) => {
	ok = false
	console.error(`[live-splats] FAIL ${message}`)
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
	await request(dav(), { method: 'MKCOL' })
	const ids = {}
	for (const file of SPLATS) {
		await request(dav(file), { method: 'PUT', body: fs.readFileSync(path.join(FIXTURES, file)) })
		ids[file] = await fileId(file)
	}
	log(`uploaded ${SPLATS.length} splats to /${FOLDER}`)

	const page = await browser.newPage()
	const problems = watch(page)
	await page.goto(`${BASE}/login`)
	await page.fill('input[name="user"]', USER)
	await page.fill('input[name="password"]', PASSWORD)
	await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/login')), page.click('button[type="submit"]')])

	for (const file of SPLATS) {
		problems.length = 0
		await page.goto(`${BASE}/index.php/apps/threedviewer/f/${ids[file]}`)
		await page.waitForFunction(() => window.__LOAD_COMPLETE === true || window.__LOAD_ERROR !== undefined, null, { timeout: 60000 }).catch(() => {})
		// Spark's workers start as the splat is first drawn: give them a moment to be refused
		await page.waitForTimeout(1500)
		const splat = await page.evaluate(fullViewerSplat)
		if (splat.count !== COUNT || !splat.spark || splat.error || problems.length) {
			fail(`${file}: ${JSON.stringify({ ...splat, problems })}`)
		} else {
			log(`${file}: ${splat.count} splats, no errors`)
		}
	}

	// Which way is up, through the route the viewer saves it with
	const turned = ids['grid.splat']
	const saved = await page.evaluate(async ({ base, id }) => {
		const response = await fetch(`${base}/index.php/apps/threedviewer/api/file-settings/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', requesttoken: window.OC.requestToken },
			body: JSON.stringify({ up: '-y' }),
		})
		return response.status
	}, { base: BASE, id: turned })
	// Read back as a client does, outside the page: Basic auth needs the OCS-APIRequest header past the CSRF check
	const read = await (await request(`${BASE}/index.php/apps/threedviewer/api/file-settings/${turned}`, { headers: { 'OCS-APIRequest': 'true' } })).json()
	if (saved !== 200 || read.up !== '-y') {
		fail(`which way is up: saved ${saved}, read ${JSON.stringify(read)}`)
	} else {
		log('which way is up: saved and read back')
	}

	// One splat through a public link, in the light viewer
	const created = await request(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
		method: 'POST',
		headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ path: `/${FOLDER}/grid.splat`, shareType: 3 }),
	})
	share = (await created.json()).ocs.data
	const visitor = await browser.newPage()
	const visitorProblems = watch(visitor)
	await visitor.goto(`${BASE}/index.php/s/${share.token}`)
	// The component holding a scene, found from the Vue apps on the page, as in
	// live-pointcloud-check.mjs; polled from here, as the page's policy forbids eval
	const lightViewerSplat = () => {
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
		viewer?.scene?.traverse((child) => { if (child.userData?.tdvSplat) found = { count: child.userData.tdvSplat.count, rotationX: child.rotation.x } })
		return found && { ...found, spark: Boolean(viewer.scene.getObjectByName('tdv-spark')) }
	}
	let shown = null
	for (let tries = 0; tries < 120; tries++) {
		shown = await visitor.evaluate(lightViewerSplat)
		if (shown && Math.abs(shown.rotationX - Math.PI) < 1e-6) {
			break
		}
		await new Promise((resolve) => setTimeout(resolve, 500))
	}
	if (!shown || shown.count !== COUNT || !shown.spark || Math.abs(shown.rotationX - Math.PI) > 1e-6 || visitorProblems.length) {
		fail(`public link: ${JSON.stringify({ shown, visitorProblems })}`)
	} else {
		log('public link: the splat shows, turned the way the file says')
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
