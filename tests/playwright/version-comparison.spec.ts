/**
 * Comparing the open model with an earlier version of its file, through the whole app:
 * the tools panel button, the version list Nextcloud's versions collection returns, the
 * comparison it loads, and the overlay. The unit suites cover the parsing and placement;
 * this covers that the panel, the app and the viewer are wired to them.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { PROJECT_ROOT, startServer, openViewer, stlCube } from './helpers/viewerServer'

const MODEL = { id: 5151, name: 'cube.stl', body: stlCube(10) }
const fixture = (name: string) => fs.readFileSync(path.join(PROJECT_ROOT, 'tests/fixtures/versions', name), 'utf8')

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/**
 * Answer the versions collection with a fixture, and every version with a 20 mm cube.
 * @param page - the page
 * @param listing - the PROPFIND body
 */
async function mockVersions(page: Page, listing: string) {
	const seen = { propfind: 0, downloads: 0 }
	await page.route('**/remote.php/dav/versions/**', (route) => {
		const request = route.request()
		if (request.method() === 'PROPFIND') {
			seen.propfind++
			return route.fulfill({ status: 207, contentType: 'application/xml; charset=utf-8', body: listing })
		}
		seen.downloads++
		return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: stlCube(20) })
	})
	return seen
}

const versionButton = (page: Page) => page.getByRole('button', { name: 'Compare with earlier version' })

test('picking a version shows both models and labels the table', async ({ page }) => {
	const seen = await mockVersions(page, fixture('owner-two-versions.xml'))
	const { errors } = await openViewer(page, server.url, MODEL)

	await versionButton(page).click()
	const dialog = page.getByRole('dialog', { name: 'Earlier versions' })
	await expect(dialog).toBeVisible()
	const rows = dialog.locator('.version-row')
	await expect(rows).toHaveCount(2)
	await rows.first().click()

	await expect(dialog).toBeHidden()
	await expect(page.locator('.diff-label-orig')).toHaveText('This version')
	await expect(page.locator('.diff-label-comp')).not.toHaveText('')
	expect(seen.propfind).toBe(1)
	expect(seen.downloads).toBe(1)
	// The comparison is the version: a 20 mm cube against the open 10 mm one
	await expect(page.locator('.diff-table')).toContainText('20')
	expect(errors).toEqual([])
})

test('overlay toggles and reports its state', async ({ page }) => {
	await mockVersions(page, fixture('owner-two-versions.xml'))
	await openViewer(page, server.url, MODEL)
	await versionButton(page).click()
	await page.locator('.version-row').first().click()

	// Offered only once the two are laid out, so clicking it at once cannot race the layout
	const overlay = page.getByRole('button', { name: 'Overlay' })
	await expect(overlay).toHaveAttribute('aria-pressed', 'false')
	await overlay.click()
	await expect(overlay).toHaveAttribute('aria-pressed', 'true')
	await page.waitForTimeout(300)
	await expect(overlay).toHaveAttribute('aria-pressed', 'true')
	await overlay.click()
	await expect(overlay).toHaveAttribute('aria-pressed', 'false')
})

test('Fit Both with Overlay on keeps the overlay and only moves the camera', async ({ page }) => {
	await mockVersions(page, fixture('owner-two-versions.xml'))
	await openViewer(page, server.url, MODEL)
	await versionButton(page).click()
	await page.locator('.version-row').first().click()
	const overlay = page.getByRole('button', { name: 'Overlay' })
	await overlay.click()
	await expect(overlay).toHaveAttribute('aria-pressed', 'true')

	await page.getByRole('button', { name: 'Fit Both' }).click()
	await page.waitForTimeout(300)
	await expect(overlay).toHaveAttribute('aria-pressed', 'true')
})

test('leaving comparison takes the earlier version out of the scene', async ({ page }) => {
	await mockVersions(page, fixture('owner-two-versions.xml'))
	await openViewer(page, server.url, MODEL)
	const meshes = () => page.evaluate(() => {
		const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
		let count = 0
		viewer.scene.traverse((child: any) => { if (child.isMesh && !child.userData?.isHelper) count++ })
		return count
	})
	const before = await meshes()
	await versionButton(page).click()
	await page.locator('.version-row').first().click()
	await page.getByRole('button', { name: 'Overlay' }).click()
	expect(await meshes()).toBeGreaterThan(before)

	await page.locator('.slide-out-panel').getByRole('button', { name: /^Comparison/ }).click()
	await expect.poll(meshes).toBe(before)
})

test('no earlier versions shows the empty state', async ({ page }) => {
	await mockVersions(page, fixture('only-current.xml'))
	await openViewer(page, server.url, MODEL)

	await versionButton(page).click()
	const dialog = page.getByRole('dialog', { name: 'Earlier versions' })
	await expect(dialog).toContainText('No earlier versions')
	await dialog.getByRole('button', { name: 'Close' }).click()
	await expect(dialog).toBeHidden()
	// Cancelling leaves comparison mode, so the button is usable again
	await expect(versionButton(page)).toBeEnabled()
})

test('a list the server refuses shows the error state', async ({ page }) => {
	await page.route('**/remote.php/dav/versions/**', (route) => route.fulfill({ status: 403, body: '' }))
	await openViewer(page, server.url, MODEL)

	await versionButton(page).click()
	await expect(page.getByRole('dialog', { name: 'Earlier versions' })).toContainText("Couldn't load the versions")
})

test('public share links have no version button', async ({ page }) => {
	await openViewer(page, server.url, MODEL, { user: 'alice', publicToken: 'tok' })
	await expect(page.getByRole('button', { name: 'Comparison' })).toBeVisible()
	await expect(versionButton(page)).toHaveCount(0)
})

test('keyboard: the button, a row and the overlay switch work with Enter', async ({ page }) => {
	await mockVersions(page, fixture('owner-two-versions.xml'))
	await openViewer(page, server.url, MODEL)

	await versionButton(page).focus()
	await page.keyboard.press('Enter')
	const row = page.locator('.version-row').first()
	await expect(row).toBeVisible()
	await row.focus()
	await page.keyboard.press('Enter')

	const overlay = page.getByRole('button', { name: 'Overlay' })
	await overlay.focus()
	await page.keyboard.press('Enter')
	await expect(overlay).toHaveAttribute('aria-pressed', 'true')
})

test('Escape closes the version list', async ({ page }) => {
	await mockVersions(page, fixture('owner-two-versions.xml'))
	await openViewer(page, server.url, MODEL)

	await versionButton(page).click()
	const dialog = page.getByRole('dialog', { name: 'Earlier versions' })
	await expect(dialog.locator('.version-row')).toHaveCount(2)
	await page.keyboard.press('Escape')
	await expect(dialog).toBeHidden()
})

test('closing the version list while it loads cancels the request, and a list that arrives late is not shown', async ({ page }) => {
	const failed: string[] = []
	page.on('requestfailed', (request) => { if (request.url().includes('/remote.php/dav/versions/')) failed.push(request.failure()?.errorText ?? '') })
	await page.route('**/remote.php/dav/versions/**', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500))
		await route.fulfill({ status: 207, contentType: 'application/xml; charset=utf-8', body: fixture('owner-two-versions.xml') }).catch(() => {})
	})
	await openViewer(page, server.url, MODEL)
	await versionButton(page).click()
	await expect(page.getByRole('dialog')).toBeVisible()
	await page.keyboard.press('Escape')
	await expect(page.getByRole('dialog')).toBeHidden()
	await expect.poll(() => failed.length).toBe(1)
})
