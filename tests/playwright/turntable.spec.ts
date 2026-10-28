/**
 * Turntable video through the whole app: the tools panel button, the dialog, a real
 * MediaRecorder in Chromium, the download and the save to the model's folder. The unit
 * suites cover the orbit and the dialog's stages; this covers that a real browser records
 * a real video and that the viewer is put back as it was.
 */
import { test, expect, type Page } from '@playwright/test'
import fs from 'fs'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

const MODEL = { id: 7171, name: 'cube.stl', body: stlCube(10) }

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

const panelButton = (page: Page) => page.locator('.slide-out-panel').getByRole('button', { name: 'Record turntable' })

/** Open the model, and the panel's Export section, where the button is. */
async function open(page: Page, viewer?: Parameters<typeof openViewer>[3]) {
	const result = await openViewer(page, server.url, MODEL, viewer)
	const header = page.locator('.slide-out-panel .section-header[aria-controls="panel-section-export"]')
	if (await header.getAttribute('aria-expanded') !== 'true') {
		await header.click()
	}
	await expect(panelButton(page)).toBeEnabled()
	return result
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Record turntable' })

/** A one-response multistatus for the folder, with its permissions. */
const folderProps = (permissions: string) => `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href>
		<d:propstat><d:prop><oc:permissions>${permissions}</oc:permissions></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
	</d:response>
</d:multistatus>`

/** The folder's listing: itself, the model and an earlier turntable. */
const folderListing = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
	<d:response><d:href>/remote.php/dav/files/alice/models/</d:href><d:propstat><d:prop><d:displayname>models</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
	<d:response><d:href>/remote.php/dav/files/alice/models/cube.stl</d:href><d:propstat><d:prop><d:displayname>cube.stl</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
	<d:response><d:href>/remote.php/dav/files/alice/models/cube-turntable.webm</d:href><d:propstat><d:prop><d:displayname>cube-turntable.webm</d:displayname></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`

/**
 * Answer the folder's WebDAV requests: PROPFIND Depth 0 with the permissions, Depth 1 with
 * the listing, and record every PUT.
 */
async function mockFolder(page: Page, permissions: string) {
	const puts: string[] = []
	await page.route('**/remote.php/dav/files/alice/**', async (route) => {
		const request = route.request()
		if (request.method() === 'PUT') {
			puts.push(request.url())
			await route.fulfill({ status: 201 })
			return
		}
		const depth = request.headers().depth
		await route.fulfill({ status: 207, contentType: 'application/xml', body: depth === '0' ? folderProps(permissions) : folderListing })
	})
	return puts
}

/** The canvas's drawing buffer, the camera and the controls, as plain values. */
const viewerState = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	const camera = viewer.camera.camera.value
	const controls = viewer.camera.controls.value
	const canvas = viewer.renderer.domElement
	return {
		canvas: [canvas.width, canvas.height],
		position: camera.position.toArray(),
		aspect: camera.aspect,
		target: controls.target.toArray(),
		enabled: controls.enabled,
	}
})

async function recordFourSeconds(page: Page) {
	await panelButton(page).click()
	await expect(dialog(page)).toBeVisible()
	await dialog(page).locator('#turntable-length').fill('4')
	await dialog(page).locator('#turntable-size').selectOption('720p')
	await dialog(page).getByRole('button', { name: 'Record' }).click()
	await expect(dialog(page).getByRole('button', { name: 'Download' })).toBeVisible({ timeout: 20000 })
}

test('records 4 s at 720p and downloads a WebM', async ({ page }) => {
	const { errors } = await open(page)
	await recordFourSeconds(page)
	await expect(dialog(page)).toContainText('Saved as WebM')

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		dialog(page).getByRole('button', { name: 'Download' }).click(),
	])
	expect(download.suggestedFilename()).toBe('cube-turntable.webm')
	const bytes = fs.readFileSync((await download.path())!)
	expect(bytes.length).toBeGreaterThan(0)
	expect([...bytes.subarray(0, 4)]).toEqual([0x1A, 0x45, 0xDF, 0xA3])
	expect(errors).toEqual([])
})

test('after recording, the canvas size, the camera and the controls are as before', async ({ page }) => {
	await open(page)
	const before = await viewerState(page)
	await recordFourSeconds(page)
	const after = await viewerState(page)
	expect(after.canvas).toEqual(before.canvas)
	expect(after.aspect).toBeCloseTo(before.aspect, 6)
	after.position.forEach((value, i) => expect(value).toBeCloseTo(before.position[i], 4))
	after.target.forEach((value, i) => expect(value).toBeCloseTo(before.target[i], 4))
	expect(after.enabled).toBe(before.enabled)
})

test('save next to the model PUTs to the model\'s folder with a free name', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await open(page)
	await recordFourSeconds(page)
	await dialog(page).getByRole('button', { name: 'Save next to the model' }).click()
	await expect.poll(() => puts.length).toBe(1)
	expect(puts[0]).toMatch(/\/remote\.php\/dav\/files\/alice\/models\/cube-turntable%20\(2\)\.webm$/)
	await expect(page.getByText('Saved cube-turntable (2).webm next to the model')).toBeVisible()
})

test('public share has download only', async ({ page }) => {
	const puts = await mockFolder(page, 'RGDNVCK')
	await open(page, { user: null, publicToken: 'abc123' })
	await recordFourSeconds(page)
	await expect(dialog(page).getByRole('button', { name: 'Save next to the model' })).toHaveCount(0)
	expect(puts).toEqual([])
})

test('keyboard: open the dialog, record, stop and download with the keyboard', async ({ page }) => {
	await open(page)
	await panelButton(page).focus()
	await page.keyboard.press('Enter')
	await expect(dialog(page)).toBeVisible()

	const length = dialog(page).locator('#turntable-length')
	await length.focus()
	await page.keyboard.press('End')
	await expect(length).toHaveValue('15')

	const ccw = dialog(page).getByRole('button', { name: 'Counter-clockwise' })
	await ccw.focus()
	await page.keyboard.press('Enter')
	await expect(ccw).toHaveAttribute('aria-pressed', 'true')

	await dialog(page).getByRole('button', { name: 'Record' }).focus()
	await page.keyboard.press('Enter')
	const stop = dialog(page).getByRole('button', { name: 'Stop' })
	await expect(stop).toBeVisible()
	await stop.focus()
	await page.keyboard.press('Enter')
	await expect(dialog(page)).toContainText('Stopped early')

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		(async () => {
			await dialog(page).getByRole('button', { name: 'Download' }).focus()
			await page.keyboard.press('Enter')
		})(),
	])
	expect(download.suggestedFilename()).toBe('cube-turntable.webm')

	await page.keyboard.press('Escape')
	await expect(dialog(page)).toBeHidden()
})
