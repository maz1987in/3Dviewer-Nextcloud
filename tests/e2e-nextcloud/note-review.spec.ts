/**
 * Reviewing a model's notes on a real server: resolving a note, replying to it, and
 * @mentioning people — with the real Notifications and Activity apps showing what reaches
 * whom.
 *
 * The owner is the suite's usual user; the second account, which the model is shared with for
 * editing, writes through the same API the viewer uses. What the owner does in the viewer — open
 * the note from the bell, resolve it, answer it with a mention — is done in the browser.
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
const OWNER_DISPLAY_NAME = 'E2E User'

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

async function publicLink(name: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
		method: 'POST',
		headers: { Authorization: OWNER_AUTH, ...OCS },
		body: new URLSearchParams({ path: `/${name}`, shareType: '3', permissions: '1' }),
	})
	const body = await response.json()
	expect(response.status, `linking ${name}: ${JSON.stringify(body)}`).toBe(200)
	return body.ocs.data.token
}

/** The app's own notes routes, as the viewer calls them */
async function notes(auth: string, method: string, route: string, body?: object) {
	const response = await fetch(`${INDEX}/apps/threedviewer/api/notes/${route}`, {
		method,
		headers: { Authorization: auth, 'OCS-APIRequest': 'true', 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	})
	const text = await response.text()
	return { status: response.status, body: text ? JSON.parse(text) : null }
}

async function addNote(auth: string, fileId: number, text: string): Promise<number> {
	const { status, body } = await notes(auth, 'POST', String(fileId), { type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text } })
	expect(status, 'adding a note').toBe(201)
	return body.id
}

async function reply(auth: string, fileId: number, noteId: number, text: string): Promise<number> {
	const { status, body } = await notes(auth, 'POST', `${fileId}/${noteId}/replies`, { text })
	expect(status, 'replying').toBe(201)
	return body.id
}

async function ocs(auth: string, pathAndQuery: string) {
	const response = await fetch(`${BASE_URL}/ocs/v2.php${pathAndQuery}`, { headers: { Authorization: auth, ...OCS } })
	expect(response.status, pathAndQuery).toBe(200)
	return (await response.json()).ocs.data
}

/** What this app has put in someone's bell about a model, newest first */
async function bell(auth: string, name: string) {
	const all = await ocs(auth, '/apps/notifications/api/v2/notifications')
	return all.filter((n: { app: string, subject: string }) => n.app === 'threedviewer' && n.subject.includes(name))
}

test('resolving a note, replying with a mention, and who is told', async ({ page }) => {
	const name = `e2e-review-${Date.now()}.stl`
	const secret = 'Review text only people who open the model may read'
	const fileId = await uploadModel(name)
	await shareForEditing(name)

	// The editor writes a note and asks the owner to look at it
	const noteId = await addNote(EDITOR_AUTH, fileId, secret)
	await reply(EDITOR_AUTH, fileId, noteId, `Can you check this, @${USER} ?`)

	// The owner is told they were mentioned, and the notification opens the model at the note
	const mention = (await bell(OWNER_AUTH, name)).find((n: { subject: string }) => n.subject.includes('mentioned you'))
	expect(mention.subject).toBe(`${EDITOR_DISPLAY_NAME} mentioned you in a note on ${name}`)
	expect(mention.link).toMatch(new RegExp(`/apps/threedviewer/f/${fileId}\\?note=${noteId}$`))
	expect(JSON.stringify(mention)).not.toContain(secret)

	await page.goto(`${INDEX}/apps/files/`)
	await page.getByRole('button', { name: 'Notifications' }).click()
	const line = page.locator('#header-menu-notifications a.full-subject-link', { hasText: 'mentioned you' }).filter({ hasText: name })
	await expect(line).toBeVisible()
	await line.click()

	// The note opens with its thread: the reply names the owner, not their id
	await page.waitForURL(new RegExp(`/apps/threedviewer/f/${fileId}\\?note=${noteId}$`))
	await expectStandaloneLoaded(page)
	const card = page.locator(`.annotation-item[data-note-id="${noteId}"]`)
	await expect(card).toBeVisible()
	await expect(card.locator('.note-reply-text')).toContainText(`Can you check this, @${OWNER_DISPLAY_NAME} ?`)
	await expect(card.locator('.note-reply-author')).toHaveText(EDITOR_DISPLAY_NAME)

	// Resolve it
	await card.getByRole('button', { name: 'Resolve' }).click()
	await expect(card.locator('.note-thread-badge')).toHaveText(`Resolved by ${OWNER_DISPLAY_NAME}`)
	await expect(page.locator('.note-filters [data-filter="resolved"]')).toContainText('1')

	// Answer it, mentioning the editor from the list the field offers
	const field = card.getByLabel('Reply', { exact: true })
	await field.click()
	await field.pressSequentially('Looks fine now, thanks @e2e-ed')
	await card.getByRole('option', { name: new RegExp(EDITOR_DISPLAY_NAME) }).click()
	await expect(field).toHaveValue(`Looks fine now, thanks @${EDITOR_DISPLAY_NAME} `)
	await card.locator('.note-reply-send').click()
	await expect(card.locator('.note-reply-text').nth(1)).toContainText(`thanks @${EDITOR_DISPLAY_NAME}`)

	// What the server holds: resolved by the owner, two replies in order, the mention stored as an id
	const stored = (await notes(EDITOR_AUTH, 'GET', String(fileId))).body.notes.find((n: { id: number }) => n.id === noteId)
	expect(stored.state).toBe('resolved')
	expect(stored.resolvedBy.uid).toBe(USER)
	expect(stored.replies.map((r: { author: { uid: string } }) => r.author.uid)).toEqual([EDITOR, USER])
	expect(stored.replies[1].text).toBe(`Looks fine now, thanks @${EDITOR}`)
	expect(stored.replies[1].mentions).toEqual({ [EDITOR]: EDITOR_DISPLAY_NAME })

	// The editor is told they were mentioned, and the notification carries no text
	const told = (await bell(EDITOR_AUTH, name)).filter((n: { subject: string }) => n.subject.includes('mentioned you'))
	expect(told).toHaveLength(1)
	expect(told[0].subject).toBe(`${OWNER_DISPLAY_NAME} mentioned you in a note on ${name}`)
	expect(told[0].link).toMatch(new RegExp(`/apps/threedviewer/f/${fileId}\\?note=${noteId}$`))
	expect(JSON.stringify(told)).not.toContain('thanks')

	// The stream, under the app's filter, shows each step and none of the text
	const activities = (await ocs(EDITOR_AUTH, '/apps/activity/api/v2/activity/threedviewer?limit=50'))
		.filter((a: { object_id: number }) => a.object_id === fileId)
	const subjects = activities.map((a: { subject: string }) => a.subject)
	expect(subjects).toContain(`${OWNER_DISPLAY_NAME} resolved a note on ${name}`)
	expect(subjects).toContain(`${OWNER_DISPLAY_NAME} replied to a note on ${name}`)
	expect(subjects).toContain(`You replied to a note on ${name}`)
	expect(JSON.stringify(activities)).not.toContain(secret)
	expect(JSON.stringify(activities)).not.toContain('thanks')

	// Open again, the note is still resolved and filtered as such
	await page.reload()
	await expectStandaloneLoaded(page)
	await expect(page.locator(`.annotation-item[data-note-id="${noteId}"] .note-thread-badge`)).toHaveText(`Resolved by ${OWNER_DISPLAY_NAME}`)
})

test('a mention is the only notification someone gets for a note, and reaches only who can open the model', async () => {
	const stamp = Date.now()
	const shared = `e2e-mention-${stamp}.stl`
	const private_ = `e2e-private-${stamp}.stl`
	const sharedId = await uploadModel(shared)
	await shareForEditing(shared)
	const privateId = await uploadModel(private_)

	// The editor's note names the owner: one notification, the mention, and not "added a note" as well
	await addNote(EDITOR_AUTH, sharedId, `Over to you @${USER} `)
	const owners = await bell(OWNER_AUTH, shared)
	expect(owners.map((n: { subject: string }) => n.subject)).toEqual([`${EDITOR_DISPLAY_NAME} mentioned you in a note on ${shared}`])

	// A note on a model the editor cannot open, naming them: nothing reaches them
	const privateNote = await addNote(OWNER_AUTH, privateId, `Do not tell @${EDITOR} `)
	await reply(OWNER_AUTH, privateId, privateNote, `Still not @${EDITOR}`)
	expect(await bell(EDITOR_AUTH, private_)).toEqual([])
	// And they cannot find the model's notes, or ask who to mention on it
	expect((await notes(EDITOR_AUTH, 'GET', String(privateId))).status).toBe(404)
	expect((await notes(EDITOR_AUTH, 'GET', `${privateId}/people?search=e2e`)).status).toBe(404)

	// Nor does the people list offer someone who cannot open the model
	const offered = (await notes(OWNER_AUTH, 'GET', `${privateId}/people?search=e2e`)).body.people.map((p: { id: string }) => p.id)
	expect(offered).not.toContain(EDITOR)
	const onShared = (await notes(OWNER_AUTH, 'GET', `${sharedId}/people?search=e2e`)).body.people.map((p: { id: string }) => p.id)
	expect(onShared).toContain(EDITOR)
	expect(onShared).not.toContain(USER)

	// A public link shows state and replies, and neither a name nor an id
	const sharedNote = (await notes(OWNER_AUTH, 'GET', String(sharedId))).body.notes[0]
	await reply(OWNER_AUTH, sharedId, sharedNote.id, `Thanks @${EDITOR}`)
	await notes(OWNER_AUTH, 'PATCH', `${sharedId}/${sharedNote.id}/state`, { state: 'resolved' })
	const token = await publicLink(shared)
	const visitor = await fetch(`${BASE_URL}/ocs/v2.php/apps/threedviewer/public/notes/${token}/${sharedId}`, { headers: OCS })
	const text = await visitor.text()
	expect(visitor.status).toBe(200)
	const publicNote = JSON.parse(text).notes[0]
	expect(publicNote.state).toBe('resolved')
	expect(publicNote.replies[0].text).toBe('Thanks @someone')
	expect(publicNote.payload.text).toBe('Over to you @someone ')
	expect(text).not.toContain(USER)
	expect(text).not.toContain(EDITOR)
	expect(text).not.toContain(EDITOR_DISPLAY_NAME)
	expect(text).not.toContain(OWNER_DISPLAY_NAME)
})
