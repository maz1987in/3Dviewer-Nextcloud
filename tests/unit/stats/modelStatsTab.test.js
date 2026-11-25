/**
 * The "3D" tab of the Files sidebar, as it renders: the numbers, where the unit comes from,
 * the notes and the button, and what it says when a model cannot be measured here.
 */
const vue = require('vue')
const { mountSfc } = require('../helpers/mountSfc.js')
const describeStats = require('../../../src/stats/describeStats.js')
const loadTabState = require('../../../src/stats/loadTabState.js')
const sourceUnits = require('../../../src/utils/sourceUnits.js')

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// Stand-ins for what the component takes from Nextcloud: a button that is a link when it has an
// `href`, a spinner and a note card, each with the attributes the component gives them
const NcButton = {
	props: { variant: String, href: String, wide: Boolean },
	render() {
		return vue.h(this.href ? 'a' : 'button', { href: this.href, class: ['nc-button', `nc-button--${this.variant}`] }, this.$slots.default?.())
	},
}
const NcLoadingIcon = { render: () => vue.h('span', { class: 'nc-loading-icon' }) }
const NcNoteCard = {
	props: { type: String },
	render() {
		return vue.h('div', { class: ['nc-note-card', `nc-note-card--${this.type}`] }, this.$slots.default?.())
	},
}

const MODULES = {
	'@nextcloud/vue': { NcButton, NcLoadingIcon, NcNoteCard },
	'@nextcloud/l10n': {
		getCanonicalLocale: () => 'en-US',
		translate: (app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, key) => String(vars[key])),
		translatePlural: (app, one, many, count) => (count === 1 ? one : many).replace('%n', String(count)),
	},
	'@nextcloud/router': { generateUrl: (url, params = {}) => '/index.php' + url.replace(/{(\w+)}/g, (_, key) => params[key]) },
	'../../stats/describeStats.js': describeStats,
	'../../stats/loadTabState.js': loadTabState,
	'../../printCheck/formatDuration.js': { formatDuration: (seconds) => `${Math.round(seconds / 60)} min` },
	'../../utils/sourceUnits.js': sourceUnits,
}

function stats(overrides = {}) {
	return {
		v: 1,
		kind: 'mesh',
		size: [120.5, 45, 80],
		unit: { mm: 1, changeable: true },
		up: null,
		triangles: 1234567,
		vertices: 654321,
		points: 0,
		splats: 0,
		parts: 4,
		materials: 3,
		textures: 2,
		area: 5000.5,
		volume: 20000,
		watertight: true,
		layers: null,
		printSeconds: null,
		...overrides,
	}
}

function info(overrides = {}) {
	return {
		fileId: 7,
		name: 'bracket.stl',
		size: 2048,
		etag: 'e1',
		canEdit: true,
		stats: stats(),
		settings: { unit: null, up: null },
		notes: { count: 0, firstId: null },
		...overrides,
	}
}

const PROPS = { fileId: 7, name: 'bracket.stl', dir: '/models', active: true }

/** A tab whose server and measuring are fakes. */
function mount(model = info(), { props = {}, measured = { status: 'measured', stats: stats(), complete: true } } = {}) {
	const deps = {
		fetchModelInfo: jest.fn(async () => model),
		uploadModelStats: jest.fn(async () => 'stored'),
		measure: jest.fn(async () => measured),
	}
	const tab = mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, ...props, deps }, MODULES)
	return { ...tab, deps }
}

const settle = async () => {
	for (let i = 0; i < 8; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0))
	}
}
const text = () => document.body.textContent.replace(/\s+/g, ' ').trim()
const row = (label) => [...document.querySelectorAll('.tdv-model-tab__row')].find((r) => r.querySelector('dt').textContent.trim() === label)
const value = (label) => row(label)?.querySelector('dd').textContent.replace(/\s+/g, ' ').trim()

afterEach(() => {
	document.body.replaceChildren()
	delete window.OCA
})

/**
 * Click an element and say whether the tab took the click over (cancelled it). A click it
 * leaves alone is cancelled afterwards, so jsdom does not try to navigate.
 *
 * @param {Element} element - What to click
 * @param {object} [init] - MouseEvent options, such as a held modifier key
 * @return {boolean} Whether the tab prevented the default
 */
function clickTookOver(element, init = {}) {
	let prevented = null
	const observe = (event) => {
		prevented = event.defaultPrevented
		event.preventDefault()
	}
	document.addEventListener('click', observe)
	element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }))
	document.removeEventListener('click', observe)
	return prevented
}

describe('a model that has its numbers', () => {
	it('shows the format, the size in the file\'s unit, and the counts, with no spinner', async () => {
		mount()
		await settle()

		expect(document.querySelector('.nc-loading-icon')).toBeNull()
		expect(value('Format')).toBe('STL')
		expect(value('Size')).toContain('120.50 × 80.00 × 45.00 mm')
		expect(value('Triangles')).toBe('1,234,567')
		expect(value('Vertices')).toBe('654,321')
		expect(value('Parts')).toBe('4')
		expect(value('Materials')).toBe('3')
		expect(value('Textures')).toBe('2')
	})

	it('lists the size as width, depth and height, which is X, Z and Y', async () => {
		mount(info({ stats: stats({ size: [1, 2, 3] }) }))
		await settle()

		expect(document.querySelector('[data-test="size"]').textContent).toBe('1.00 × 3.00 × 2.00 mm')
		expect(value('Size')).toContain('Width × depth × height')
	})

	it('says the unit is a guess when the format records none and none was set', async () => {
		mount()
		await settle()

		const note = document.querySelector('[data-test="unit-source"]').textContent
		expect(note).toContain('records no unit')
		expect(note).toContain('guess')
	})

	it('says the unit was set for the file, and shows the size in it', async () => {
		mount(info({ settings: { unit: 'in', up: null } }))
		await settle()

		expect(document.querySelector('[data-test="size"]').textContent).toBe('120.50 × 80.00 × 45.00 in')
		expect(document.querySelector('[data-test="unit-source"]').textContent).toContain('set for this file')
		expect(document.querySelector('[data-test="unit-source"]').textContent).not.toContain('guess')
	})

	it('says nothing of a guess when the file records its own unit', async () => {
		mount(info({ stats: stats({ unit: { mm: 1000, changeable: false } }) }))
		await settle()

		expect(document.querySelector('[data-test="size"]').textContent).toContain(' m')
		expect(document.querySelector('[data-test="unit-source"]').textContent).toContain('the file records')
		expect(document.querySelector('[data-test="unit-source"]').textContent).not.toContain('guess')
	})

	it('shows the area and the volume with their units, and says when the volume assumes a closed model', async () => {
		mount(info({ stats: stats({ watertight: null }) }))
		await settle()

		expect(value('Surface area')).toBe('5000.50 mm²')
		expect(value('Volume')).toContain('20000.00 mm³')
		expect(document.querySelector('[data-test="volume-note"]').textContent).toBe('Assumes the model is closed')
	})

	it('has no volume note when the mesh was checked, and no row for what was not measured', async () => {
		mount(info({ stats: stats({ volume: null, area: null }) }))
		await settle()

		expect(row('Volume')).toBeUndefined()
		expect(row('Surface area')).toBeUndefined()
		mount()
		await settle()
		expect(document.querySelector('[data-test="volume-note"]')).toBeNull()
	})

	it('shows a scan\'s points and not the triangles of a mesh', async () => {
		mount(info({ name: 'scan.las', stats: stats({ kind: 'points', points: 2500000, triangles: 0, up: '+z', unit: { mm: 1000, changeable: false } }) }), { props: { name: 'scan.las' } })
		await settle()

		expect(value('Points')).toBe('2,500,000')
		expect(row('Triangles')).toBeUndefined()
		expect(row('Materials')).toBeUndefined()
	})

	it('shows a splat\'s splats', async () => {
		mount(info({ stats: stats({ kind: 'splats', splats: 90000 }) }), { props: { name: 'room.splat' } })
		await settle()

		expect(value('Splats')).toBe('90,000')
		expect(row('Triangles')).toBeUndefined()
	})

	it('shows a toolpath\'s layers and print time', async () => {
		mount(info({ stats: stats({ kind: 'toolpath', layers: 240, printSeconds: 7200 }) }), { props: { name: 'benchy.gcode' } })
		await settle()

		expect(value('Layers')).toBe('240')
		expect(value('Print time')).toBe('120 min')
		expect(row('Triangles')).toBeUndefined()
	})

	it('does not measure anything', async () => {
		const { deps } = mount()
		await settle()

		expect(deps.measure).not.toHaveBeenCalled()
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})
})

describe('the notes', () => {
	it('says there are none', async () => {
		mount()
		await settle()

		expect(value('Notes')).toBe('No notes yet')
		expect(row('Notes').querySelector('a')).toBeNull()
	})

	it('says how many are still open when some are resolved', async () => {
		mount(info({ notes: { count: 3, open: 1, firstId: 11 } }))
		await settle()

		expect(row('Notes').querySelector('a').textContent.trim()).toBe('3 notes')
		expect(row('Notes').querySelector('[data-test="notes-open"]').textContent.trim()).toBe('1 open')
		document.body.replaceChildren()

		mount(info({ notes: { count: 3, open: 3, firstId: 11 } }))
		await settle()
		expect(row('Notes').querySelector('[data-test="notes-open"]')).toBeNull()
	})

	it('counts them, in the singular and the plural, and links to the first in the viewer', async () => {
		mount(info({ notes: { count: 3, firstId: 11 } }))
		await settle()

		const link = row('Notes').querySelector('a')
		expect(link.textContent.trim()).toBe('3 notes')
		expect(link.getAttribute('href')).toBe('/index.php/apps/threedviewer/f/7?note=11')
		document.body.replaceChildren()

		mount(info({ notes: { count: 1, firstId: 4 } }))
		await settle()
		expect(row('Notes').querySelector('a').textContent.trim()).toBe('1 note')
	})
})

describe('Open in 3D Viewer', () => {
	it('is a primary link to the viewer page, which works with a keyboard and opens in a new tab on request', async () => {
		mount()
		await settle()

		const button = document.querySelector('.tdv-model-tab__open')
		expect(button.tagName).toBe('A')
		expect(button.getAttribute('href')).toBe('/index.php/apps/threedviewer/f/7')
		expect(button.className).toContain('nc-button--primary')
		expect(button.textContent.trim()).toBe('Open in 3D Viewer')
	})

	it('opens the model in the Viewer over the Files list when the Viewer app is there', async () => {
		const open = jest.fn()
		window.OCA = { Viewer: { open } }
		mount()
		await settle()

		expect(clickTookOver(document.querySelector('.tdv-model-tab__open'))).toBe(true)
		expect(open).toHaveBeenCalledWith({ path: '/models/bracket.stl' })
	})

	it('opens a model in the root folder by its path', async () => {
		const open = jest.fn()
		window.OCA = { Viewer: { open } }
		mount(info(), { props: { dir: '/' } })
		await settle()

		clickTookOver(document.querySelector('.tdv-model-tab__open'))

		expect(open).toHaveBeenCalledWith({ path: '/bracket.stl' })
	})

	it.each([['ctrlKey'], ['metaKey'], ['shiftKey']])('follows the link when %s is held, to open it in a new tab or window', async (modifier) => {
		const open = jest.fn()
		window.OCA = { Viewer: { open } }
		mount()
		await settle()

		expect(clickTookOver(document.querySelector('.tdv-model-tab__open'), { [modifier]: true })).toBe(false)
		expect(open).not.toHaveBeenCalled()
	})

	it('follows the link when there is no Viewer app', async () => {
		mount()
		await settle()

		expect(clickTookOver(document.querySelector('.tdv-model-tab__open'))).toBe(false)
	})

	it('leaves the notes link to the viewer page, which opens the note', async () => {
		const open = jest.fn()
		window.OCA = { Viewer: { open } }
		mount(info({ notes: { count: 2, firstId: 9 } }))
		await settle()

		expect(clickTookOver(row('Notes').querySelector('a'))).toBe(false)
		expect(open).not.toHaveBeenCalled()
	})
})

describe('a model that has no numbers yet', () => {
	it('says it is measuring, as a status the screen reader announces, and then shows what it measured', async () => {
		let finish
		const model = info({ stats: null })
		const deps = {
			fetchModelInfo: jest.fn(async () => model),
			uploadModelStats: jest.fn(async () => 'stored'),
			measure: jest.fn(() => new Promise((resolve) => { finish = resolve })),
		}
		mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, deps }, MODULES)
		await settle()

		const status = document.querySelector('[role="status"]')
		expect(status.textContent).toContain('Measuring this model')
		expect(document.querySelector('.nc-loading-icon')).not.toBeNull()
		expect(document.querySelector('.tdv-model-tab__list')).toBeNull()

		finish({ status: 'measured', stats: stats(), complete: true })
		await settle()

		expect(document.querySelector('[role="status"]')).toBeNull()
		expect(value('Triangles')).toBe('1,234,567')
		expect(deps.uploadModelStats).toHaveBeenCalledWith(7, 'e1', stats())
	})

	it('measures for someone who can only read the file and shows it, without storing it', async () => {
		const { deps } = mount(info({ stats: null, canEdit: false }))
		await settle()

		expect(value('Triangles')).toBe('1,234,567')
		expect(deps.uploadModelStats).not.toHaveBeenCalled()
	})

	it('warns when the numbers are from a model that went without what it refers to', async () => {
		mount(info({ stats: null }), { measured: { status: 'measured', stats: stats(), complete: false } })
		await settle()

		expect(document.querySelector('[data-test="incomplete"]').textContent).toContain('may be incomplete')
	})

	it('says the model is too large to measure here, and still offers to open it', async () => {
		mount(info({ stats: null }), { measured: { status: 'too-large' } })
		await settle()

		const card = document.querySelector('[data-test="too-large"]')
		expect(card.textContent).toContain('too large to measure here')
		expect(card.className).toContain('nc-note-card--info')
		expect(document.querySelector('.tdv-model-tab__open')).not.toBeNull()
		expect(document.querySelector('.tdv-model-tab__list')).toBeNull()
	})

	it('says it could not be measured, and still offers to open it', async () => {
		mount(info({ stats: null }), { measured: { status: 'failed' } })
		await settle()

		expect(document.querySelector('[data-test="failed"]').textContent).toContain('could not be measured')
		expect(document.querySelector('.tdv-model-tab__open')).not.toBeNull()
	})

	it('says no details are available when the server does not know the file, and offers no button', async () => {
		const deps = { fetchModelInfo: jest.fn(async () => { throw new Error('404') }), uploadModelStats: jest.fn(), measure: jest.fn() }
		mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, deps }, MODULES)
		await settle()

		expect(document.querySelector('[data-test="unavailable"]').textContent).toContain('No details are available')
		expect(document.querySelector('.tdv-model-tab__open')).toBeNull()
	})

	it('waits to be asked before it measures a file type other programs use, and then measures it', async () => {
		const { deps } = mount(info({ name: 'cut.nc', stats: null }), { props: { name: 'cut.nc' } })
		await settle()

		const idle = document.querySelector('[data-test="idle"]')
		expect(idle.textContent).toContain('only measured when you ask')
		expect(deps.measure).not.toHaveBeenCalled()

		idle.querySelector('button').click()
		await settle()

		expect(deps.measure).toHaveBeenCalledTimes(1)
		expect(document.querySelector('.tdv-model-tab__list')).not.toBeNull()
	})
})

describe('when it works', () => {
	it('does nothing until it is the tab that shows', async () => {
		const { deps, props } = mount(info(), { props: { active: false } })
		await settle()

		expect(deps.fetchModelInfo).not.toHaveBeenCalled()

		props.active = true
		await settle()

		expect(deps.fetchModelInfo).toHaveBeenCalledWith(7)
		expect(value('Format')).toBe('STL')
	})

	it('starts over for another file, and never shows the answer for the one it left', async () => {
		let answerFirst
		const first = info({ stats: stats({ triangles: 111 }) })
		const second = info({ fileId: 8, name: 'other.stl', stats: stats({ triangles: 222 }) })
		const fetchModelInfo = jest.fn((id) => (id === 7 ? new Promise((resolve) => { answerFirst = () => resolve(first) }) : Promise.resolve(second)))
		const deps = { fetchModelInfo, uploadModelStats: jest.fn(), measure: jest.fn() }
		const { props } = mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, deps }, MODULES)
		await settle()

		props.fileId = 8
		props.name = 'other.stl'
		await settle()
		answerFirst()
		await settle()

		expect(value('Triangles')).toBe('222')
	})

	it('stops measuring when the tab is taken away', async () => {
		let signal
		const deps = {
			fetchModelInfo: jest.fn(async () => info({ stats: null })),
			uploadModelStats: jest.fn(),
			measure: jest.fn((file, abort) => new Promise(() => { signal = abort })),
		}
		const { unmount } = mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, deps }, MODULES)
		await settle()

		unmount()

		expect(signal.aborted).toBe(true)
	})

	it('stops measuring when it stops being the tab that shows', async () => {
		let signal
		const deps = {
			fetchModelInfo: jest.fn(async () => info({ stats: null })),
			uploadModelStats: jest.fn(),
			measure: jest.fn((file, abort) => new Promise(() => { signal = abort })),
		}
		const { props } = mountSfc('components/sidebar/ModelStatsTab', { ...PROPS, deps }, MODULES)
		await settle()

		props.active = false
		await settle()

		expect(signal.aborted).toBe(true)
	})
})

describe('right to left', () => {
	it('keeps each number group in order and draws the layout from logical properties', () => {
		const { readFileSync } = require('fs')
		const { join } = require('path')
		const source = readFileSync(join(__dirname, '..', '..', '..', 'src', 'components', 'sidebar', 'ModelStatsTab.vue'), 'utf8')

		// Numbers and units are bidirectionally isolated, so "120 × 80 × 45 mm" does not reorder
		expect(source).toMatch(/<bdi dir="ltr" data-test="size">/)
		expect(source).not.toMatch(/\b(margin|padding)-(left|right)\b|\btext-align:\s*(left|right)\b|\b(left|right):\s*\d/)
	})
})
