/**
 * "Save next to the model" for an export, through the whole app: the tools panel's Export
 * section, the viewer's export in the chosen format, and the WebDAV writes into the model's
 * folder, answered here as Nextcloud would. It is offered only to someone who may add files
 * to that folder, never replaces a file, and says what went wrong when the server refuses.
 */
import { test, expect, type Page } from '@playwright/test'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

const MODEL = { id: 7181, name: 'cube.stl', body: stlCube(10) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

const panel = (page: Page) => page.locator('.slide-out-panel')
const saveButton = (page: Page) => panel(page).getByRole('button', { name: /next to the model$/ })

/** Open the model, and the panel's Export section. */
async function open(page: Page, viewer?: Parameters<typeof openViewer>[3]) {
	const result = await openViewer(page, server.url, MODEL, viewer)
	const header = page.locator('.slide-out-panel .section-header[aria-controls="panel-section-export"]')
	if (await header.getAttribute('aria-expanded') !== 'true') {
		await header.click()
	}
	await expect(panel(page).locator('.export-btn')).toBeEnabled()
	return result
}

/** A one-response multistatus for the folder, with its permissions. */
const folderProps = (permissions: string) => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href>
		<d:propstat><d:prop><oc:permissions>${permissions}</oc:permissions></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
	</d:response>
</d:multistatus>`

/** The folder's listing: itself and the model. */
const folderListing = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href><d:propstat><d:prop><d:displayname>models</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
	<d:response><d:href>/remote.php/dav/files/alice/models/cube.stl</d:href><d:propstat><d:prop><d:displayname>cube.stl</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
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
		const depth = request.headers().depth
		await route.fulfill({ status: 207, contentType: 'application/xml', body: depth === '0' ? folderProps(permissions) : folderListing })
	})
	return puts
}

test('saves the chosen format next to the model, under a name the folder does not have, and downloads nothing', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	const downloads: string[] = []
	page.on('download', (download) => downloads.push(download.suggestedFilename()))
	const { errors } = await open(page)

	await expect(saveButton(page)).toHaveText('Save GLB next to the model')
	await panel(page).getByLabel('Export model format').selectOption('stl')
	await expect(saveButton(page)).toHaveText('Save STL next to the model')
	await saveButton(page).click()

	await expect.poll(() => puts.length).toBe(1)
	// cube.stl is there: the copy is "cube (2).stl", and never replaces a file made meanwhile
	expect(puts[0].url).toMatch(/\/remote\.php\/dav\/files\/alice\/models\/cube%20\(2\)\.stl$/)
	expect(puts[0].ifNoneMatch).toBe('*')
	// A binary STL of the cube: an 80-byte header, a count of 12 triangles, 50 bytes each
	expect(puts[0].body.length).toBe(84 + 12 * 50)
	expect(puts[0].body.readUInt32LE(80)).toBe(12)
	await expect(page.getByText('Saved cube (2).stl next to the model')).toBeVisible()
	await expect(saveButton(page)).not.toHaveAttribute('aria-disabled', 'true')
	expect(downloads).toEqual([])
	expect(errors).toEqual([])
})

test('Export still downloads, and writes nothing into the folder', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await open(page)
	await panel(page).getByLabel('Export model format').selectOption('stl')
	const download = page.waitForEvent('download')
	await panel(page).locator('.export-btn').click()
	expect((await download).suggestedFilename()).toBe('cube.stl')
	expect(puts).toEqual([])
})

test('a folder the user may not add files to has no save, only Export', async ({ page }) => {
	await mockFolder(page, 'SRG')
	await open(page)
	await expect(panel(page).locator('.export-btn')).toBeVisible()
	await expect(saveButton(page)).toHaveCount(0)
})

test('a public link has no save', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await open(page, { user: null, publicToken: 'exportsave' })
	await expect(saveButton(page)).toHaveCount(0)
	expect(puts).toEqual([])
})

test('a full Nextcloud says so, and the button works again', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK', 507)
	await open(page)
	await saveButton(page).click()
	await expect.poll(() => puts.length).toBe(1)
	await expect(page.getByText('There isn\'t enough space in your Nextcloud to save it. Download it instead.')).toBeVisible()
	await expect(saveButton(page)).not.toHaveAttribute('aria-disabled', 'true')
})
