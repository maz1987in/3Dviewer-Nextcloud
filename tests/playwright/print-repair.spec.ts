/**
 * Print check's mesh problems and repair, through the whole app: the card lists what is
 * wrong with a broken STL (the files in tests/fixtures), Repair mends it in the worker and
 * says what it did, and the repaired model is saved next to the model or downloaded under
 * the same rules as Export. The server is answered as Nextcloud would: WebDAV for the
 * folder, so what is checked is what the viewer asks it for.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { startServer, openViewer, stlCube, PROJECT_ROOT } from './helpers/viewerServer'

const fixture = (name: string) => fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', name), 'utf8')

const BROKEN = { id: 7301, name: 'broken.stl', body: fixture('broken-cube.stl') }
const INSIDE_OUT = { id: 7302, name: 'inside-out.stl', body: fixture('inside-out-cube.stl') }
const CLOSED = { id: 7303, name: 'cube.stl', body: stlCube(10) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

const panelButton = (page: Page) => page.locator('.slide-out-panel').getByRole('button', { name: /^Print check/ })
const card = (page: Page) => page.locator('.print-check-card')
const button = (page: Page, name: string | RegExp) => card(page).getByRole('button', { name, exact: typeof name === 'string' })

/** A one-response multistatus for the folder, with its permissions. */
const folderProps = (permissions: string) => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href>
		<d:propstat><d:prop><oc:permissions>${permissions}</oc:permissions></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
	</d:response>
</d:multistatus>`

/** The folder's listing: itself, the model, and a repaired copy made earlier. */
const folderListing = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href><d:propstat><d:prop><d:displayname>models</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
	<d:response><d:href>/remote.php/dav/files/alice/models/broken.stl</d:href><d:propstat><d:prop><d:displayname>broken.stl</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
	<d:response><d:href>/remote.php/dav/files/alice/models/broken%20(repaired).stl</d:href><d:propstat><d:prop><d:displayname>broken (repaired).stl</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`

/**
 * Answer the folder's WebDAV requests: PROPFIND Depth 0 with the permissions, Depth 1 with
 * the listing, and every PUT with `putStatus`, recording what was sent.
 */
async function mockFolder(page: Page, permissions: string, putStatus = 201) {
	const puts: { url: string, body: Buffer, ifNoneMatch?: string }[] = []
	await page.route('**/remote.php/dav/files/alice/**', async (route) => {
		const request = route.request()
		if (request.method() === 'PUT') {
			puts.push({ url: request.url(), body: request.postDataBuffer() ?? Buffer.alloc(0), ifNoneMatch: request.headers()['if-none-match'] })
			await route.fulfill({ status: putStatus })
			return
		}
		await route.fulfill({ status: 207, contentType: 'application/xml', body: request.headers().depth === '0' ? folderProps(permissions) : folderListing })
	})
	return puts
}

/** Open a model and Print check on it. */
async function openPrintCheck(page: Page, model: typeof BROKEN, viewer?: Parameters<typeof openViewer>[3]) {
	// Settings are read once from the server; unanswered, the viewer uses its defaults
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	const { errors } = await openViewer(page, server.url, model, viewer)
	await panelButton(page).click()
	await expect(card(page)).toBeVisible()
	return { errors }
}

test('lists what is wrong with a broken STL, in plain words, and offers Repair', async ({ page }) => {
	const { errors } = await openPrintCheck(page, BROKEN)
	await expect(card(page)).toContainText('Mesh problems')
	const problems = card(page).locator('.print-check-lines li')
	await expect(problems).toHaveText([
		'1 hole, open edges: 4',
		'3 faces turned the wrong way',
		'1 face with no area',
		'1 duplicate face',
	])
	await expect(card(page)).toContainText('Needs a closed model: 1 part has holes')
	await expect(button(page, 'Repair')).toBeVisible()
	expect(errors).toEqual([])
})

test('a repair says what it did, and the card shows the new state', async ({ page }) => {
	const { errors } = await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	const done = card(page).locator('.print-check-lines li')
	await expect(done).toHaveText([
		// 36 corners are 9 places
		'Joined 27 vertices',
		'Removed 1 face with no area',
		'Removed 1 duplicate face',
		'Turned 3 faces the right way',
		'Filled 1 hole',
	])
	// The closed-mesh check ran again on the result: no longer "needs a closed model", and the filament is estimated
	await expect(card(page)).not.toContainText('Needs a closed model')
	await expect(card(page)).toContainText('About 1.0 g · 0.32 m of filament (estimate)')
	await expect(button(page, 'Repair')).toHaveCount(0)
	await expect(card(page)).toContainText('The model on screen and its file are not changed.')

	// What the repair filled is drawn in green, and the way back restores the card
	await expect(card(page).getByLabel('Show what was filled in green')).toBeChecked()
	await button(page, 'Undo repair').click()
	await expect(card(page)).toContainText('Needs a closed model: 1 part has holes')
	await expect(button(page, 'Repair')).toBeVisible()
	expect(errors).toEqual([])
})

test('an inside-out model is turned right side out', async ({ page }) => {
	await openPrintCheck(page, INSIDE_OUT)
	await expect(card(page).locator('.print-check-lines li')).toHaveText(['1 part is inside out'])
	await button(page, 'Repair').click()
	await expect(card(page).locator('.print-check-lines li')).toHaveText(['Joined 28 vertices', 'Turned 1 part right side out'], { timeout: 15000 })
	await expect(card(page)).toContainText('The repaired model is closed.')
})

test('saves the repaired STL next to the model, under a name the folder does not have, and downloads nothing', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	const downloads: string[] = []
	page.on('download', (download) => downloads.push(download.suggestedFilename()))
	await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })

	await button(page, 'Save repaired STL next to the model').click()
	await expect.poll(() => puts.length).toBe(1)
	// "broken (repaired).stl" is in the folder already: the copy is numbered, and never replaces a file
	expect(puts[0].url).toMatch(/\/remote\.php\/dav\/files\/alice\/models\/broken%20\(repaired\)%20\(2\)\.stl$/)
	expect(puts[0].ifNoneMatch).toBe('*')
	// A binary STL of the mended cube: an 80-byte header, a count of 12 triangles, 50 bytes each
	expect(puts[0].body.length).toBe(84 + 12 * 50)
	expect(puts[0].body.readUInt32LE(80)).toBe(12)
	await expect(page.getByText('Saved broken (repaired) (2).stl next to the model')).toBeVisible()
	expect(downloads).toEqual([])
})

test('the repaired model can be saved as a 3MF', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	await card(page).getByLabel('Repaired file format').selectOption('3mf')
	await button(page, 'Save repaired 3MF next to the model').click()
	await expect.poll(() => puts.length).toBe(1)
	expect(puts[0].url).toMatch(/broken%20\(repaired\)\.3mf$/)
	expect(puts[0].ifNoneMatch).toBe('*')
	// A 3MF is a zip
	expect(puts[0].body.subarray(0, 2).toString()).toBe('PK')
})

test('the repaired model downloads under its own name, and writes nothing into the folder', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	const download = page.waitForEvent('download')
	await button(page, 'Download repaired STL').click()
	const file = await download
	expect(file.suggestedFilename()).toBe('broken (repaired).stl')
	const bytes = fs.readFileSync((await file.path())!)
	expect(bytes.length).toBe(84 + 12 * 50)
	expect(puts).toEqual([])
})

test('a folder the user may not add files to has the download only', async ({ page }) => {
	await mockFolder(page, 'SRG')
	await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	await expect(button(page, 'Download repaired STL')).toBeVisible()
	await expect(button(page, /Save repaired/)).toHaveCount(0)
})

test('a public link downloads, like Export, and never saves', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await openPrintCheck(page, BROKEN, { user: null, publicToken: 'printrepair' })
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	await expect(button(page, /Save repaired/)).toHaveCount(0)
	const download = page.waitForEvent('download')
	await button(page, 'Download repaired STL').click()
	expect((await download).suggestedFilename()).toBe('broken (repaired).stl')
	expect(puts).toEqual([])
})

test('a full Nextcloud says so, and the buttons work again', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK', 507)
	await openPrintCheck(page, BROKEN)
	await button(page, 'Repair').click()
	await expect(card(page)).toContainText('The repaired model is closed.', { timeout: 15000 })
	await button(page, 'Save repaired STL next to the model').click()
	await expect.poll(() => puts.length).toBe(1)
	await expect(page.getByText('There isn\'t enough space in your Nextcloud to save it. Download it instead.')).toBeVisible()
	await expect(button(page, 'Download repaired STL')).not.toHaveAttribute('aria-disabled', 'true')
})

test('a closed model has no problems and no Repair', async ({ page }) => {
	const { errors } = await openPrintCheck(page, CLOSED)
	await expect(card(page)).toContainText('No problems found')
	// An STL gives every face its own corners: noted, and not a problem
	await expect(card(page)).toContainText('28 vertices repeat another one\'s place, as in most STL files')
	await expect(card(page)).toContainText('About 1.0 g · 0.32 m of filament (estimate)', { timeout: 10000 })
	await expect(button(page, 'Repair')).toHaveCount(0)
	expect(errors).toEqual([])
})
