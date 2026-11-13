/**
 * The card a link to a 3D model becomes in Talk, Text and the other apps that render link
 * previews: what it shows from what the server resolved, and that it holds up when that is
 * missing, odd or hostile. It is plain DOM, so it is rendered here as it is in the page.
 */
const { readFileSync } = require('fs')
const { join } = require('path')
const { renderModelCard, destroyModelCard, readModel, CUBE_ICON_PATH, WIDGET_ID } = require('../../src/reference/modelCard.js')

const ROOT = join(__dirname, '..', '..')

/** What ModelReferenceProvider sends for a model with a thumbnail */
function richObject(overrides = {}) {
	return {
		id: 31,
		name: 'Engine block.stl',
		format: 'STL',
		size: 2048,
		unit: null,
		description: 'STL · 2 KB',
		thumbnail: 'https://cloud.example.com/core/preview?fileId=31&x=640&y=360&a=1',
		link: 'https://cloud.example.com/apps/threedviewer/f/31',
		hasView: false,
		labels: { open: 'Open in 3D Viewer', view: 'Opens at a shared view' },
		...overrides,
	}
}

function render(rich) {
	const el = document.createElement('div')
	renderModelCard(el, { richObject: rich, accessible: true, interactive: false })
	return el
}

describe('the 3D model card', () => {
	it('is the widget for the type the server sends', () => {
		expect(WIDGET_ID).toBe('threedviewer_model')
	})

	it('shows the thumbnail, the name, the format and size, and a button that opens the viewer', () => {
		const el = render(richObject())

		expect(el.querySelector('img').getAttribute('src')).toBe('https://cloud.example.com/core/preview?fileId=31&x=640&y=360&a=1')
		expect(el.querySelector('.threedviewer-reference-name').textContent).toBe('Engine block.stl')
		expect(el.querySelector('.threedviewer-reference-details').textContent).toBe('STL · 2 KB')
		const open = el.querySelector('.threedviewer-reference-open')
		expect(open.textContent).toBe('Open in 3D Viewer')
		expect(open.getAttribute('href')).toBe('https://cloud.example.com/apps/threedviewer/f/31')
		expect(el.querySelector('.threedviewer-reference-placeholder')).toBeNull()
	})

	it('opens the pasted link, which is how a shared view survives', () => {
		const link = 'https://cloud.example.com/apps/threedviewer/f/31?view=1.eyJjIjp7fX0'
		const el = render(richObject({ link, hasView: true }))

		expect(el.querySelector('.threedviewer-reference-open').getAttribute('href')).toBe(link)
		expect(el.querySelector('.threedviewer-reference-name').getAttribute('href')).toBe(link)
		expect(el.textContent).toContain('Opens at a shared view')
	})

	it('does not mention a view when the link has none', () => {
		expect(render(richObject()).textContent).not.toContain('Opens at a shared view')
	})

	it('speaks the words the server chose for the reader', () => {
		const el = render(richObject({ hasView: true, labels: { open: 'Im 3D-Betrachter öffnen', view: 'Öffnet eine geteilte Ansicht' } }))

		expect(el.querySelector('.threedviewer-reference-open').textContent).toBe('Im 3D-Betrachter öffnen')
		expect(el.textContent).toContain('Öffnet eine geteilte Ansicht')
	})

	it('falls back to English if the server sent no wording', () => {
		const el = render(richObject({ labels: undefined }))

		expect(el.querySelector('.threedviewer-reference-open').textContent).toBe('Open in 3D Viewer')
	})

	it('opens in a new tab without giving the new page this one', () => {
		const el = render(richObject())

		for (const link of el.querySelectorAll('a')) {
			expect(link.getAttribute('target')).toBe('_blank')
			expect(link.getAttribute('rel')).toBe('noopener noreferrer')
		}
	})

	describe('with no thumbnail yet', () => {
		it('draws the cube instead of an image', () => {
			const el = render(richObject({ thumbnail: null }))

			expect(el.querySelector('img')).toBeNull()
			expect(el.querySelector('.threedviewer-reference-placeholder path').getAttribute('d')).toBe(CUBE_ICON_PATH)
		})

		it('draws the cube when the thumbnail cannot be loaded', () => {
			const el = render(richObject())

			el.querySelector('img').dispatchEvent(new Event('error'))

			expect(el.querySelector('img')).toBeNull()
			expect(el.querySelector('.threedviewer-reference-placeholder')).not.toBeNull()
		})

		it('hides the cube from assistive technology', () => {
			const svg = render(richObject({ thumbnail: null })).querySelector('svg')

			expect(svg.getAttribute('aria-hidden')).toBe('true')
			expect(svg.getAttribute('focusable')).toBe('false')
		})
	})

	it('leaves the image decorative, since the name sits beside it', () => {
		expect(render(richObject()).querySelector('img').getAttribute('alt')).toBe('')
	})

	it('has only the details it was given', () => {
		const el = render(richObject({ description: undefined, format: undefined }))

		expect(el.querySelector('.threedviewer-reference-details')).toBeNull()
		expect(render(richObject({ description: undefined })).querySelector('.threedviewer-reference-details').textContent).toBe('STL')
	})

	describe('treats what it is given as data', () => {
		it('sets names and descriptions as text, never as markup', () => {
			const el = render(richObject({
				name: '<img src=x onerror=alert(1)>.stl',
				description: '<b>STL</b>',
				labels: { open: '<i>Open</i>', view: '' },
			}))

			expect(el.querySelector('.threedviewer-reference-name').textContent).toBe('<img src=x onerror=alert(1)>.stl')
			expect(el.querySelector('.threedviewer-reference-details').textContent).toBe('<b>STL</b>')
			expect(el.querySelector('.threedviewer-reference-open').textContent).toBe('<i>Open</i>')
			// The only image is the thumbnail, and the only elements are the card's own
			expect(el.querySelectorAll('img')).toHaveLength(1)
			expect(el.querySelector('b, i')).toBeNull()
		})

		it.each([
			['javascript:', 'javascript:alert(1)'],
			['data:', 'data:text/html,<script>alert(1)</script>'],
			['not an address at all', 'http://'],
			['empty', ''],
			['a number', 42],
		])('refuses a link that is %s, and shows nothing rather than a dead button', (_label, link) => {
			expect(render(richObject({ link })).childElementCount).toBe(0)
		})

		it('draws the cube instead of an image that is not a web address', () => {
			const el = render(richObject({ thumbnail: 'javascript:alert(1)' }))

			expect(el.querySelector('img')).toBeNull()
			expect(el.querySelector('.threedviewer-reference-placeholder')).not.toBeNull()
		})

		it.each([
			['nothing', undefined],
			['null', null],
			['a string', 'x'],
			['an object with no name', { link: 'https://cloud.example.com/apps/threedviewer/f/1' }],
			['an object with an empty name', { name: '', link: 'https://cloud.example.com/apps/threedviewer/f/1' }],
			['an object with no link', { name: 'a.stl' }],
		])('shows nothing for %s', (_label, rich) => {
			expect(render(rich).childElementCount).toBe(0)
			expect(readModel(rich)).toBeNull()
		})
	})

	it('redraws in place and clears away when the host is done with it', () => {
		const el = document.createElement('div')

		renderModelCard(el, { richObject: richObject({ name: 'first.stl' }) })
		renderModelCard(el, { richObject: richObject({ name: 'second.stl' }) })
		expect(el.querySelectorAll('.threedviewer-reference')).toHaveLength(1)
		expect(el.querySelector('.threedviewer-reference-name').textContent).toBe('second.stl')

		destroyModelCard(el)
		expect(el.childElementCount).toBe(0)
	})

	it('draws a cube the package still has', () => {
		const source = readFileSync(join(ROOT, 'node_modules', 'vue-material-design-icons', 'CubeOutline.vue'), 'utf8')
		const paths = [...source.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1])

		// A copy nothing compares against drifts (see iconPaths.test.js)
		expect(paths).toEqual([CUBE_ICON_PATH])
	})

	describe('its stylesheet', () => {
		const css = readFileSync(join(ROOT, 'src', 'css', 'reference-card.css'), 'utf8')
		const entry = readFileSync(join(ROOT, 'src', 'reference.js'), 'utf8')

		it('is the only one the card brings, not the app\'s design system', () => {
			expect([...entry.matchAll(/^import\s+'([^']+\.css)'/gm)].map((m) => m[1])).toEqual(['./css/reference-card.css'])
		})

		it('themes with Nextcloud\'s variables and none of the app\'s tokens', () => {
			expect(css).not.toMatch(/--tdv-/)
			expect(css).toMatch(/var\(--color-main-background\b/)
			expect(css).toMatch(/var\(--color-primary-element\b/)
		})

		it('styles only the card\'s own classes', () => {
			const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g)
				.map((selector) => selector.trim())
				.filter((selector) => !selector.startsWith('@'))
			expect(selectors.length).toBeGreaterThan(0)
			for (const selector of selectors.flatMap((s) => s.split(','))) {
				expect(selector.trim()).toMatch(/^\.threedviewer-reference\b/)
			}
		})
	})
})
