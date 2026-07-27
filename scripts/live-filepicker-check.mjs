#!/usr/bin/env node
/**
 * Live check for the `webdav > minimatch@^10` override.
 *
 * The override swaps the minimatch (and therefore brace-expansion) that
 * `webdav` resolves. `webdav` is only reachable in the browser through
 * @nextcloud/dialogs' FilePicker, which this app opens from the toolbar's
 * "Compare models" button — a lazily-loaded chunk that no other check
 * touches. If the dependency swap broke the WebDAV client, the picker
 * would fail to list files.
 *
 * Usage: `node scripts/live-filepicker-check.mjs`
 * Requires: the dev container on :8080 and a current `npm run build`.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'
const AUTH = Buffer.from(`${USER}:${PASS}`).toString('base64')

const MAIN = { fixture: 'tests/fixtures/triangle.gltf', remote: 'fp-main.gltf', mime: 'model/gltf+json' }
const PEER = { fixture: 'tests/fixtures/triangle.gltf', remote: 'fp-compare.gltf', mime: 'model/gltf+json' }

const results = []
function check(name, ok, detail = '') {
	results.push({ name, ok })
	console.log(`[filepicker] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function log(...args) { console.log('[filepicker]', ...args) }

async function upload({ fixture, remote, mime }) {
	const body = fs.readFileSync(path.resolve(process.cwd(), fixture))
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${remote}`, {
		method: 'PUT',
		headers: { Authorization: `Basic ${AUTH}`, 'Content-Type': mime },
		body,
	})
	if (!res.ok && res.status !== 204) throw new Error(`upload ${remote}: ${res.status}`)
	return body.length
}

async function fileId(remote) {
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${remote}`, {
		method: 'PROPFIND',
		headers: { Authorization: `Basic ${AUTH}`, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	const xml = await res.text()
	const m = xml.match(/<oc:fileid>(\d+)<\/oc:fileid>/)
	if (!m) throw new Error(`no fileid for ${remote}`)
	return Number(m[1])
}

async function main() {
	log(`uploaded ${MAIN.remote} (${await upload(MAIN)} B), ${PEER.remote} (${await upload(PEER)} B)`)
	const id = await fileId(MAIN.remote)
	log(`main fileId = ${id}`)

	const browser = await chromium.launch({
		headless: true,
		args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
	})
	const page = await (await browser.newContext()).newPage()

	const errors = []
	const chunkRequests = []
	const failedRequests = []
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
	page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`) })
	page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().replace(BASE, '')}`) })
	page.on('response', (r) => {
		if (/FilePicker.*\.chunk\.mjs$/.test(r.url())) chunkRequests.push({ url: r.url().split('/').pop(), status: r.status() })
	})
	// The picker's own directory listing is a PROPFIND through the bundled
	// webdav client — the exact code path the override changes.
	const propfinds = []
	page.on('response', (r) => {
		if (r.request().method() === 'PROPFIND' && /\/remote\.php\/dav\//.test(r.url())) {
			propfinds.push({ url: r.url().replace(BASE, ''), status: r.status() })
		}
	})

	log('logging in...')
	await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
	await page.fill('input[name="user"]', USER)
	await page.fill('input[name="password"]', PASS)
	await Promise.all([page.waitForLoadState('networkidle'), page.click('button[type="submit"]')])

	log('opening viewer...')
	await page.goto(`${BASE}/apps/threedviewer/f/${id}`, { waitUntil: 'domcontentloaded' })
	await page.waitForSelector('canvas', { timeout: 20000 })
	try {
		await page.waitForFunction(() => window.__LOAD_COMPLETE === true, { timeout: 20000 })
		check('main model renders', true)
	} catch {
		check('main model renders', false, await page.evaluate(() => window.__LOAD_ERROR || 'no flag'))
	}

	// Comparison lives in the slide-out tools panel, not the always-visible
	// overlay controls, so the panel has to be opened first.
	log('opening tools panel...')
	const toolsToggle = page.locator('button[aria-label="Toggle tools panel"]').first()
	check('tools panel toggle present', await toolsToggle.count() > 0)
	await toolsToggle.click()
	await page.waitForTimeout(600)

	log('clicking "Comparison"...')
	const compare = page.locator('button.tool-btn', { hasText: 'Comparison' }).first()
	if (await compare.count() === 0) {
		check('comparison button present', false)
	} else {
		check('comparison button present', true)
		await compare.click()

		// The picker is a lazily-loaded chunk; give it time to fetch and mount.
		let picked = false
		try {
			await page.waitForSelector('.file-picker, [class*="file-picker"], dialog[open]', { timeout: 20000 })
			picked = true
		} catch { /* asserted below */ }
		check('file picker dialog opens', picked)

		if (picked) {
			await page.waitForTimeout(2500) // let the directory listing settle
			const listing = await page.evaluate(() => {
				const root = document.querySelector('.file-picker') || document.querySelector('[class*="file-picker"]')
				if (!root) return { rows: 0, names: [], html: '' }
				const cells = [...root.querySelectorAll('tr, [role="row"], .file-picker__file-name, [data-filename]')]
				const names = cells.map((c) => (c.getAttribute?.('data-filename') || c.textContent || '').trim())
					.filter((n) => n && n.length < 120)
				return { rows: cells.length, names: [...new Set(names)].slice(0, 15) }
			})
			log('picker listing rows:', listing.rows)
			log('picker listing names:', JSON.stringify(listing.names))
			check('picker lists files over webdav', listing.rows > 0 && listing.names.length > 0,
				`${listing.rows} rows`)
			check('picker listing includes the uploaded model',
				listing.names.some((n) => n.includes('fp-compare') || n.includes('fp-main')),
				JSON.stringify(listing.names.filter((n) => n.includes('fp-'))))

			// Selecting through the picker returns a Node built by @nextcloud/files
			// from the webdav response — the other half of the changed path.
			log(`selecting ${PEER.remote}...`)
			const row = page.locator(`tr:has-text("${PEER.remote}"), [data-filename="${PEER.remote}"]`).first()
			if (await row.count() > 0) {
				await row.click()
				await page.waitForTimeout(400)
				const confirm = page.locator('button:has-text("Select")').last()
				if (await confirm.count() > 0) await confirm.click()
				// `.comparison-controls` renders under `isComparisonMode &&
				// hasComparisonModel`, so its presence means the picked file was
				// fetched and parsed into a scene — not merely that the mode toggled.
				try {
					await page.waitForSelector('.comparison-controls', { timeout: 20000 })
					check('comparison model loads after picking', true)
				} catch {
					check('comparison model loads after picking', false, 'no .comparison-controls within 20s')
				}
			} else {
				check('comparison model loads after picking', false, 'row not clickable')
			}
		}
	}

	check('FilePicker chunk served', chunkRequests.length > 0 && chunkRequests.every((c) => c.status === 200),
		JSON.stringify(chunkRequests))
	check('webdav PROPFIND succeeded from the browser',
		propfinds.length > 0 && propfinds.every((p) => p.status >= 200 && p.status < 300),
		JSON.stringify(propfinds.slice(0, 4)))

	const depErrors = errors.filter((e) => /expand|minimatch|brace|is not a function|undefined is not/i.test(e))
	check('no dependency-shaped errors', depErrors.length === 0, depErrors.join(' | '))

	if (errors.length) {
		log('all console/page errors observed:')
		for (const e of errors) log('  -', e)
		log('requests that failed:', failedRequests.length ? failedRequests.join(', ') : '(none)')
	} else {
		log('no console errors during the run')
	}

	await browser.close()

	const failed = results.filter((r) => !r.ok)
	log(`${results.length - failed.length}/${results.length} checks passed`)
	process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((e) => { console.error('[filepicker] FATAL:', e); process.exit(1) })
