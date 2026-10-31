#!/usr/bin/env node
/**
 * Embedding against a running Nextcloud, in real browsers: a page on another site frames
 * a public link's embed page and the share page itself. The embed must show the model,
 * a textured OBJ with its material and texture beside it, and the share page must be
 * refused, as every Nextcloud page but the embed is.
 *
 * The framing page is served on http://127.0.0.1:5555, a different site from
 * `localhost`, so the frames are cross-site, cookies included. That address has to be
 * among the sites the admin lists (Administration settings › 3D Viewer › Embedding).
 *
 * Usage:
 *   TDV_BASE=http://localhost:8089 TDV_USER=someone TDV_PASSWORD=... node scripts/live-embed-check.mjs
 * TDV_BROWSERS picks the browsers (default: chromium,firefox). The password is never printed.
 * Exits non-zero on any failure.
 */
import { chromium, firefox } from '@playwright/test'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'

const BASE = (process.env.TDV_BASE || '').replace(/\/$/, '')
const USER = process.env.TDV_USER || ''
const PASSWORD = process.env.TDV_PASSWORD || ''
const FRAMER = 'http://127.0.0.1:5555'
const BROWSERS = (process.env.TDV_BROWSERS || 'chromium,firefox').split(',').map((b) => b.trim()).filter(Boolean)
const FOLDER = `tdv-embed-check-${Date.now()}`
const FILES = ['textured.obj', 'textured.mtl', 'checker.png']

if (!BASE || !USER || !PASSWORD) {
	console.error('Set TDV_BASE, TDV_USER and TDV_PASSWORD')
	process.exit(2)
}

// eslint-disable-next-line no-console -- a script's report
const log = (...args) => console.log('[live-embed]', ...args)
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}` }
const dav = (name = '') => `${BASE}/remote.php/dav/files/${encodeURIComponent(USER)}/${FOLDER}${name ? `/${name}` : ''}`

async function request(url, options = {}) {
	const response = await fetch(url, { ...options, headers: { ...auth, ...options.headers } })
	if (!response.ok) {
		throw new Error(`${options.method || 'GET'} ${url.replace(BASE, '')}: ${response.status}`)
	}
	return response
}

/** The model, its material and texture in a folder of their own; a link share of the model. */
async function prepare() {
	await request(dav(), { method: 'MKCOL' })
	for (const name of FILES) {
		await request(dav(name), { method: 'PUT', body: fs.readFileSync(path.resolve('tests/fixtures', name)) })
	}
	const response = await request(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`, {
		method: 'POST',
		headers: { 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ path: `/${FOLDER}/textured.obj`, shareType: 3 }),
	})
	const share = (await response.json()).ocs.data
	log(`uploaded ${FILES.join(', ')} to /${FOLDER}; link share ${share.id}`)
	return share
}

async function cleanUp(share) {
	if (share) {
		await request(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares/${share.id}`, { method: 'DELETE', headers: { 'OCS-APIRequest': 'true' } }).catch(() => {})
	}
	await request(dav(), { method: 'DELETE' }).catch(() => {})
}

/**
 * A page on the other site, with the embed and the share page in frames.
 *
 * @param {string} embedUrl - The embed page
 * @param {string} shareUrl - The share page
 */
function serveFramer(embedUrl, shareUrl) {
	const page = `<!doctype html><html><head><meta charset="utf-8"><title>Another site</title></head><body>
		<iframe id="embed" src="${embedUrl}" width="640" height="480" title="Embedded model" allow="fullscreen"></iframe>
		<iframe id="share" src="${shareUrl}" width="640" height="480" title="Share page"></iframe>
	</body></html>`
	const server = http.createServer((req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
		res.end(page)
	})
	return new Promise((resolve) => server.listen(5555, '127.0.0.1', () => resolve(server)))
}

const header = (headers, name) => headers[name.toLowerCase()] ?? '(none)'

async function check(browserType, embedUrl, shareUrl) {
	const name = browserType.name()
	const browser = await browserType.launch({ args: name === 'chromium' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] })
	const failures = []
	try {
		const page = await browser.newPage()
		const seen = {}
		let texture = null
		page.on('response', (response) => {
			const url = response.url()
			if (url === embedUrl) {
				seen.embed = response.headers()
			} else if (url === shareUrl) {
				seen.share = response.headers()
			} else if (url.includes('/dep/checker.png')) {
				texture = response.status()
			}
		})
		// What the browser says when it refuses a frame
		const refusals = []
		page.on('console', (message) => {
			if (/frame-ancestors|X-Frame-Options/i.test(message.text())) {
				refusals.push(message.text().slice(0, 200))
			}
		})
		await page.goto(`${FRAMER}/`)

		const embed = await (await page.waitForSelector('#embed')).contentFrame()
		try {
			await embed.waitForSelector('canvas', { timeout: 30000 })
			await embed.waitForSelector('.viewer-bottom-actions', { timeout: 30000 })
			log(`${name}: the embed shows the model`)
		} catch {
			failures.push('the embed did not show the model')
		}
		if (texture !== 200) {
			failures.push(`the texture beside the model was not served (${texture ?? 'never asked for'})`)
		} else {
			log(`${name}: its texture loaded through the public dependency route`)
		}

		// A refused frame never gets the share page's document: the browser puts its own
		// error page, or nothing, in its place. Firefox's error page cannot be read at all,
		// so the read is given up after a few seconds.
		await page.waitForTimeout(3000)
		const shareFrame = await (await page.$('#share')).contentFrame()
		const framed = shareFrame
			? await Promise.race([
				shareFrame.evaluate(() => document.getElementById('body-public') !== null ? location.href : null).catch(() => null),
				new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
			])
			: null
		if (framed) {
			failures.push(`the share page was framed (${framed})`)
		} else {
			log(`${name}: the share page was refused (frame shows ${shareFrame ? shareFrame.url() : 'nothing'})`)
		}
		for (const message of refusals) {
			log(`${name}: console: ${message}`)
		}

		for (const [which, headers] of Object.entries(seen)) {
			log(`${name}: ${which} X-Frame-Options: ${header(headers, 'X-Frame-Options')}`)
			log(`${name}: ${which} Content-Security-Policy: ${header(headers, 'Content-Security-Policy')}`)
		}
	} finally {
		await browser.close()
	}
	for (const failure of failures) {
		console.error(`[live-embed] ${name}: FAIL ${failure}`)
	}
	return failures.length === 0
}

let share
let server
let ok = true
try {
	// Any user may load the embed page; its policy says which sites are listed
	const probe = await fetch(`${BASE}/index.php/apps/threedviewer/embed/probe`)
	if (!(probe.headers.get('content-security-policy') || '').includes(FRAMER)) {
		console.error(`[live-embed] ${FRAMER} is not among the sites allowed to embed (embed page answered ${probe.status}).`)
		console.error('[live-embed] List it in Administration settings › 3D Viewer › Embedding, then run this again.')
		process.exit(2)
	}

	share = await prepare()
	const embedUrl = `${BASE}/index.php/apps/threedviewer/embed/${share.token}`
	const shareUrl = `${BASE}/index.php/s/${share.token}`
	server = await serveFramer(embedUrl, shareUrl)
	for (const name of BROWSERS) {
		const browserType = { chromium, firefox }[name]
		if (!browserType) {
			throw new Error(`Unknown browser ${name}`)
		}
		ok = (await check(browserType, embedUrl, shareUrl)) && ok
	}
} catch (error) {
	console.error('[live-embed]', error.message)
	ok = false
} finally {
	server?.close()
	await cleanUp(share)
}

log(ok ? 'PASS' : 'FAIL')
process.exit(ok ? 0 : 1)
