/**
 * Note review in the viewer: resolving and reopening, the filter and its counts, replies, and
 * @mentions — against a stand-in for the notes routes, so what is checked is what the viewer
 * sends and what it draws from the answers. The server's side of the same is in
 * tests/http/NoteReviewHttpTest.php and, with real notifications, tests/e2e-nextcloud.
 */
import { test, expect, type Page, type Route } from '@playwright/test'
import { startServer, openViewer, stlCube } from './helpers/viewerServer'

const MODEL = { id: 7411, name: 'cube.stl', body: stlCube(10) }
const PEOPLE = [{ id: 'sara', label: 'Sara Ahmed' }, { id: 'omar', label: 'Omar Khan' }]
const NAMES: Record<string, string> = Object.fromEntries(PEOPLE.map((p) => [p.id, p.label]))
const NOON = 1_800_000_000
const camera = { p: [30, 40, 50], t: [15, 5, 5], z: 1, o: 0 }
const link = (view: object) => `1.${Buffer.from(JSON.stringify(view)).toString('base64url')}`

type Reply = { id: number, text: string, author: { uid: string, displayName: string } | null, createdAt: number, updatedAt: number, mentions: Record<string, string> }
type Note = {
	id: number, type: 'annotation', payload: { space: 'model', point: { x: number, y: number, z: number }, text: string },
	author: { uid: string, displayName: string } | null, createdAt: number, updatedAt: number,
	state: 'open' | 'resolved', resolvedBy: { uid: string, displayName: string } | null, resolvedAt: number | null,
	mentions: Record<string, string>, replies: Reply[],
}

const reply = (id: number, text: string, by = 'Omar Khan'): Reply => ({ id, text, author: { uid: by.toLowerCase().split(' ')[0], displayName: by }, createdAt: NOON + id, updatedAt: NOON + id, mentions: {} })
const note = (id: number, text: string, extra: Partial<Note> = {}): Note => ({
	id, type: 'annotation', payload: { space: 'model', point: { x: id * 2, y: 5, z: 5 }, text }, author: { uid: 'bob', displayName: 'Bob' },
	createdAt: 1, updatedAt: 1, state: 'open', resolvedBy: null, resolvedAt: null, mentions: {}, replies: [], ...extra,
})
const resolved = (id: number, text: string, extra: Partial<Note> = {}) => note(id, text, { state: 'resolved', resolvedBy: { uid: 'omar', displayName: 'Omar Khan' }, resolvedAt: NOON, ...extra })

/** The names of whoever a text mentions, as the server sends them */
const namesIn = (text: string) => Object.fromEntries([...text.matchAll(/@(\w+)/g)].filter((m) => NAMES[m[1]]).map((m) => [m[1], NAMES[m[1]]]))

let server: { url: string, close: () => Promise<void> }
test.beforeAll(async () => { server = await startServer() })
test.afterAll(async () => { await server.close() })

/** What the viewer sent, by route */
type Calls = { states: object[], replies: object[], edits: object[], deletes: string[], people: string[], texts: object[] }

/**
 * A notes route that behaves like the server's, over the notes it is given: it keeps state,
 * so a resolved note stays resolved when the panel asks again.
 */
async function serveNotes(page: Page, notes: Note[], canEdit = true) {
	const calls: Calls = { states: [], replies: [], edits: [], deletes: [], people: [], texts: [] }
	let nextReply = 100
	await page.route(/\/api\/notes\//, async (route: Route) => {
		const request = route.request()
		const { pathname, searchParams } = new URL(request.url())
		const parts = pathname.split('/').slice(pathname.split('/').indexOf('notes') + 1) // fileId, noteId?, 'state'|'replies'?, replyId?
		const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
		const target = notes.find((n) => String(n.id) === parts[1])

		if (request.method() === 'GET' && parts[1] === 'people') {
			const search = searchParams.get('search') ?? ''
			calls.people.push(search)
			return json({ people: PEOPLE.filter((p) => `${p.id} ${p.label}`.toLowerCase().includes(search.toLowerCase())) })
		}
		if (request.method() === 'GET') {
			return json({ canEdit, notes, private: [] })
		}
		if (!target) return json({ error: 'Not found' }, 404)

		if (parts[2] === 'state') {
			const body = request.postDataJSON()
			calls.states.push(body)
			target.state = body.state
			target.resolvedBy = body.state === 'resolved' ? { uid: 'alice', displayName: 'Alice' } : null
			target.resolvedAt = body.state === 'resolved' ? NOON + 60 : null
			return json(target)
		}
		if (parts[2] === 'replies') {
			if (request.method() === 'POST') {
				const body = request.postDataJSON()
				calls.replies.push(body)
				const created: Reply = { ...reply(nextReply++, body.text, 'Alice'), mentions: namesIn(body.text) }
				target.replies.push(created)
				return json(created, 201)
			}
			const existing = target.replies.find((r) => String(r.id) === parts[3])
			if (!existing) return json({ error: 'Not found' }, 404)
			if (request.method() === 'PATCH') {
				const body = request.postDataJSON()
				calls.edits.push(body)
				existing.text = body.text
				existing.mentions = namesIn(body.text)
				return json(existing)
			}
			calls.deletes.push(parts[3])
			target.replies = target.replies.filter((r) => r !== existing)
			return route.fulfill({ status: 204 })
		}
		if (request.method() === 'PATCH') {
			const body = request.postDataJSON()
			calls.texts.push(body)
			target.payload = body.payload
			target.mentions = namesIn(body.payload.text ?? '')
			return json(target)
		}
		return json({ id: target.id })
	})
	return calls
}

/**
 * Open the viewer with notes behind it. The helper answers the notes route itself and
 * registers first, so the route this spec needs is added afterwards and the page loaded again.
 */
async function openWithNotes(page: Page, notes: Note[], options: { canEdit?: boolean, query?: string } = {}) {
	await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
	const { errors } = await openViewer(page, server.url, MODEL, { user: 'alice', query: options.query, openPanel: false })
	const calls = await serveNotes(page, notes, options.canEdit ?? true)
	await page.evaluate(() => { (window as any).__LOAD_COMPLETE = false })
	await page.reload()
	await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
	if (!options.query) {
		await page.click('[aria-label="Toggle tools panel"]')
		await page.locator('.slide-out-panel').getByRole('button', { name: /^Annotation/ }).click()
	}
	await expect(page.locator('.annotation-overlay')).toBeVisible()
	return { calls, errors }
}

const card = (page: Page, id: number) => page.locator(`.annotation-item[data-note-id="${id}"]`)

/** The markers drawn for each note, read off the scene */
const markers = (page: Page) => page.evaluate(() => {
	const viewer = (window as any).__THREEDVIEWER_APP.$.subTree.component.proxy.$refs.viewer
	return viewer.annotation.annotations.value.map((a: any) => ({
		noteId: a.meta.noteId,
		visible: a.pointMesh.visible && a.textMesh.visible,
		opacity: a.pointMesh.material.opacity,
	}))
})

test.describe('resolving', () => {
	test('the filter shows All, Open and Resolved with their counts, and a resolved note stays in the list', async ({ page }) => {
		await openWithNotes(page, [note(1, 'Hole'), resolved(2, 'Edge'), note(3, 'Rim')])

		const filters = page.locator('.note-filters')
		await expect(filters.locator('[data-filter="all"]')).toContainText('3')
		await expect(filters.locator('[data-filter="open"]')).toContainText('2')
		await expect(filters.locator('[data-filter="resolved"]')).toContainText('1')
		await expect(filters.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true')

		// A resolved note is shown as resolved, with who resolved it and when
		await expect(card(page, 2).locator('.note-thread-badge')).toHaveText('Resolved by Omar Khan')
		await expect(card(page, 2).locator('.note-thread-resolved')).toContainText('2027')
		await expect(card(page, 2)).toBeVisible()

		await filters.locator('[data-filter="open"]').click()
		await expect(card(page, 2)).toBeHidden()
		await expect(card(page, 1)).toBeVisible()
		await expect(card(page, 3)).toBeVisible()

		await filters.locator('[data-filter="resolved"]').click()
		await expect(card(page, 2)).toBeVisible()
		await expect(card(page, 1)).toBeHidden()
		await expect(card(page, 3)).toBeHidden()

		await filters.locator('[data-filter="all"]').click()
		await expect(page.locator('.annotation-item:visible')).toHaveCount(3)
	})

	test('the marker of a resolved note is hidden until resolved notes are shown, then dimmed', async ({ page }) => {
		await openWithNotes(page, [note(1, 'Hole'), resolved(2, 'Edge')])

		let seen = await markers(page)
		expect(seen.find((m: any) => m.noteId === 1)?.visible).toBe(true)
		expect(seen.find((m: any) => m.noteId === 2)?.visible).toBe(false)
		const normal = seen.find((m: any) => m.noteId === 1)?.opacity

		await page.getByLabel('Show resolved notes in the scene').check()
		seen = await markers(page)
		const dimmed = seen.find((m: any) => m.noteId === 2)
		expect(dimmed?.visible).toBe(true)
		expect(dimmed?.opacity).toBeLessThan(normal)

		await page.getByLabel('Show resolved notes in the scene').uncheck()
		expect((await markers(page)).find((m: any) => m.noteId === 2)?.visible).toBe(false)
	})

	test('Resolve goes to the server, and the note, its marker and the counts follow its answer', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole'), note(2, 'Edge')])

		await card(page, 1).getByRole('button', { name: 'Resolve' }).click()

		await expect(card(page, 1).locator('.note-thread-badge')).toHaveText('Resolved by Alice')
		expect(calls.states).toEqual([{ state: 'resolved' }])
		await expect(page.locator('.note-filters [data-filter="resolved"]')).toContainText('1')
		await expect(page.locator('.note-filters [data-filter="open"]')).toContainText('1')
		expect((await markers(page)).find((m: any) => m.noteId === 1)?.visible).toBe(false)
		await expect(card(page, 1).getByRole('button', { name: 'Reopen' })).toBeVisible()
	})

	test('Reopen puts a resolved note back among the open ones, with its marker', async ({ page }) => {
		const { calls } = await openWithNotes(page, [resolved(1, 'Hole')])

		await card(page, 1).getByRole('button', { name: 'Reopen' }).click()

		await expect(card(page, 1).locator('.note-thread-badge')).toHaveCount(0)
		expect(calls.states).toEqual([{ state: 'open' }])
		await expect(page.locator('.note-filters [data-filter="open"]')).toContainText('1')
		expect((await markers(page))[0].visible).toBe(true)
	})

	test('a resolved note that is filtered out comes back when a link names it', async ({ page }) => {
		await openWithNotes(page, [note(5, 'Hole'), resolved(6, 'Edge', { replies: [reply(1, 'Done, thanks')] })], { query: `view=${link({ c: camera, n: 6 })}` })

		const highlighted = page.locator('.annotation-overlay .annotation-item.is-highlighted')
		await expect(highlighted).toHaveCount(1)
		await expect(highlighted.locator('.annotation-text-input')).toHaveValue('Edge')
		// The thread is part of the note, so the link opens with it
		await expect(highlighted.locator('.note-reply-text')).toHaveText('Done, thanks')
		await expect(highlighted.locator('.note-thread-badge')).toHaveText('Resolved by Omar Khan')
	})
})

test.describe('replies', () => {
	test('a thread is shown under its note, in order, with author and time', async ({ page }) => {
		await openWithNotes(page, [note(1, 'Hole', { replies: [reply(1, 'Is it drilled?'), reply(2, 'Yes, 6 mm', 'Sara Ahmed')] })])

		const replies = card(page, 1).locator('.note-reply')
		await expect(replies).toHaveCount(2)
		await expect(replies.nth(0).locator('.note-reply-author')).toHaveText('Omar Khan')
		await expect(replies.nth(0).locator('.note-reply-text')).toHaveText('Is it drilled?')
		await expect(replies.nth(1).locator('.note-reply-author')).toHaveText('Sara Ahmed')
		await expect(replies.nth(1).locator('.note-reply-meta')).toContainText('2027')
	})

	test('a reply is sent as written, joins the thread and clears the box; the note stays as it was', async ({ page }) => {
		const { calls } = await openWithNotes(page, [resolved(1, 'Hole', { replies: [reply(1, 'Done')] })])

		await card(page, 1).getByLabel('Reply', { exact: true }).fill('Thanks, looks right')
		await card(page, 1).locator('.note-reply-send').click()

		await expect(card(page, 1).locator('.note-reply')).toHaveCount(2)
		await expect(card(page, 1).locator('.note-reply-text').nth(1)).toHaveText('Thanks, looks right')
		await expect(card(page, 1).locator('.note-reply-author').nth(1)).toHaveText('Alice')
		expect(calls.replies).toEqual([{ text: 'Thanks, looks right' }])
		await expect(card(page, 1).getByLabel('Reply', { exact: true })).toHaveValue('')
		// A reply to a resolved note does not reopen it
		await expect(card(page, 1).locator('.note-thread-badge')).toHaveText('Resolved by Omar Khan')
		expect(calls.states).toEqual([])
	})

	test('an empty reply cannot be sent', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole')])

		await expect(card(page, 1).locator('.note-reply-send')).toBeDisabled()
		await card(page, 1).getByLabel('Reply', { exact: true }).fill('   ')
		await expect(card(page, 1).locator('.note-reply-send')).toBeDisabled()
		expect(calls.replies).toEqual([])
	})

	test('Ctrl+Enter sends a reply', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole')])

		await card(page, 1).getByLabel('Reply', { exact: true }).fill('Quick one')
		await card(page, 1).getByLabel('Reply', { exact: true }).press('Control+Enter')

		await expect(card(page, 1).locator('.note-reply')).toHaveCount(1)
		expect(calls.replies).toEqual([{ text: 'Quick one' }])
	})

	test('a reply can be edited and deleted', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole', { replies: [reply(1, 'First'), reply(2, 'Second')] })])

		await card(page, 1).locator('.note-reply').nth(0).getByRole('button', { name: 'Edit' }).click()
		await card(page, 1).getByLabel('Edit reply').fill('First, edited')
		await card(page, 1).getByRole('button', { name: 'Save' }).click()
		await expect(card(page, 1).locator('.note-reply-text').nth(0)).toHaveText('First, edited')
		expect(calls.edits).toEqual([{ text: 'First, edited' }])

		await card(page, 1).locator('.note-reply').nth(1).getByRole('button', { name: 'Delete' }).click()
		await expect(card(page, 1).locator('.note-reply')).toHaveCount(1)
		expect(calls.deletes).toEqual(['2'])
	})

	test('a failed reply keeps what was written and says so', async ({ page }) => {
		await openWithNotes(page, [note(1, 'Hole')])
		await page.route(/\/replies$/, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"down"}' }))

		await card(page, 1).getByLabel('Reply', { exact: true }).fill('Do not lose me')
		await card(page, 1).locator('.note-reply-send').click()

		await expect(page.getByText('Reply not saved')).toBeVisible()
		await expect(card(page, 1).getByLabel('Reply', { exact: true })).toHaveValue('Do not lose me')
		await expect(card(page, 1).locator('.note-reply')).toHaveCount(0)
	})
})

test.describe('mentions', () => {
	test('typing @ offers the people who can open the model, and a pick is shown by name and sent by id', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole')])
		const field = card(page, 1).getByLabel('Reply', { exact: true })

		await field.click()
		await field.pressSequentially('Please look @sa')

		const list = card(page, 1).getByRole('listbox', { name: 'People you can mention' })
		await expect(list.getByRole('option')).toHaveCount(1)
		await expect(list.getByRole('option')).toContainText('Sara Ahmed')
		expect(calls.people.at(-1)).toBe('sa')

		await field.press('Enter')

		await expect(field).toHaveValue('Please look @Sara Ahmed ')
		await expect(list).toHaveCount(0)
		await card(page, 1).locator('.note-reply-send').click()

		// What is sent is the id, which keeps meaning the same person; what is drawn is the name.
		// The request is on its way when the click returns, so wait for it to arrive
		await expect.poll(() => calls.replies).toEqual([{ text: 'Please look @sara' }])
		const mention = card(page, 1).locator('.note-reply-text .note-mention')
		await expect(mention).toHaveText('@Sara Ahmed')
		await expect(card(page, 1).locator('.note-reply-text')).not.toContainText('@sara')
	})

	test('the list can be walked with the arrow keys, closed with Escape, and a click picks', async ({ page }) => {
		await openWithNotes(page, [note(1, 'Hole')])
		const field = card(page, 1).getByLabel('Reply', { exact: true })

		await field.click()
		await field.pressSequentially('@')
		const options = card(page, 1).getByRole('option')
		await expect(options).toHaveCount(2)
		await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')

		await field.press('ArrowDown')
		await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
		await field.press('Escape')
		await expect(options).toHaveCount(0)
		// Escape closed the list, not the panel
		await expect(page.locator('.annotation-overlay')).toBeVisible()

		await field.pressSequentially('o')
		await card(page, 1).getByRole('option', { name: /Omar Khan/ }).click()
		await expect(field).toHaveValue('@Omar Khan ')
	})

	test('an @ with nobody to offer shows no list, and an email address starts none', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Hole')])
		const field = card(page, 1).getByLabel('Reply', { exact: true })

		await field.click()
		await field.pressSequentially('@zzz')
		await page.waitForTimeout(400)
		await expect(card(page, 1).getByRole('option')).toHaveCount(0)

		const before = calls.people.length
		await field.fill('')
		await field.pressSequentially('write to me@exa')
		await page.waitForTimeout(400)
		expect(calls.people.length).toBe(before)
	})

	test('in a note\'s own text, a pick is saved as the id and the field keeps showing the name', async ({ page }) => {
		const { calls } = await openWithNotes(page, [note(1, 'Check')])
		const text = card(page, 1).locator('.annotation-text-input')

		await text.click()
		await text.press('End')
		await text.pressSequentially(' with @om')
		await card(page, 1).getByRole('option', { name: /Omar Khan/ }).click()

		await expect(text).toHaveValue('Check with @Omar Khan ')
		// Saved as typed, a moment after each pause: wait for the last save to be the whole text
		await expect.poll(() => (calls.texts.at(-1) as { payload: { text: string } } | undefined)?.payload.text, { timeout: 15000 }).toBe('Check with @omar ')
		// The server's answer names the person, and the field still shows them by name
		await expect(text).toHaveValue('Check with @Omar Khan ')
	})

	test('a note with a mention shows the name, never the id, wherever it is read', async ({ page }) => {
		// What is drawn on the labels in the scene: every text the viewer paints on a canvas
		await page.addInitScript(() => {
			const painted: string[] = (window as any).__painted = []
			const original = CanvasRenderingContext2D.prototype.fillText
			CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number]) {
				painted.push(String(text))
				return original.call(this, text, ...rest)
			}
		})
		await openWithNotes(page, [note(1, 'Ask @sara about it', { mentions: { sara: 'Sara Ahmed' } })])

		await expect(card(page, 1).locator('.annotation-text-input')).toHaveValue('Ask @Sara Ahmed about it')
		const painted: string[] = await page.evaluate(() => (window as any).__painted)
		expect(painted).toContain('Ask @Sara Ahmed about it')
		expect(painted.filter((text) => text.includes('@sara'))).toEqual([])
	})
})

test.describe('who may review', () => {
	test('someone who may only view reads state and replies and can change none of it', async ({ page }) => {
		await openWithNotes(page, [resolved(1, 'Hole', { replies: [reply(1, 'Done')] }), note(2, 'Edge')], { canEdit: false })

		await expect(card(page, 1).locator('.note-thread-badge')).toHaveText('Resolved by Omar Khan')
		await expect(card(page, 1).locator('.note-reply-text')).toHaveText('Done')
		await expect(page.locator('.note-thread-toggle')).toHaveCount(0)
		await expect(page.locator('.note-reply-composer')).toHaveCount(0)
		await expect(card(page, 1).getByRole('button', { name: 'Edit' })).toHaveCount(0)
		await expect(card(page, 1).getByRole('button', { name: 'Delete' })).toHaveCount(0)
		await expect(card(page, 1).locator('.annotation-text-input')).toHaveAttribute('readonly', '')
		// The filter still works for them
		await page.locator('.note-filters [data-filter="resolved"]').click()
		await expect(card(page, 2)).toBeHidden()
	})

	test('a public link shows states and replies read-only, with no names', async ({ page }) => {
		const shared = [
			{ ...resolved(1, 'Hole @someone', { author: null, resolvedBy: null, replies: [{ ...reply(1, 'Done, @someone'), author: null }] }) },
			{ ...note(2, 'Edge', { author: null }) },
		]
		await page.route('**/apps/threedviewer/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: {} }) }))
		await openViewer(page, server.url, MODEL, { publicToken: 'tok7411', openPanel: false })
		await page.route(/\/public\/notes\//, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ canEdit: false, notes: shared }) }))
		await page.evaluate(() => { (window as any).__LOAD_COMPLETE = false })
		await page.reload()
		await page.waitForFunction(() => (window as any).__LOAD_COMPLETE === true, null, { timeout: 30000 })
		await page.click('[aria-label="Toggle tools panel"]')
		await page.locator('.slide-out-panel').getByRole('button', { name: /^Annotation/ }).click()

		await expect(card(page, 1).locator('.note-thread-badge')).toHaveText('Resolved')
		await expect(card(page, 1).locator('.note-reply-text')).toHaveText('Done, @someone')
		await expect(card(page, 1).locator('.note-reply-author')).toHaveCount(0)
		await expect(page.locator('.note-thread-toggle')).toHaveCount(0)
		await expect(page.locator('.note-reply-composer')).toHaveCount(0)
		await expect(card(page, 1).locator('.annotation-text-input')).toHaveValue('Hole @someone')
		await expect(card(page, 1).locator('.annotation-text-input')).toHaveAttribute('readonly', '')
	})
})
