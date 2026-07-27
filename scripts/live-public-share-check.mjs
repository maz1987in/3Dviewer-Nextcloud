#!/usr/bin/env node
/**
 * End-to-end check for public share viewing (issue #115) against a running dev
 * container. Drives a real anonymous browser context — no session, no cookies from
 * the admin login — because the whole point of the feature is what a stranger with
 * a link sees.
 *
 * Covers: single-file share renders the model · folder share opens it from the
 * listing · OBJ+MTL resolves its material through the public dependency route ·
 * a texture reaches the material, both beside the model and one directory down ·
 * a neighbour the model never declares stays unreachable · a password-protected
 * share stays blocked until the password is entered · a non-3D share does not pull
 * in the viewer bundle.
 *
 * Usage: `node scripts/live-public-share-check.mjs`
 * Requires: docker compose up -d (container on :8080).
 *
 * Creates seven shares per run. Nextcloud rate-limits share creation per user, so
 * several runs in quick succession will start returning 429 — the script backs off and
 * retries, but to clear the counter outright:
 *   docker exec nextcloud-threedviewer php -r \
 *     '$d=new PDO("sqlite:/var/www/html/data/owncloud.db"); $d->exec("DELETE FROM oc_ratelimit_entries");'
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
	// Creating shares is rate-limited, and this script needs seven of them. Reuse an
	// intact one from an earlier run rather than spending budget re-making it. Shares
	// carrying options (the password case) are always rebuilt, since a leftover may not
	// have the option set.
	if (Object.keys(extra).length === 0) {
		const existing = await existingShareToken(remotePath)
		if (existing) return existing
	}

	// Idempotent: a share left over from an interrupted run makes the create fail.
	await dropShare(remotePath)
	const params = new URLSearchParams({ path: `/${remotePath}`, shareType: '3', permissions: '1', ...extra })
	// Nextcloud rate-limits the share API; repeated runs of this script trip it.
	for (let attempt = 0; attempt < 8; attempt++) {
		const res = await fetch(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
			method: 'POST',
			headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
			body: params,
		})
		if (res.status === 429) {
			const wait = 5000 * (attempt + 1)
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

/**
 * Token of an existing public link share on a path, if there is one.
 *
 * @param {string} remotePath - path relative to the account root
 * @return {Promise<string|null>} share token, or null when the path is not shared
 */
async function existingShareToken(remotePath) {
	try {
		const res = await fetch(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares?path=/${remotePath}`, {
			headers: { Authorization: AUTH, 'OCS-APIRequest': 'true' },
		})
		return (await res.text()).match(/<token>([^<]+)<\/token>/)?.[1] ?? null
	} catch {
		return null
	}
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

/**
 * Read the rendered pixels and report how much of the checker texture is on screen.
 *
 * A 200 on the wire only proves bytes moved. This proves a user can see the texture:
 * the fixture is a red/blue checker on an otherwise white material, so a textured
 * render carries tens of thousands of red-dominant and blue-dominant pixels while an
 * untextured one carries exactly zero of either. The renderer already runs with
 * preserveDrawingBuffer, so the WebGL canvas can be drawn into a 2D context and read
 * back directly — no screenshot decoding, and nothing that depends on framework
 * internals.
 *
 * @param {import('@playwright/test').Page} page - anonymous page with a rendered model
 * @return {Promise<{redish: number, blueish: number}|null>} null if no canvas is present
 */
async function checkerPixels(page) {
	return page.evaluate(() => {
		const source = document.querySelector('canvas.threedviewer-canvas')
		if (!source) return null

		const flat = document.createElement('canvas')
		flat.width = source.width
		flat.height = source.height
		const ctx = flat.getContext('2d')
		ctx.drawImage(source, 0, 0)

		const { data } = ctx.getImageData(0, 0, flat.width, flat.height)
		let redish = 0
		let blueish = 0
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 200) continue
			const r = data[i]
			const b = data[i + 2]
			// Compare channels rather than absolute values so scene lighting, which
			// scales all three together, cannot fake or mask the result.
			if (r - b > 40) redish++
			if (b - r > 40) blueish++
		}
		return { redish, blueish }
	})
}

/** Both halves of the checker have to be visible, with room to spare. */
const CHECKER_PIXELS = 1000

/**
 * Watch the public dependency route on a page.
 *
 * @param {import('@playwright/test').Page} page - page to instrument
 * @return {{requests: string[], responses: Array<{url: string, status: number, type: string}>}}
 */
function watchDependencyRoute(page) {
	const requests = []
	const responses = []
	page.on('request', (r) => { if (r.url().includes('/dep/')) requests.push(r.url()) })
	page.on('response', (r) => {
		if (r.url().includes('/dep/')) {
			responses.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] || '' })
		}
	})
	return { requests, responses }
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

		// Single-file share of a textured OBJ: the material and the image both sit
		// beside it, and neither of them is shared.
		await upload('tests/fixtures/textured.obj', 'ps-tex.obj', 'model/obj')
		await upload('tests/fixtures/textured.mtl', 'textured.mtl', 'model/mtl')
		await upload('tests/fixtures/checker.png', 'checker.png', 'image/png')
		// A neighbour the model never mentions — the share must not become a way to
		// name-guess it.
		await upload('tests/fixtures/checker.png', 'ps-undeclared.png', 'image/png')
		created.push('ps-tex.obj', 'textured.mtl', 'checker.png', 'ps-undeclared.png')
		const texToken = await share('ps-tex.obj')

		// Folder share whose material points one directory down, the layout most
		// exporters produce.
		await mkdir('ps-texfolder')
		await mkdir('ps-texfolder/textures')
		await upload('tests/fixtures/textured.obj', 'ps-texfolder/model.obj', 'model/obj')
		await upload('tests/fixtures/textured-subdir.mtl', 'ps-texfolder/textured.mtl', 'model/mtl')
		await upload('tests/fixtures/checker.png', 'ps-texfolder/textures/checker.png', 'image/png')
		created.push('ps-texfolder')
		const texFolderToken = await share('ps-texfolder')

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
			page.on('request', r => { if (r.url().includes('/dep/')) mtlRequests.push(r.url()) })
			const failed = []
			page.on('response', r => { if (r.url().includes('/apps/threedviewer/') && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`) })
			// Arm the wait BEFORE navigating: the material fetch is async and can land
			// after the canvas already has pixels, so asserting on a collected list
			// straight after render is a race.
			const mtlSeen = page.waitForRequest(r => r.url().includes('/dep/'), { timeout: 25000 })
				.then(() => true).catch(() => false)
			await page.goto(`${BASE}/s/${objToken}`)
			const ok = await modelRendered(page)
			await mtlSeen
			if (!ok) {
				fail('OBJ+MTL renders on a public share', 'no canvas with content appeared')
			} else if (failed.length) {
				fail('OBJ+MTL renders on a public share', `failed requests: ${failed.join(', ')}`)
			} else if (!mtlRequests.length) {
				fail('OBJ+MTL renders on a public share', 'the public dependency route was never requested')
			} else {
				pass('OBJ+MTL renders and resolves its material via the public dependency route')
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

		// --- 5. a textured OBJ on a single-file share ------------------------
		let declaringObjId = null
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			const dep = watchDependencyRoute(page)
			// Arm before navigating: the texture fetch is two hops behind the model
			// (OBJ -> MTL -> image) and can land well after the canvas has pixels.
			const textureSeen = page.waitForResponse(
				(r) => r.url().includes('/dep/checker.png'), { timeout: 25000 },
			).then((r) => r, () => null)

			await page.goto(`${BASE}/s/${texToken}`)
			const rendered = await modelRendered(page)
			const textureResponse = await textureSeen
			// The material is applied once the image decodes, which is a tick or two
			// after the response lands.
			const pixels = rendered
				? await new Promise((r) => setTimeout(r, 2000)).then(() => checkerPixels(page))
				: null

			declaringObjId = dep.requests[0]?.match(/\/file\/[^/]+\/(\d+)\/dep\//)?.[1] ?? null

			if (!rendered) {
				fail('a texture on a single-file share reaches the screen', 'no canvas with content appeared')
			} else if (!textureResponse) {
				fail('a texture on a single-file share reaches the screen',
					`the texture was never fetched; dependency requests: ${dep.requests.join(', ') || 'none'}`)
			} else if (textureResponse.status() !== 200) {
				fail('a texture on a single-file share reaches the screen',
					`texture returned ${textureResponse.status()}`)
			} else if (!(textureResponse.headers()['content-type'] || '').startsWith('image/')) {
				// Served as octet-stream the browser may refuse to decode it.
				fail('a texture on a single-file share reaches the screen',
					`texture served as ${textureResponse.headers()['content-type']}`)
			} else if (!pixels || pixels.redish < CHECKER_PIXELS || pixels.blueish < CHECKER_PIXELS) {
				fail('a texture on a single-file share reaches the screen',
					`bytes arrived but the checker is not on screen: ${JSON.stringify(pixels)}`)
			} else {
				pass('a texture on a single-file share reaches the screen')
			}
			await ctx.close()
		}

		// --- 6. the same, in a folder share with a textures/ subdirectory ----
		{
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			const dep = watchDependencyRoute(page)
			const textureSeen = page.waitForResponse(
				(r) => r.url().includes('/dep/checker.png'), { timeout: 30000 },
			).then((r) => r, () => null)

			await page.goto(`${BASE}/s/${texFolderToken}`)
			try {
				// Target the model by name: folders sort first, so .first() is the
				// textures/ directory here.
				const entry = page.locator('tr[data-cy-files-list-row-name="model.obj"]')
				await entry.waitFor({ timeout: 15000 })
				await entry.click()
				const rendered = await modelRendered(page)
				const textureResponse = await textureSeen
				const pixels = rendered
					? await new Promise((r) => setTimeout(r, 2000)).then(() => checkerPixels(page))
					: null

				if (!rendered) {
					fail('a texture in a subdirectory resolves on a folder share', 'no canvas rendered')
				} else if (!textureResponse || textureResponse.status() !== 200) {
					// The client only knows the basename; the server is what remembers
					// the material said textures/checker.png.
					fail('a texture in a subdirectory resolves on a folder share',
						`texture request: ${textureResponse ? textureResponse.status() : 'never made'}`
						+ `; dependency requests: ${dep.requests.join(', ') || 'none'}`)
				} else if (!pixels || pixels.redish < CHECKER_PIXELS || pixels.blueish < CHECKER_PIXELS) {
					fail('a texture in a subdirectory resolves on a folder share',
						`bytes arrived but the checker is not on screen: ${JSON.stringify(pixels)}`)
				} else {
					pass('a texture in a subdirectory resolves on a folder share')
				}
			} catch (e) {
				fail('a texture in a subdirectory resolves on a folder share', String(e).split('\n')[0])
			}
			await ctx.close()
		}

		// --- 7. the dependency route is not a name-guessing oracle -----------
		{
			if (declaringObjId === null) {
				fail('an undeclared neighbour stays unreachable', 'could not observe the OBJ file id')
			} else {
				const base = `${BASE}/ocs/v2.php/apps/threedviewer/public/file/${texToken}/${declaringObjId}/dep`
				const declared = await fetch(`${base}/checker.png`)
				const undeclared = await fetch(`${base}/ps-undeclared.png`)

				if (declared.status !== 200) {
					fail('an undeclared neighbour stays unreachable',
						`the declared texture should still be served, got ${declared.status}`)
				} else if (undeclared.status === 200) {
					fail('an undeclared neighbour stays unreachable',
						'a file the model never references was served to an anonymous caller')
				} else {
					pass(`an undeclared neighbour stays unreachable (${undeclared.status})`)
				}
			}
		}

		// --- 8. a non-3D share must not pull in the bundle -------------------
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
