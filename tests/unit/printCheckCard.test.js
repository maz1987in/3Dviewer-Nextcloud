/**
 * The Print check card: what it shows for a mesh, a toolpath and a point cloud, and that
 * every control has a name and tells the viewer what changed.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const printers = require('../../src/printCheck/printers.js')
const formatDuration = require('../../src/printCheck/formatDuration.js')

jest.mock('@nextcloud/l10n', () => ({ translate: (_app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, k) => String(vars[k])) }), { virtual: true })

const MODULES = {
	'./ViewerIcon.vue': { default: { name: 'ViewerIcon', props: ['name', 'size'], template: '<i />' } },
	'../printCheck/printers.js': printers,
	'../printCheck/formatDuration.js': formatDuration,
}

function meshState(overrides = {}) {
	return {
		kind: 'mesh',
		assumesMm: true,
		settings: { ...printers.PRINT_CHECK_DEFAULTS, custom: { ...printers.PRINT_CHECK_DEFAULTS.custom } },
		up: 'y',
		fit: { size: { width: 10, depth: 10, height: 10 }, fits: true, over: { width: 0, depth: 0, height: 0 }, fitsTurned: true },
		overhang: { share: 0.123 },
		closed: 'closed',
		openParts: 0,
		estimate: { grams: 0.96224, metres: 0.32262 },
		slicerSummary: null,
		thickness: { state: 'idle', progress: 0, share: 0, sampled: false, warnOpen: false },
		hoverMm: null,
		...overrides,
	}
}

function mount(state) {
	return mountSfc('PrintCheckCard', { state }, MODULES)
}

const text = () => document.body.textContent.replace(/\s+/g, ' ')

afterEach(() => document.body.replaceChildren())

test('shows the units note only for formats without a unit', () => {
	mount(meshState({ assumesMm: true }))
	expect(text()).toContain("Sizes assume millimetres, because this file doesn't record a unit.")
	document.body.replaceChildren()
	mount(meshState({ assumesMm: false }))
	expect(text()).not.toContain('Sizes assume millimetres')
})

test('a model that fits says so, and one that does not says by how much', () => {
	mount(meshState())
	expect(text()).toContain('Fits the build volume')
	document.body.replaceChildren()
	mount(meshState({ fit: { size: { width: 262.4, depth: 10, height: 300 }, fits: false, over: { width: 12.4, depth: 0, height: 80 }, fitsTurned: false } }))
	expect(text()).toContain('12.4 mm too wide')
	expect(text()).toContain('80 mm too tall')
	expect(text()).not.toContain('too deep')
})

test('overhang share, closed state and estimate read as a person would', () => {
	mount(meshState())
	expect(text()).toContain('12 % of the surface overhangs')
	expect(text()).toContain('About 1.0 g · 0.32 m of filament (estimate)')
	document.body.replaceChildren()
	mount(meshState({ closed: 'open', openParts: 2, estimate: null }))
	expect(text()).toContain('Needs a closed model: 2 parts have holes')
	document.body.replaceChildren()
	mount(meshState({ closed: 'checking', estimate: null }))
	expect(text()).toContain('Checking…')
})

test('gcode shows only slicer lines', () => {
	mount(meshState({ kind: 'gcode', slicerSummary: { slicer: 'PrusaSlicer 2.8.1', printSeconds: 3723, filamentMm: 1520.35, filamentGrams: 4.54 } }))
	expect(text()).toContain('Print time: 1 h 2 min')
	expect(text()).toContain('Filament: 1.52 m')
	expect(text()).toContain('Filament: 4.54 g')
	expect(text()).toContain('Sliced with PrusaSlicer 2.8.1')
	expect(document.querySelector('#print-check-printer')).toBeNull()
	expect(text()).not.toContain('Check wall thickness')
	document.body.replaceChildren()
	mount(meshState({ kind: 'gcode', slicerSummary: { slicer: null, printSeconds: null, filamentMm: null, filamentGrams: null } }))
	expect(text()).toContain("This file doesn't include the slicer's estimates")
})

test('custom printer shows three inputs', () => {
	mount(meshState())
	expect(document.querySelectorAll('.print-check-custom input')).toHaveLength(0)
	document.body.replaceChildren()
	mount(meshState({ settings: { ...meshState().settings, printerId: 'custom' } }))
	const inputs = [...document.querySelectorAll('.print-check-custom input')]
	expect(inputs).toHaveLength(3)
	expect(inputs.every((input) => input.type === 'number' && document.querySelector(`label[for="${input.id}"]`))).toBe(true)
})

test('thickness block hidden for points', () => {
	mount(meshState({ kind: 'points', overhang: null, closed: null, estimate: null }))
	expect(text()).not.toContain('Check wall thickness')
	expect(text()).not.toContain('overhangs')
	expect(document.querySelector('#print-check-printer')).not.toBeNull()
})

test('a thickness run shows progress and Cancel, then the result', () => {
	mount(meshState({ thickness: { state: 'running', progress: 0.4, share: 0, sampled: false, warnOpen: false } }))
	expect(document.querySelector('progress').value).toBeCloseTo(0.4, 9)
	expect([...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel')).toBe(true)
	document.body.replaceChildren()
	mount(meshState({ thickness: { state: 'done', progress: 1, share: 0.25, sampled: true, warnOpen: true }, hoverMm: 0.42 }))
	expect(text()).toContain('25 % of the surface is thinner than 0.8 mm')
	expect(text()).toContain('Checked a sample of points on this large model')
	expect(text()).toContain('This model has holes, so the thickness may be wrong')
	expect(text()).toContain('Thinner than 0.8 mm')
	expect(text()).toContain('Under 1.2 mm')
	expect(text()).toContain('0.42 mm thick')
})

test('controls have names and toggles aria-pressed', () => {
	mount(meshState({ up: 'z' }))
	for (const control of document.querySelectorAll('input, select')) {
		expect(document.querySelector(`label[for="${control.id}"]`) || control.getAttribute('aria-label')).toBeTruthy()
	}
	const yUp = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Y up')
	const zUp = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Z up')
	expect(yUp.getAttribute('aria-pressed')).toBe('false')
	expect(zUp.getAttribute('aria-pressed')).toBe('true')
	expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
	expect([...document.querySelectorAll('button')].every((b) => b.getAttribute('type') === 'button')).toBe(true)
})

test('each control tells the viewer what changed', () => {
	const { events } = mount(meshState({ settings: { ...meshState().settings, printerId: 'custom' } }))
	const fire = (selector, value, type = 'change') => {
		const element = document.querySelector(selector)
		element.value = value
		element.dispatchEvent(new Event(type))
	}
	fire('#print-check-printer', 'bambu-a1')
	fire('#print-check-width', '300')
	fire('#print-check-angle', '50', 'input')
	fire('#print-check-infill', '30')
	fire('#print-check-material', 'petg')
	fire('#print-check-min', '1.2')
	;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Z up').click()
	;[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Check wall thickness').click()
	document.querySelector('.print-check-close').click()

	expect(events).toEqual([
		['set-printer', ['bambu-a1']],
		['set-custom', [{ width: 300 }]],
		['set-overhang-angle', [50]],
		['set-infill', [30]],
		['set-material', ['petg']],
		['set-min-thickness', [1.2]],
		['set-up', ['z']],
		['run-thickness', []],
		['close', []],
	])
})

test('results are announced; the hover readout, the slider value and the progress bar are not', () => {
	mount(meshState({ thickness: { state: 'done', progress: 1, share: 0.25, sampled: false, warnOpen: false }, hoverMm: 1.234 }))
	const live = [...document.querySelectorAll('[aria-live]')].filter((element) => element.getAttribute('aria-live') !== 'off')
	const announced = live.map((element) => element.textContent.replace(/\s+/g, ' ')).join(' ')
	expect(announced).toContain('Fits the build volume')
	expect(announced).toContain('12 % of the surface overhangs')
	expect(announced).toContain('25 % of the surface is thinner than 0.8 mm')
	expect(announced).not.toContain('mm thick')
	expect(announced).not.toContain('°')
	expect(live.some((element) => element.querySelector('progress, input, select, output'))).toBe(false)
})

test('a G-code file shows no units note: it shows no sizes', () => {
	mount(meshState({ kind: 'gcode', assumesMm: true, slicerSummary: { slicer: null, printSeconds: 60, filamentMm: null, filamentGrams: null } }))
	expect(text()).not.toContain('Sizes assume millimetres')
})

test('on a sampled model the thickness under the pointer is given as about', () => {
	mount(meshState({ thickness: { state: 'done', progress: 1, share: 0.25, sampled: true, warnOpen: false }, hoverMm: 1.234 }))
	expect(text()).toContain('About 1.23 mm thick')
	document.body.replaceChildren()
	mount(meshState({ thickness: { state: 'done', progress: 1, share: 0.25, sampled: false, warnOpen: false }, hoverMm: 1.234 }))
	expect(text()).toContain('1.23 mm thick')
	expect(text()).not.toContain('About 1.23')
})

test('closing the card gives focus back to what opened it', () => {
	const opener = document.createElement('button')
	document.body.appendChild(opener)
	opener.focus()
	const { unmount } = mount(meshState())
	document.querySelector('.print-check-close').focus()
	unmount()
	expect(document.activeElement).toBe(opener)
})
