/**
 * The admin's Embedding section: the sites allowed to embed, one per line, saved
 * through the admin route.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const vue = require('vue')

const NcSettingsSection = {
	props: ['name', 'description'],
	template: '<section><h2>{{ name }}</h2><p class="section-description">{{ description }}</p><slot /></section>',
}
const NcButton = {
	emits: ['click'],
	template: '<button type="button" @click="$emit(\'click\')"><slot /></button>',
}

let stored
let put

function mount() {
	return mountSfc('views/AdminSettings', {}, {
		'@nextcloud/vue': { NcSettingsSection, NcButton },
		'@nextcloud/router': { generateUrl: (path) => `/index.php${path}` },
		'@nextcloud/axios': { default: { put } },
		'../utils/initialState.js': { readInitialState: (key) => (key === 'embed-admin' ? stored : null) },
	})
}

const textarea = () => document.getElementById('threedviewer-embed-origins')
const status = () => document.querySelector('[role="status"]').textContent.trim()
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function type(value) {
	textarea().value = value
	textarea().dispatchEvent(new Event('input'))
	await vue.nextTick()
}

async function save() {
	[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save').click()
	await flush()
	await vue.nextTick()
}

beforeEach(() => {
	stored = { origins: ['https://shop.example', 'http://localhost:5173'] }
	put = jest.fn(async (url, body) => ({ data: { origins: body.origins.map((o) => o.toLowerCase()) } }))
})

afterEach(() => document.body.replaceChildren())

test('the section says what embedding is, and the textarea shows the stored list one per line', () => {
	mount()

	expect(document.querySelector('h2').textContent).toBe('Embedding')
	expect(document.querySelector('.section-description').textContent).toBe('Show public links to 3D files on other websites, such as a shop or a blog. Only the sites listed here can show them; with none listed, embedding is off.')
	expect(textarea().value).toBe('https://shop.example\nhttp://localhost:5173')
})

test('Save sends the lines trimmed, blanks dropped, and shows what was stored', async () => {
	mount()
	await type('  https://Blog.example \n\nhttps://shop.example\n')

	await save()

	expect(put).toHaveBeenCalledWith('/index.php/apps/threedviewer/admin/embed-origins', { origins: ['https://Blog.example', 'https://shop.example'] })
	expect(status()).toBe('Saved')
	expect(textarea().value).toBe('https://blog.example\nhttps://shop.example')
	expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('a refused list names the bad entries in an alert and keeps what was typed', async () => {
	put = jest.fn(async () => {
		const error = new Error('Bad Request')
		error.response = { status: 400, data: { error: 'Not a site address', invalid: ['http://shop.example.com', 'shop'] } }
		throw error
	})
	mount()
	await type('http://shop.example.com\nshop')

	await save()

	expect(document.querySelector('[role="alert"]').textContent.trim()).toBe('Not a site address: http://shop.example.com, shop')
	expect(status()).toBe('Couldn\'t save the list')
	expect(textarea().value).toBe('http://shop.example.com\nshop')
})

test('a failure that is not a bad entry says it could not save, with no alert', async () => {
	put = jest.fn(async () => { throw new Error('Network Error') })
	mount()

	await save()

	expect(status()).toBe('Couldn\'t save the list')
	expect(document.querySelector('[role="alert"]')).toBeNull()
})

test('saving an empty list announces that embedding is off', async () => {
	mount()
	await type('\n  \n')

	await save()

	expect(put).toHaveBeenCalledWith('/index.php/apps/threedviewer/admin/embed-origins', { origins: [] })
	expect(status()).toBe('Embedding is off')
})

test('with no initial state the list starts empty', () => {
	stored = null
	mount()

	expect(textarea().value).toBe('')
})

test('the textarea is labelled and described by the hint', () => {
	mount()

	expect(document.querySelector('label[for="threedviewer-embed-origins"]').textContent.trim()).toBe('Sites allowed to embed')
	const hint = document.getElementById(textarea().getAttribute('aria-describedby'))
	expect(hint.textContent.trim()).toBe('One site per line, such as https://shop.example.com. Only https addresses are accepted, and http://localhost for testing. Anyone can see this list: browsers are sent it with every embed.')
})

test('the web server paragraph is there for an admin whose embeds stay blank', () => {
	mount()

	expect(document.body.textContent).toContain('If embedded models stay blank, check your web server.')
	expect(document.body.textContent).toContain('remove its frame-ancestors for /apps/threedviewer/embed/.')
})

test('the page\'s entry gives the component Nextcloud\'s translation functions', () => {
	// The component calls t() in its template, which the real page only has if the entry
	// sets it: mountSfc above provides its own, so only the entry's source can show this
	const entry = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'src', 'settings-admin.js'), 'utf8')

	expect(entry).toMatch(/import \{ translate, translatePlural \} from '@nextcloud\/l10n'/)
	expect(entry).toMatch(/app\.config\.globalProperties\.t = translate/)
	expect(entry).toMatch(/app\.config\.globalProperties\.n = translatePlural/)
})
