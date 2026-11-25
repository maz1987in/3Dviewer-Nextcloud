/**
 * "Save next to the model" in a real Nextcloud: a logged-in user exports a STEP model as STL
 * into its own folder. Nextcloud's own WebDAV answers the permission check, the listing and
 * the write, and the file it holds afterwards is the export. The STL is removed afterwards,
 * so a second run saves under the same name.
 */
import { BASE_URL, INDEX, MODELS, PASSWORD, USER, expect, expectStandaloneLoaded, readState, test } from './helpers'

const AUTHORIZATION = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
const DAV = `${BASE_URL}/remote.php/dav/files/${encodeURIComponent(USER)}`
// e2e-cube.step, saved as STL: the name the folder does not have yet
const SAVED = MODELS.step.remote.replace(/\.step$/, '.stl')

test.afterEach(async () => {
	await fetch(`${DAV}/${encodeURIComponent(SAVED)}`, { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
})

test('a STEP model exported as STL is saved next to it, in the user\'s files', async ({ page }) => {
	await page.goto(`${INDEX}/apps/threedviewer/f/${readState().fileIds.step}`)
	await expectStandaloneLoaded(page)

	const panel = page.locator('.slide-out-panel')
	if (!(await panel.isVisible())) {
		await page.getByRole('button', { name: 'Toggle tools panel' }).click()
	}
	const header = panel.locator('.section-header[aria-controls="panel-section-export"]')
	if (await header.getAttribute('aria-expanded') !== 'true') {
		await header.click()
	}
	await panel.getByLabel('Export model format').selectOption('stl')
	const save = panel.getByRole('button', { name: 'Save STL next to the model' })
	await expect(save).toBeVisible()
	await save.click()
	await expect(page.getByText(`Saved ${SAVED} next to the model`)).toBeVisible()

	// What Nextcloud holds is a binary STL: an 80-byte header, a triangle count, 50 bytes each
	const response = await fetch(`${DAV}/${encodeURIComponent(SAVED)}`, { headers: { Authorization: AUTHORIZATION } })
	expect(response.status).toBe(200)
	const body = Buffer.from(await response.arrayBuffer())
	const triangles = body.readUInt32LE(80)
	expect(triangles).toBeGreaterThan(0)
	expect(body.length).toBe(84 + triangles * 50)
})
