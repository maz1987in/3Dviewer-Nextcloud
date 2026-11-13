/**
 * A note written on a shared model reaches the model's owner: as a notification in the bell,
 * whose link opens the model at the note, and as an entry in the Activity stream. Both come
 * from the real Notifications and Activity apps, which render what the app stored with its
 * own Notifier and Activity provider.
 *
 * The owner is the suite's usual user. A second account, which the workflow creates, is the
 * one the model is shared with and the one who writes the note, through the same API the
 * viewer uses.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
	BASE_URL, EDITOR, EDITOR_DISPLAY_NAME, EDITOR_PASSWORD, INDEX, PASSWORD, PROJECT_ROOT, USER,
	expect, expectStandaloneLoaded, test,
} from './helpers'

const basic = (user: string, password: string) => 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')
const OWNER_AUTH = basic(USER, PASSWORD)
const EDITOR_AUTH = basic(EDITOR, EDITOR_PASSWORD)
const OCS = { 'OCS-APIRequest': 'true', Accept: 'application/json' }

/** A model of its own, so a rerun against the same server starts with no notes on it */
async function uploadModel(name: string): Promise<number> {
	const url = `${BASE_URL}/remote.php/dav/files/${encodeURIComponent(USER)}/${name}`
	const put = await fetch(url, {
		method: 'PUT',
		headers: { Authorization: OWNER_AUTH },
		body: fs.readFileSync(path.join(PROJECT_ROOT, 'tests', 'fixtures', 'triangle.stl')),
	})
	expect([201, 204], `uploading ${name}`).toContain(put.status)

	const found = await fetch(url, {
		method: 'PROPFIND',
		headers: { Authorization: OWNER_AUTH, Depth: '0', 'Content-Type': 'application/xml' },
		body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop><oc:fileid/></d:prop></d:propfind>',
	})
	const id = (await found.text()).match(/<oc:fileid>(\d+)<\/oc:fileid>/)?.[1]
	expect(id, `the file id of ${name}`).toBeTruthy()
	return Number(id)
}

/** Read and update: enough to write notes */
async function shareForEditing(name: string) {
	const response = await fetch(`${BASE_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
		method: 'POST',
		headers: { Authorization: OWNER_AUTH, ...OCS },
		body: new URLSearchParams({ path: `/${name}`, shareType: '0', shareWith: EDITOR, permissions: '3' }),
	})
	expect(response.status, `sharing ${name}: ${await response.clone().text()}`).toBe(200)
}

async function addNote(fileId: number, text: string): Promise<number> {
	const response = await fetch(`${INDEX}/apps/threedviewer/api/notes/${fileId}`, {
		method: 'POST',
		headers: { Authorization: EDITOR_AUTH, 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: JSON.stringify({ type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text } }),
	})
	expect(response.status, `adding a note: ${await response.clone().text()}`).toBe(201)
	return (await response.json()).id
}

async function ocs(pathAndQuery: string) {
	const response = await fetch(`${BASE_URL}/ocs/v2.php${pathAndQuery}`, { headers: { Authorization: OWNER_AUTH, ...OCS } })
	expect(response.status, pathAndQuery).toBe(200)
	return (await response.json()).ocs.data
}

test('a note on a shared model notifies its owner and is in the Activity stream', async ({ page }) => {
	const name = `e2e-notes-${Date.now()}.stl`
	const secret = 'Text only people who open the model may read'
	const fileId = await uploadModel(name)
	await shareForEditing(name)

	const first = await addNote(fileId, secret)
	const second = await addNote(fileId, secret)

	// Two notes in a row are one notification that counts them, linked to the newer one
	const notifications = (await ocs('/apps/notifications/api/v2/notifications'))
		.filter((n: { app: string, object_type: string }) => n.app === 'threedviewer')
		.filter((n: { subject: string }) => n.subject.includes(name))
	expect(notifications).toHaveLength(1)
	expect(notifications[0].subject).toBe(`${EDITOR_DISPLAY_NAME} added 2 notes on ${name}`)
	expect(notifications[0].object_id).toBe(String(first))
	expect(notifications[0].link).toMatch(new RegExp(`/apps/threedviewer/f/${fileId}\\?note=${second}$`))
	expect(JSON.stringify(notifications[0])).not.toContain(secret)

	// One stream entry per note, under the app's own filter
	const activities = (await ocs('/apps/activity/api/v2/activity/threedviewer?limit=50'))
		.filter((a: { object_id: number }) => a.object_id === fileId)
	expect(activities.map((a: { subject: string }) => a.subject)).toEqual([
		`${EDITOR_DISPLAY_NAME} added a note on ${name}`,
		`${EDITOR_DISPLAY_NAME} added a note on ${name}`,
	])
	expect(JSON.stringify(activities)).not.toContain(secret)

	// The bell: the whole line is the link, and it opens the model with the note in focus
	await page.goto(`${INDEX}/apps/files/`)
	await page.getByRole('button', { name: 'Notifications' }).click()
	const line = page.locator('#header-menu-notifications a.full-subject-link', { hasText: name })
	await expect(line).toBeVisible()
	await line.click()

	await page.waitForURL(new RegExp(`/apps/threedviewer/f/${fileId}\\?note=${second}$`))
	await expectStandaloneLoaded(page)
	await expect(page.locator(`.annotation-item[data-note-id="${second}"]`)).toBeVisible()
})
