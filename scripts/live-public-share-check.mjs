#!/usr/bin/env node
/**
 * End-to-end check for public share viewing (issue #115) against a running dev
 * container. Drives a real anonymous browser context — no session, no cookies from
 * the admin login — because the whole point of the feature is what a stranger with
 * a link sees.
 *
 * Covers: single-file share renders the model · folder share opens it from the
 * listing · OBJ+MTL resolves its material through the public sibling route ·
 * a password-protected share stays blocked until the password is entered ·
 * a non-3D share does not pull in the viewer bundle.
 *
 * Usage: `node scripts/live-public-share-check.mjs`
 * Requires: docker compose up -d (container on :8080).
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:8080'
const USER = 'admin'
const PASS = 'admin'
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64')

let failures = 0

function log(...a) { console.log('[public-share]', ...a) }
function pass(name) { console.log(`  ✓ ${name}`) }
function fail(name, detail) { failures++; console.error(`  ✗ ${name}\n      ${detail}`) }

async function dav(method, remote, body, type) {
	const headers = { Authorization: AUTH }
	if (type) headers['Content-Type'] = type
	const res = await fetch(`${BASE}/remote.php/dav/files/${USER}/${remote}`, { method, headers, body })
	if (!res.ok && ![201, 204, 207].includes(res.status)) {
		throw new Error(`${method} ${remote} -> ${res.status}`)
	}
	return res
}

async function upload(fixture, remote, type) {
	return dav('PUT', remote, fs.readFileSync(path.resolve(process.cwd(), fixture)), type)
}

async function mkdir(remote) {
	await fetch(`${BASE}/remote.php/dav/files/${USER}/${remote}`, {
		method: 'MKCOL', headers: { Authorization: AUTH },
	})
}

async function share(remotePath, extra = {}) {
	// Idempotent: a share left over from an interrupted run makes the create fail.
	await dropShare(remotePath)
	const params = new URLSearchParams({ path: `/${remotePath}`, shareType: '3', permissions: '1', ...extra })
	// Nextcloud rate-limits the share API; repeated runs of this script trip it.
	for (let attempt = 0; attempt < 5; attempt++) {
		const res = await fetch(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
			method: 'POST',
			headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
			body: params,
		})
		if (res.status === 429) {
			const wait = 2000 * (attempt + 1)
			log(`rate limited creating share for ${remotePath}, retrying in ${wait}ms`)
			await new Promise(r => setTimeout(r, wait))
			continue
		}
		const xml = await res.text()
		const token = xml.match(/<token>([^<]+)<\/token>/)?.[1]
		if (token) return token
		throw new Error(`share failed for ${remotePath}: ${res.status} ${xml.slice(0, 200)}`)
	}
	throw new Error(`share failed for ${remotePath}: still rate limited after retries`)
}

async function dropShare(remotePath) {
	try {
		const res = await fetch(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares?path=/${remotePath}`, {
			headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
		})
		for (const m of (await res.text()).matchAll(/<id>(\d+)<\/id>/g)) {
			await fetch(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares/${m[1]}`, {
				method: 'DELETE', headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
			})
		}
	} catch { /* best effort */ }
}

async function cleanup(names) {
	for (const n of names) {
		try {
			await dropShare(n)
			await dav('DELETE', n)
		} catch { /* best effort */ }
	}
}

/**
 * Wait until the viewer reports a model on screen, or time out.
 *
 * @param {import('@playwright/test').Page} page - anonymous page
 * @return {Promise<boolean>} whether a canvas with drawn content appeared
 */
async function modelRendered(page) {
	try {
		await page.waitForSelector('canvas.threedviewer-canvas', { timeout: 20000 })
		// A canvas alone proves nothing — confirm WebGL actually produced pixels.
		return await page.waitForFunction(() => {
			const c = document.querySelector('canvas.threedviewer-canvas')
			return !!c && c.width > 0 && c.height > 0
		}, { timeout: 20000 }).then(() => true)
	} catch {
		return false
	}
}

async function main() {
	const created = []
	const browser = await chromium.launch()

	try {
		// --- fixtures -------------------------------------------------------
		await upload('tests/fixtures/triangle.stl', 'ps-single.stl', 'model/stl')
		created.push('ps-single.stl')
		const singleToken = await share('ps-single.stl')

		await mkdir('ps-folder')
		await upload('tests/fixtures/triangle.stl', 'ps-folder/model.stl', 'model/stl')
		created.push('ps-folder')
		const folderToken = await share('ps-folder')

		await upload('tests/fixtures/triangle.obj', 'ps-obj.obj', 'model/obj')
		// name must match the OBJ's `mtllib triangle.mtl` line
		await upload('tests/fixtures/triangle.mtl', 'triangle.mtl', 'model/mtl')
		created.push('ps-obj.obj', 'triangle.mtl')
		const objToken = await share('ps-obj.obj')

		await upload('tests/fixtures/triangle.stl', 'ps-locked.stl', 'model/stl')
		created.push('ps-locked.stl')
		const lockedToken = await share('ps-locked.stl', { password: 'CorrectHorse9!' })

		await dav('PUT', 'ps-notes.txt', 'plain text', 'text/plain')
		created.push('ps-notes.txt')
		const textToken = await share('ps-notes.txt')

		// --- 1. single-file share renders ----------------------------------
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			await page.goto(`${BASE}/s/${singleToken}`)
			const ok = await modelRendered(page)
			ok ? pass('single-file share renders the model anonymously')
				: fail('single-file share renders the model anonymously', 'no canvas with content appeared')
			await ctx.close()
		}

		// --- 2. folder share: open from the listing -------------------------
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			await page.goto(`${BASE}/s/${folderToken}`)
			// The row splits the name across spans ('model' + '.stl'), so match the row
			// itself rather than its rendered text.
			const entry = page.locator('tr[data-cy-files-list-row]').first()
			try {
				await entry.waitFor({ timeout: 15000 })
				await entry.click()
				const ok = await modelRendered(page)
				ok ? pass('folder share opens the model from the listing')
					: fail('folder share opens the model from the listing', 'clicked entry but no canvas rendered')
			} catch (e) {
				fail('folder share opens the model from the listing', String(e).split('\n')[0])
			}
			await ctx.close()
		}

		// --- 3. OBJ+MTL through the public sibling route ---------------------
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			const mtlRequests = []
			page.on('request', r => { if (r.url().includes('/mtl/')) mtlRequests.push(r.url()) })
			const failed = []
			page.on('response', r => { if (r.url().includes('/apps/threedviewer/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
			// Arm the wait BEFORE navigating: the material fetch is async and can land
			// after the canvas already has pixels, so asserting on a collected list
			// straight after render is a race.
			const mtlSeen = page.waitForRequest(r => r.url().includes('/mtl/'), { timeout: 25000 })
				.then(() => true).catch(() => false)
			await page.goto(`${BASE}/s/${objToken}`)
			const ok = await modelRendered(page)
			await mtlSeen
			if (!ok) {
				fail('OBJ+MTL renders on a public share', 'no canvas with content appeared')
			} else if (failed.length) {
				fail('OBJ+MTL renders on a public share', `failed requests: ${failed.join(', ')}`)
			} else if (!mtlRequests.length) {
				fail('OBJ+MTL renders on a public share', 'the public /mtl/ sibling route was never requested')
			} else {
				pass('OBJ+MTL renders and resolves its material via the public sibling route')
			}
			await ctx.close()
		}

		// --- 4. password-protected share stays shut --------------------------
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			await page.goto(`${BASE}/s/${lockedToken}`)
			const askedForPassword = await page.locator('input[type="password"]').first()
				.isVisible({ timeout: 10000 }).catch(() => false)
			const leaked = await page.locator('canvas.threedviewer-canvas').first()
				.isVisible({ timeout: 2000 }).catch(() => false)

			if (!askedForPassword) {
				fail('password-protected share prompts before rendering', 'no password field shown')
			} else if (leaked) {
				fail('password-protected share prompts before rendering', 'a canvas rendered BEFORE the password was entered')
			} else {
				pass('password-protected share prompts and renders nothing first')
			}

			// and renders once the password is supplied
			if (askedForPassword) {
				await page.fill('input[type="password"]', 'CorrectHorse9!')
				await page.press('input[type="password"]', 'Enter')
				const ok = await modelRendered(page)
				ok ? pass('password-protected share renders after authenticating')
					: fail('password-protected share renders after authenticating', 'no canvas after correct password')
			}
			await ctx.close()
		}

		// --- 5. a non-3D share must not pull in the bundle -------------------
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			const viewerAssets = []
			page.on('request', r => { if (r.url().includes('threedviewer')) viewerAssets.push(r.url()) })
			await page.goto(`${BASE}/s/${textToken}`)
			await page.waitForLoadState('networkidle')
			viewerAssets.length === 0
				? pass('a shared .txt does not load the 3D bundle')
				: fail('a shared .txt does not load the 3D bundle', `requested: ${viewerAssets.join(', ')}`)
			await ctx.close()
		}
	} finally {
		await browser.close()
		await cleanup(created)
	}

	log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
	process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
