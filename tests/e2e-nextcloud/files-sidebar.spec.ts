/**
 * The "3D" tab of the Files sidebar, on a real Nextcloud with the app installed in
 * custom_apps/: registered by the script the Files app asks sidebar scripts of, shown for a
 * model, measuring a model nobody measured, and reading the stored numbers the next time.
 *
 * The tab registers differently on each server version (the legacy `OCA.Files.Sidebar` of 31
 * and 32, web components from 33); this suite runs against the newest one the app supports,
 * so what it proves is that version's, and the other path is held by tests/unit/stats.
 *
 * Every test runs under the guard in helpers.ts: no CSP violation, and no 404 for the app's own
 * files, which is where a tab chunk or the measuring worker loaded from a wrong path would show.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { BASE_URL, EDITOR, EDITOR_PASSWORD, INDEX, PASSWORD, PROJECT_ROOT, USER, expect, expectModelShown, readState, test } from './helpers'

const AUTHORIZATION = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
const DAV = `${BASE_URL}/remote.php/dav/files/${encodeURIComponent(USER)}`
const SETTINGS = `${INDEX}/apps/threedviewer/settings`

/** What the server keeps for a user who has background thumbnails off, as the workflow sets it up */
const BASE_PREFERENCES = { thumbnails: { background: false } }

async function requestToken(page: Page): Promise<string> {
	return await page.evaluate(() => document.head.getAttribute('data-requesttoken') ?? (window as any).OC?.requestToken)
}

/**
 * Show a file's details in the Files app: its row's actions menu, then Details, which is how
 * a person opens the sidebar. The `opendetails` link parameter is not relied on.
 */
async function openDetails(page: Page, fileId: number) {
	await page.goto(`${INDEX}/apps/files/files`)
	const row = page.locator(`[data-cy-files-list-row-fileid="${fileId}"]`)
	await row.waitFor()
	await row.locator('[data-cy-files-list-row-actions] button').last().click()
	await page.getByRole('menuitem', { name: 'Details' }).click()
	const sidebar = page.locator('[data-cy-sidebar]')
	await expect(sidebar).toBeVisible()
	return sidebar
}

/** Open the sidebar's 3D tab and wait for it to have something to say. */
async function openTab(page: Page, fileId: number) {
	const sidebar = await openDetails(page, fileId)
	await sidebar.getByRole('tab', { name: '3D' }).click()
	const tab = sidebar.locator('.tdv-model-tab')
	await expect(tab).toBeVisible()
	return tab
}

async function setPreferences(page: Page, preferences: object) {
	const response = await page.request.put(SETTINGS, {
		headers: { requesttoken: await requestToken(page) },
		data: { settings: preferences },
	})
	expect(response.status()).toBe(200)
}

test.afterEach(async ({ page }) => {
	// Whatever a test changed of the user's preferences goes back
	if (page.url().startsWith(BASE_URL)) {
		await page.request.put(SETTINGS, {
			headers: { requesttoken: await requestToken(page).catch(() => '') },
			data: { settings: BASE_PREFERENCES },
		}).catch(() => {})
	}
})

test.describe('the 3D tab', () => {
	test('is in the sidebar of a model, named 3D, and measures a model nobody measured', async ({ page }) => {
		const { fileIds } = readState()
		// Nobody has measured this version: the browser does, stores it, and shows it
		const stored = page.waitForResponse((response) => response.url().includes(`/api/stats/${fileIds.stl}`) && response.request().method() === 'POST')

		const tab = await openTab(page, fileIds.stl)

		await expect(tab.locator('[data-test="size"]')).toHaveText('1.00 × 1.00 × 0.00 mm')
		await expect(tab.getByRole('term').filter({ hasText: 'Format' })).toBeVisible()
		await expect(tab.locator('dd').filter({ hasText: /^STL$/ })).toBeVisible()
		await expect(tab.locator('[data-test="triangles"]')).toHaveText('1')
		await expect(tab.locator('[data-test="parts"]')).toHaveText('1')
		// An STL records no unit, so the tab says it is a guess rather than passing it off as fact
		await expect(tab.locator('[data-test="unit-source"]')).toContainText('guess')
		expect((await stored).status()).toBeLessThan(500)
	})

	test('reads the numbers the next time, without downloading the model or measuring it again', async ({ page }) => {
		const { fileIds } = readState()
		// Whether an earlier test stored them or this one does, this version has them now
		await openTab(page, fileIds.stl)

		const requests: string[] = []
		page.on('request', (request) => {
			const url = request.url()
			if (url.includes(`/api/file/${fileIds.stl}`) || (url.includes(`/api/stats/${fileIds.stl}`) && request.method() === 'POST')) {
				requests.push(`${request.method()} ${url}`)
			}
		})
		// A fresh page, as the next person to open the details would have
		const tab = await openTab(page, fileIds.stl)

		await expect(tab.locator('[data-test="size"]')).toHaveText('1.00 × 1.00 × 0.00 mm')
		expect(requests, 'no download of the model and no second measurement').toEqual([])
	})

	test('stores numbers every user who can read the file sees', async ({ page }) => {
		const { fileIds } = readState()
		await openTab(page, fileIds.stl)

		const info = await page.request.get(`${INDEX}/apps/threedviewer/api/stats/${fileIds.stl}`, { headers: { requesttoken: await requestToken(page) } })

		expect(info.status()).toBe(200)
		expect((await info.json()).stats).toMatchObject({ v: 1, kind: 'mesh', triangles: 1, unit: { mm: 1, changeable: true } })
	})

	test('says when the unit was set on the file, and follows it without measuring again', async ({ page }) => {
		const { fileIds } = readState()
		const token = await (async () => {
			await page.goto(`${INDEX}/apps/files/`)
			return await requestToken(page)
		})()
		const set = await page.request.put(`${INDEX}/apps/threedviewer/api/file-settings/${fileIds.stl}`, { headers: { requesttoken: token }, data: { unit: 'in' } })
		expect(set.status()).toBe(200)

		try {
			const tab = await openTab(page, fileIds.stl)

			await expect(tab.locator('[data-test="size"]')).toHaveText('1.00 × 1.00 × 0.00 in')
			await expect(tab.locator('[data-test="unit-source"]')).toContainText('set for this file')
			await expect(tab.locator('[data-test="unit-source"]')).not.toContainText('guess')
		} finally {
			await page.request.put(`${INDEX}/apps/threedviewer/api/file-settings/${fileIds.stl}`, { headers: { requesttoken: token }, data: { unit: null } })
		}
	})

	test('does not call a unit a guess when the format records it', async ({ page }) => {
		const { fileIds } = readState()

		const tab = await openTab(page, fileIds.step)

		await expect(tab.locator('[data-test="unit-source"]')).not.toContainText('guess')
		await expect(tab.locator('[data-test="size"]')).toContainText('mm')
	})

	test('counts the notes and links to the first', async ({ page }) => {
		const { fileIds } = readState()
		await page.goto(`${INDEX}/apps/files/`)
		const token = await requestToken(page)
		// Start from a model with no notes, whatever an earlier run left
		const existing = await (await page.request.get(`${INDEX}/apps/threedviewer/api/notes/${fileIds.stl}`, { headers: { requesttoken: token } })).json()
		for (const left of existing.notes) {
			await page.request.delete(`${INDEX}/apps/threedviewer/api/notes/${fileIds.stl}/${left.id}`, { headers: { requesttoken: token } })
		}
		const created = await page.request.post(`${INDEX}/apps/threedviewer/api/notes/${fileIds.stl}`, {
			headers: { requesttoken: token },
			data: { type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Sidebar note' } },
		})
		expect(created.status()).toBe(201)
		const note = await created.json()

		try {
			const tab = await openTab(page, fileIds.stl)

			const link = tab.locator('[data-test="notes"] a')
			await expect(link).toHaveText(/^1 note$/)
			await expect(link).toHaveAttribute('href', new RegExp(`/apps/threedviewer/f/${fileIds.stl}\\?note=${note.id}$`))
		} finally {
			await page.request.delete(`${INDEX}/apps/threedviewer/api/notes/${fileIds.stl}/${note.id}`, { headers: { requesttoken: token } })
		}
	})

	test('says there are no notes when there are none', async ({ page }) => {
		const { fileIds } = readState()

		const tab = await openTab(page, fileIds.step)

		await expect(tab.locator('[data-test="notes"]')).toHaveText('No notes yet')
	})

	test('opens the model in the viewer from the keyboard', async ({ page }) => {
		const { fileIds } = readState()
		const tab = await openTab(page, fileIds.stl)

		const open = tab.getByRole('link', { name: 'Open in 3D Viewer' })
		await expect(open).toBeVisible()
		await open.focus()
		await expect(open).toBeFocused()
		await page.keyboard.press('Enter')

		await expectModelShown(page)
	})

	test('can be chosen from the keyboard', async ({ page }) => {
		const { fileIds } = readState()
		const sidebar = await openDetails(page, fileIds.stl)
		const tabs = sidebar.getByRole('tab')
		await expect(tabs.first()).toBeVisible()

		const three = sidebar.getByRole('tab', { name: '3D' })
		await three.focus()
		await page.keyboard.press('Enter')

		await expect(three).toHaveAttribute('aria-selected', 'true')
		await expect(sidebar.locator('.tdv-model-tab')).toBeVisible()
	})

	test('is not in the sidebar of a folder or of another kind of file', async ({ page }) => {
		const text = await fetch(`${DAV}/e2e-sidebar-notes.txt`, { method: 'PUT', headers: { Authorization: AUTHORIZATION }, body: 'not a model' })
		expect([201, 204]).toContain(text.status)
		try {
			await page.goto(`${INDEX}/apps/files/`)
			await page.locator('[data-cy-files-list-row-name="e2e-sidebar-notes.txt"]').waitFor()
			const fileId = Number(await page.locator('[data-cy-files-list-row-name="e2e-sidebar-notes.txt"]').getAttribute('data-cy-files-list-row-fileid'))

			const sidebar = await openDetails(page, fileId)

			await expect(sidebar.getByRole('tab').first()).toBeVisible()
			await expect(sidebar.getByRole('tab', { name: '3D' })).toHaveCount(0)
		} finally {
			await fetch(`${DAV}/e2e-sidebar-notes.txt`, { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
		}
	})

	test('says a model over the user\'s size limit is too large to measure here, and does not download it', async ({ page }) => {
		// A text STL a little over the smallest limit a user can set (1 MB)
		const facet = '  facet normal 0 0 1\n    outer loop\n      vertex 0 0 0\n      vertex 1 0 0\n      vertex 0 1 0\n    endloop\n  endfacet\n'
		const body = 'solid big\n' + facet.repeat(Math.ceil((1.2 * 1048576) / facet.length)) + 'endsolid big\n'
		const put = await fetch(`${DAV}/e2e-large.stl`, { method: 'PUT', headers: { Authorization: AUTHORIZATION }, body })
		expect([201, 204]).toContain(put.status)
		try {
			await page.goto(`${INDEX}/apps/files/`)
			const row = page.locator('[data-cy-files-list-row-name="e2e-large.stl"]')
			await row.waitFor()
			const fileId = Number(await row.getAttribute('data-cy-files-list-row-fileid'))
			await setPreferences(page, { thumbnails: { background: false, maxFileSizeMB: 1 } })
			const downloads: string[] = []
			page.on('request', (request) => {
				if (/\/api\/file\/|\/remote\.php\/dav\/files\/.*e2e-large\.stl/.test(request.url())) {
					downloads.push(request.url())
				}
			})

			const tab = await openTab(page, fileId)

			await expect(tab.locator('[data-test="too-large"]')).toContainText('too large to measure here')
			await expect(tab.getByRole('link', { name: 'Open in 3D Viewer' })).toBeVisible()
			expect(downloads).toEqual([])
		} finally {
			await fetch(`${DAV}/e2e-large.stl`, { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
		}
	})

	test('a user who can only read the file sees the model measured, and stores nothing', async ({ browser }) => {
		const name = 'e2e-readonly.stl'
		const fixture = fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'triangle.stl'))
		const put = await fetch(`${DAV}/${name}`, { method: 'PUT', headers: { Authorization: AUTHORIZATION }, body: fixture })
		expect([201, 204]).toContain(put.status)
		// Read-only: permission 1
		const share = await fetch(`${BASE_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
			method: 'POST',
			headers: { Authorization: AUTHORIZATION, 'OCS-APIRequest': 'true', Accept: 'application/json' },
			body: new URLSearchParams({ path: `/${name}`, shareType: '0', shareWith: EDITOR, permissions: '1' }),
		})
		expect(share.status).toBe(200)

		const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
		const page = await context.newPage()
		try {
			await page.goto(`${INDEX}/login`)
			await page.locator('input[name="user"]').fill(EDITOR)
			await page.locator('input[name="password"]').fill(EDITOR_PASSWORD)
			await page.locator('button[type="submit"]').click()
			await page.waitForURL(/\/apps\//)
			await page.goto(`${INDEX}/apps/files/files`)
			const row = page.locator(`[data-cy-files-list-row-name="${name}"]`)
			await row.waitFor()
			const fileId = Number(await row.getAttribute('data-cy-files-list-row-fileid'))
			const posts: string[] = []
			page.on('request', (request) => {
				if (request.method() === 'POST' && request.url().includes('/api/stats/')) {
					posts.push(request.url())
				}
			})

			const tab = await openTab(page, fileId)

			// Measured in this browser, for this user, and shown
			await expect(tab.locator('[data-test="size"]')).toHaveText('1.00 × 1.00 × 0.00 mm')
			await expect(tab.locator('[data-test="triangles"]')).toHaveText('1')
			expect(posts, 'a reader does not store the numbers').toEqual([])
			const stored = await fetch(`${INDEX}/apps/threedviewer/api/stats/${fileId}`, { headers: { Authorization: AUTHORIZATION, 'OCS-APIRequest': 'true' } })
			expect((await stored.json()).stats, 'nothing is stored for everyone else').toBeNull()
		} finally {
			await context.close()
			await fetch(`${DAV}/${name}`, { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
		}
	})

	test('measures a model again when the file changes, and never shows the older version\'s numbers', async ({ page }) => {
		const name = 'e2e-changing.stl'
		const fixture = fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'triangle.stl'))
		const put = async (content: Buffer | string) => {
			const response = await fetch(`${DAV}/${name}`, { method: 'PUT', headers: { Authorization: AUTHORIZATION }, body: content })
			expect([201, 204]).toContain(response.status)
		}
		await put(fixture)
		try {
			await page.goto(`${INDEX}/apps/files/`)
			const row = page.locator(`[data-cy-files-list-row-name="${name}"]`)
			await row.waitFor()
			const fileId = Number(await row.getAttribute('data-cy-files-list-row-fileid'))

			const first = await openTab(page, fileId)
			await expect(first.locator('[data-test="triangles"]')).toHaveText('1')

			// Two triangles now
			await put(fixture.toString().replace('endsolid triangle', '  facet normal 0 0 1\n    outer loop\n      vertex 2 0 0\n      vertex 3 0 0\n      vertex 2 1 0\n    endloop\n  endfacet\nendsolid triangle'))
			const second = await openTab(page, fileId)

			await expect(second.locator('[data-test="triangles"]')).toHaveText('2')
		} finally {
			await fetch(`${DAV}/${name}`, { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
		}
	})
})
