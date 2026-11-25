/**
 * Print check's repair in a real Nextcloud: a logged-in user opens an STL with a hole, a
 * face turned the wrong way, a repeated face and a face with no area, repairs it in the
 * worker, and saves the repaired model next to the original. Nextcloud's own WebDAV answers
 * the permission check, the listing and the write, and the file it holds afterwards is the
 * mended cube. Both files are removed afterwards, so a second run saves under the same name.
 */
import fs from 'node:fs'
import path from 'node:path'
import { BASE_URL, INDEX, PASSWORD, PROJECT_ROOT, USER, expect, expectStandaloneLoaded, test } from './helpers'

const AUTHORIZATION = 'Basic ' + Buffer.from(`${USER}:${PASSWORD}`).toString('base64')
const DAV = `${BASE_URL}/remote.php/dav/files/${encodeURIComponent(USER)}`
const MODEL = 'e2e-broken-cube.stl'
const SAVED = 'e2e-broken-cube (repaired).stl'

const dav = (name: string) => `${DAV}/${encodeURIComponent(name)}`

async function remove(name: string) {
	await fetch(dav(name), { method: 'DELETE', headers: { Authorization: AUTHORIZATION } })
}

test.beforeAll(async () => {
	await remove(SAVED)
	const response = await fetch(dav(MODEL), {
		method: 'PUT',
		headers: { Authorization: AUTHORIZATION },
		body: fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'broken-cube.stl')),
	})
	expect([201, 204]).toContain(response.status)
})

test.afterAll(async () => {
	await remove(MODEL)
	await remove(SAVED)
})

test('a broken STL is repaired and the repaired model is saved next to it, in the user\'s files', async ({ page }) => {
	const propfind = await fetch(dav(MODEL), {
		method: 'PROPFIND',
		headers: { Authorization: AUTHORIZATION, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	const fileId = (await propfind.text()).match(/<oc:fileid>(\d+)<\/oc:fileid>/)?.[1]
	expect(fileId, 'the uploaded model has a file id').toBeTruthy()

	await page.goto(`${INDEX}/apps/threedviewer/f/${fileId}`)
	await expectStandaloneLoaded(page)

	const panel = page.locator('.slide-out-panel')
	if (!(await panel.isVisible())) {
		await page.getByRole('button', { name: 'Toggle tools panel' }).click()
	}
	await panel.getByRole('button', { name: /^Print check/ }).click()
	const card = page.locator('.print-check-card')
	await expect(card).toBeVisible()
	await expect(card.locator('.print-check-lines li')).toHaveText([
		'1 hole, open edges: 4',
		'3 faces turned the wrong way',
		'1 face with no area',
		'1 duplicate face',
	])

	await card.getByRole('button', { name: 'Repair', exact: true }).click()
	await expect(card).toContainText('The repaired model is closed.', { timeout: 30000 })
	await card.getByRole('button', { name: 'Save repaired STL next to the model' }).click()
	await expect(page.getByText(`Saved ${SAVED} next to the model`)).toBeVisible()

	// What Nextcloud holds is a binary STL of the mended cube: an 80-byte header, a count of 12
	// triangles, 50 bytes each
	const response = await fetch(dav(SAVED), { headers: { Authorization: AUTHORIZATION } })
	expect(response.status).toBe(200)
	const body = Buffer.from(await response.arrayBuffer())
	expect(body.readUInt32LE(80)).toBe(12)
	expect(body.length).toBe(84 + 12 * 50)

	// The model it came from is as it was
	const original = await fetch(dav(MODEL), { headers: { Authorization: AUTHORIZATION } })
	expect(Buffer.from(await original.arrayBuffer()).equals(fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'broken-cube.stl')))).toBe(true)
})
