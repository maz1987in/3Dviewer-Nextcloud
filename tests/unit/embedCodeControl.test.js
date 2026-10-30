/**
 * "Copy embed code" in the tools panel: the size, the angle and, with several, the public
 * link to embed; or, with none that can be embedded, where to make one.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const vue = require('vue')

const ViewerIcon = { props: ['name', 'size'], template: '<svg />' }
let permissions
const asked = []
const MODULES = {
	'./ViewerIcon.vue': { default: ViewerIcon },
	'@nextcloud/router': { generateUrl: (path, params = {}) => '/index.php' + path.replace(/{(\w+)}/g, (_, k) => params[k]) },
	'@nextcloud/auth': { getCurrentUser: () => ({ uid: 'alice' }) },
	'../utils/davFiles.js': { canShare: async (uid, path) => { asked.push([uid, path]); return permissions.includes('R') } },
	'../utils/embedCode.js': { embeddableShares: (shares) => shares.filter((s) => s.isFile && s.canRead && !s.hasPassword) },
}

const share = (id, label, created) => ({ id, token: `tok${id}`, url: `https://cloud.example/s/tok${id}`, label, created, hasPassword: false, expires: null, canDownload: true, isFile: true, canRead: true })

async function mount(shares) {
	const mounted = mountSfc('EmbedCodeControl', { shares, modelPath: '/models/part.stl', fileId: 42 }, MODULES)
	await new Promise((resolve) => setTimeout(resolve, 0))
	await vue.nextTick()
	return mounted
}

const opener = () => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Copy embed code'))
const options = () => document.getElementById('embed-code-options')
const byLabel = (text) => document.getElementById([...document.querySelectorAll('label')].find((l) => l.textContent.trim() === text)?.htmlFor)

async function openOptions() {
	opener().click()
	await vue.nextTick()
}

async function copy() {
	[...options().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy').click()
	await vue.nextTick()
}

beforeEach(() => {
	permissions = 'RGDNVW'
	asked.length = 0
})

afterEach(() => document.body.replaceChildren())

test('shown only to someone who may share the model, as WebDAV says', async () => {
	await mount([share('1', 'Shop', 100)])
	expect(asked).toEqual([['alice', '/models/part.stl']])
	expect(opener()).toBeDefined()

	document.body.replaceChildren()
	permissions = 'GD'
	await mount([share('1', 'Shop', 100)])
	expect(opener()).toBeUndefined()
})

test('the opener says what it controls and whether it is open', async () => {
	await mount([share('1', 'Shop', 100)])

	expect(opener().getAttribute('aria-controls')).toBe('embed-code-options')
	expect(opener().getAttribute('aria-expanded')).toBe('false')
	expect(options()).toBeNull()

	await openOptions()

	expect(opener().getAttribute('aria-expanded')).toBe('true')
	expect(options()).not.toBeNull()
})

test('one share: no choice of link, and the defaults are copied', async () => {
	const { events } = await mount([share('1', 'Shop', 100)])
	await openOptions()

	expect(options().querySelector('select')).toBeNull()
	await copy()

	expect(events).toEqual([['copy', [{ token: 'tok1', width: 640, height: 480, includeView: true }]]])
})

test('several shares: the chosen one, the size and the angle are copied', async () => {
	const { events } = await mount([share('1', 'Shop', 100), share('2', '', 200)])
	await openOptions()

	const select = byLabel('Public link')
	expect([...select.options].map((o) => o.textContent.trim())).toEqual([
		`Shop · ${new Date(100000).toLocaleDateString()}`,
		`Public link · ${new Date(200000).toLocaleDateString()}`,
	])
	select.value = '2'
	select.dispatchEvent(new Event('change'))
	byLabel('Width').value = '800'
	byLabel('Width').dispatchEvent(new Event('input'))
	byLabel('Height').value = '600'
	byLabel('Height').dispatchEvent(new Event('input'))
	const angle = byLabel('Show the model from this angle')
	angle.checked = false
	angle.dispatchEvent(new Event('change'))
	await vue.nextTick()
	await copy()

	expect(events).toEqual([['copy', [{ token: 'tok2', width: 800, height: 600, includeView: false }]]])
})

test('no share that can be embedded: says what is needed and links to the Sharing sidebar', async () => {
	const { events } = await mount([{ ...share('9', 'Locked', 100), hasPassword: true }])
	await openOptions()

	expect(options().textContent).toContain('Embedding needs a public link to this file without a password.')
	const link = [...options().querySelectorAll('a')].find((a) => a.textContent.trim() === 'Open the Sharing sidebar')
	expect(link.getAttribute('href')).toBe('/index.php/apps/files/files/42?opendetails=true')
	expect(options().querySelector('input')).toBeNull()
	expect(events).toEqual([])
})

test('Escape closes the options and returns focus to the opener', async () => {
	await mount([share('1', 'Shop', 100)])
	await openOptions()
	byLabel('Width').focus()

	options().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	await vue.nextTick()

	expect(options()).toBeNull()
	expect(document.activeElement).toBe(opener())
})

test('every input is labelled', async () => {
	await mount([share('1', 'Shop', 100), share('2', 'Blog', 200)])
	await openOptions()

	for (const input of options().querySelectorAll('input, select')) {
		expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull()
	}
	expect(byLabel('Width').getAttribute('min')).toBe('200')
	expect(byLabel('Width').getAttribute('max')).toBe('4000')
})
