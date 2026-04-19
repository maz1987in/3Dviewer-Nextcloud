#!/usr/bin/env node
/**
 * Live multi-format loader check against the Nextcloud dev container.
 *
 * For each fixture we upload to WebDAV, open the standalone viewer page
 * (/apps/threedviewer/f/{id}), and record whether the loader reached
 * `window.__LOAD_COMPLETE` or set `window.__LOAD_ERROR`. Also captures
 * console errors and whether the WASM decoder assets actually served
 * (200 vs 404) when applicable.
 *
 * Usage: `node scripts/live-multi-format.mjs [format]`
 *   format: optional single-format filter (e.g. `off`, `bim`)
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'

// Formats we have fixtures for. The WASM-dependent formats without
// fixtures are intentionally omitted — verifying their chunk/WASM asset
// availability happens in probeAssets().
const FIXTURES = [
	{ ext: 'off', file: 'tests/fixtures/tetrahedron.off', mime: 'model/off' },
	{ ext: 'bim', file: 'tests/fixtures/quad.bim', mime: 'application/dotbim+json' },
]

const WASM_PROBES = [
	'/apps/threedviewer/rhino3dm/rhino3dm.wasm',
	'/apps/threedviewer/web-ifc/web-ifc.wasm',
	'/apps/threedviewer/occt/occt-import-js.wasm',
]

function log(...args) { console.log('[live-multi]', ...args) }

async function uploadFixture(fixture) {
	const body = fs.readFileSync(path.resolve(process.cwd(), fixture.file))
	const remote = `e2e-${path.basename(fixture.file)}`
	const auth = Buffer.from(`${USER}:${PASS}`).toString('base64')
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${remote}`, {
		method: 'PUT',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': fixture.mime },
		body,
	})
	if (!res.ok && res.status !== 204) {
		throw new Error(`WebDAV upload (${remote}) failed: ${res.status} ${res.statusText}`)
	}
	return remote
}

async function fileId(remoteName) {
	const auth = Buffer.from(`${USER}:${PASS}`).toString('base64')
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${remoteName}`, {
		method: 'PROPFIND',
		headers: {
			Authorization: `Basic ${auth}`,
			Depth: '0',
			'Content-Type': 'application/xml',
		},
		body: `<?xml version="1.0"?>
			<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
				<d:prop><oc:fileid/></d:prop>
			</d:propfind>`,
	})
	const xml = await res.text()
	const m = xml.match(/<oc:fileid>(\d+)<\/oc:fileid>/)
	if (!m) throw new Error(`Could not parse fileid from PROPFIND:\n${xml}`)
	return Number(m[1])
}

async function probeAssets() {
	log('probing WASM decoder assets...')
	for (const url of WASM_PROBES) {
		const res = await fetch(`${BASE}${url}`, { method: 'HEAD' })
		log(`  ${url}: ${res.status}`)
	}
}

async function testFormat(page, fixture) {
	const remoteName = await uploadFixture(fixture)
	const id = await fileId(remoteName)
	log(`[${fixture.ext}] uploaded "${remoteName}" as fileId=${id}`)

	// Reset test hooks on the page before each navigation.
	await page.goto(`${BASE}/apps/threedviewer/f/${id}`, { waitUntil: 'domcontentloaded' })

	let result = 'timeout'
	let error = null
	try {
		await page.waitForFunction(() => {
			return window.__LOAD_COMPLETE === true || window.__LOAD_ERROR !== undefined
		}, { timeout: 20000 })
		const state = await page.evaluate(() => ({
			complete: window.__LOAD_COMPLETE,
			error: window.__LOAD_ERROR,
		}))
		if (state.complete) {
			result = 'ok'
		} else {
			result = 'error'
			error = state.error
		}
	} catch {
		// Timed out — no success, no error. Canvas may still be present though.
		const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
		error = `timeout (canvas count: ${canvasCount})`
	}

	// Also grab mesh count from the scene if load succeeded.
	let sceneInfo = null
	if (result === 'ok') {
		sceneInfo = await page.evaluate(() => {
			const viewer = window.__THREEDVIEWER_SCENE || null
			if (!viewer) return 'scene probe unavailable'
			let meshes = 0
			viewer.traverse(o => { if (o.isMesh) meshes++ })
			return { meshes }
		})
	}

	return { fixture: fixture.ext, result, error, sceneInfo }
}

async function main() {
	const filter = process.argv[2]
	const fixtures = filter ? FIXTURES.filter(f => f.ext === filter) : FIXTURES

	await probeAssets()

	const browser = await chromium.launch({
		headless: true,
		args: [
			'--use-gl=angle',
			'--use-angle=swiftshader',
			'--enable-unsafe-swiftshader',
			'--ignore-gpu-blocklist',
		],
	})
	const context = await browser.newContext({ ignoreHTTPSErrors: true })
	const page = await context.newPage()

	const pageErrors = []
	const consoleErrors = []
	page.on('pageerror', (e) => pageErrors.push(e.message))
	page.on('console', (m) => {
		if (m.type() === 'error') consoleErrors.push(m.text())
	})

	// Login once.
	log('logging in...')
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
	await page.fill('input[name="user"]', USER)
	await page.fill('input[name="password"]', PASS)
	await Promise.all([
		page.waitForLoadState('networkidle'),
		page.click('button[type="submit"]'),
	])

	const results = []
	for (const fixture of fixtures) {
		try {
			const r = await testFormat(page, fixture)
			results.push(r)
			log(`[${r.fixture}] result=${r.result}${r.error ? ` error=${r.error}` : ''}${r.sceneInfo ? ` scene=${JSON.stringify(r.sceneInfo)}` : ''}`)
		} catch (e) {
			results.push({ fixture: fixture.ext, result: 'exception', error: e.message })
			log(`[${fixture.ext}] exception: ${e.message}`)
		}
	}

	await browser.close()

	// Summary
	log('--- summary ---')
	const ok = results.filter(r => r.result === 'ok').length
	const failed = results.length - ok
	for (const r of results) {
		log(`  ${r.fixture.padEnd(6)} ${r.result}${r.error ? ` (${r.error})` : ''}`)
	}
	log(`--- total: ${ok}/${results.length} OK${failed > 0 ? `, ${failed} failed` : ''} ---`)

	if (pageErrors.length > 0) {
		log(`--- pageerrors (${pageErrors.length}) ---`)
		pageErrors.slice(0, 5).forEach(e => log(`  ${e}`))
	}
	if (consoleErrors.length > 0) {
		log(`--- console.errors (${consoleErrors.length}, first 5) ---`)
		consoleErrors.slice(0, 5).forEach(e => log(`  ${e}`))
	}

	process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
	console.error('[live-multi] fatal:', e)
	process.exit(1)
})
