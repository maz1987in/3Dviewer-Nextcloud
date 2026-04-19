#!/usr/bin/env node
/**
 * One-off end-to-end check against a running Nextcloud dev container.
 *
 * Not part of the Playwright suite — this boots a Chromium browser,
 * logs into http://localhost:8080 as admin/admin, uploads a small
 * fixture via WebDAV, opens the 3D viewer for that file, and verifies
 * the a11y + export regressions from recent commits don't show up in a
 * real Nextcloud session.
 *
 * Usage: `node scripts/live-e2e-check.mjs`
 * Requires: docker compose up -d (container on :8080).
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'
const FIXTURE = path.resolve(process.cwd(), 'tests/fixtures/triangle.gltf')
const REMOTE_NAME = 'e2e-triangle.gltf'

function log(...args) { console.log('[live-e2e]', ...args) }

async function upload() {
	const body = fs.readFileSync(FIXTURE)
	const auth = Buffer.from(`${USER}:${PASS}`).toString('base64')
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${REMOTE_NAME}`, {
		method: 'PUT',
		headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'model/gltf+json' },
		body,
	})
	if (!res.ok && res.status !== 204) {
		throw new Error(`WebDAV upload failed: ${res.status} ${res.statusText}`)
	}
	log(`uploaded ${REMOTE_NAME} (${body.length} bytes)`)
}

async function fileId() {
	// Minimal PROPFIND to read the fileid property of our upload.
	const auth = Buffer.from(`${USER}:${PASS}`).toString('base64')
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${REMOTE_NAME}`, {
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

async function main() {
	await upload()
	const id = await fileId()
	log(`fileId = ${id}`)

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

	const consoleErrors = []
	const ktx2Warnings = []
	page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
	page.on('console', (m) => {
		const text = m.text()
		if (m.type() === 'error') consoleErrors.push(`console.error: ${text}`)
		// KTX2 init complaints — whether logged via logger.warn (shows up as
		// browser 'warning') or console.warn. Either way we want to catch them.
		if (/KTX2.*unavailable|isWebGPURenderer/i.test(text)) {
			ktx2Warnings.push(`${m.type()}: ${text}`)
		}
	})

	// Login
	log('logging in...')
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
	await page.fill('input[name="user"]', USER)
	await page.fill('input[name="password"]', PASS)
	await Promise.all([
		page.waitForLoadState('networkidle'),
		page.click('button[type="submit"]'),
	])

	// Visit viewer route
	log('opening viewer...')
	await page.goto(`${BASE}/apps/threedviewer/f/${id}`, { waitUntil: 'domcontentloaded' })

	// Wait for Vue to mount our teleported skip link into <body>.
	try {
		await page.waitForSelector('.skip-to-viewer', { timeout: 10000 })
	} catch {
		log('skip-to-viewer never appeared in DOM within 10s')
	}

	// Assert: link exists, is a focusable anchor with the right target, and
	// calling .focus() on it actually makes it the activeElement (i.e. nothing
	// is blocking focus via inert / tabindex=-1). We don't assert a specific
	// tab-order position because Nextcloud's app shell controls tab ordering
	// globally and we can't guarantee priority over its chrome.
	const skipCheck = await page.evaluate(() => {
		const el = document.querySelector('.skip-to-viewer')
		if (!el) return { ok: false, reason: 'not in DOM' }
		if (el.getAttribute('href') !== '#viewer-wrapper') return { ok: false, reason: 'wrong href' }
		if (el.tabIndex < 0) return { ok: false, reason: `tabindex ${el.tabIndex}` }
		el.focus()
		return {
			ok: document.activeElement === el,
			reason: document.activeElement === el ? 'focused' : 'focus refused',
			parent: el.parentElement?.tagName,
		}
	})
	log('skip-to-viewer focusable:', skipCheck.ok ? `OK (${skipCheck.reason}, parent=${skipCheck.parent})` : `FAIL (${skipCheck.reason})`)

	// Clicking the link should move focus to #viewer-wrapper.
	await page.evaluate(() => { document.querySelector('.skip-to-viewer')?.click() })
	await page.waitForTimeout(200)
	const activated = await page.evaluate(() => document.activeElement?.id === 'viewer-wrapper')
	log('skip-to-viewer activation moves focus to #viewer-wrapper:', activated ? 'OK' : 'FAIL')

	// Wait for viewer mount (canvas appears).
	log('waiting for canvas...')
	try {
		await page.waitForSelector('canvas', { timeout: 20000 })
	} catch {
		log('canvas did not appear within 20s')
	}
	const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length)
	log('canvas count:', canvasCount)

	// Wait for model-load success flag exposed by our test hook.
	try {
		await page.waitForFunction(() => window.__LOAD_COMPLETE === true, { timeout: 20000 })
		log('__LOAD_COMPLETE: true')
	} catch {
		const err = await page.evaluate(() => window.__LOAD_ERROR || null)
		log('__LOAD_COMPLETE not set, __LOAD_ERROR:', err)
	}

	// Focus-trap smoke on Help panel: open, tab around, escape, check return focus.
	log('testing Help panel focus trap...')
	const helpBtn = page.locator('button[aria-label="Help"]').first()
	if (await helpBtn.count() > 0) {
		await helpBtn.focus()
		await helpBtn.click()
		await page.waitForSelector('.help-panel', { timeout: 5000 })

		// Tab should keep focus inside the panel.
		await page.keyboard.press('Tab')
		await page.keyboard.press('Tab')
		const insidePanel = await page.evaluate(() => {
			const a = document.activeElement
			const panel = document.querySelector('.help-panel')
			return !!(a && panel && panel.contains(a))
		})
		log('focus stays inside help panel after 2× Tab:', insidePanel ? 'OK' : 'FAIL')

		// Esc closes; focus should return to trigger.
		await page.keyboard.press('Escape')
		await page.waitForTimeout(200)
		const returnedToTrigger = await page.evaluate(() => {
			const a = document.activeElement
			return !!(a && a.getAttribute('aria-label') === 'Help')
		})
		log('focus returned to Help trigger on Esc:', returnedToTrigger ? 'OK' : 'FAIL')
	} else {
		log('Help button not found — skipping trap check')
	}

	if (consoleErrors.length > 0) {
		log('console/page errors observed during the run:')
		for (const e of consoleErrors) log('  -', e)
	} else {
		log('no console errors during the run')
	}
	if (ktx2Warnings.length > 0) {
		log('KTX2 / WebGPU complaints during the run:')
		for (const w of ktx2Warnings) log('  -', w)
	} else {
		log('no KTX2 init complaints during the run')
	}

	await browser.close()
	log('done.')
}

main().catch((e) => {
	console.error('[live-e2e] FATAL:', e)
	process.exit(1)
})
