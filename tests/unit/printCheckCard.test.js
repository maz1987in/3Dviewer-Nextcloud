/**
 * The Print check card: what it shows for a mesh, a toolpath and a point cloud, and that
 * every control has a name and tells the viewer what changed.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const printers = require('../../src/printCheck/printers.js')
const formatDuration = require('../../src/printCheck/formatDuration.js')
const repairText = require('../../src/printCheck/repairText.js')

jest.mock('@nextcloud/l10n', () => ({ translate: (_app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, k) => String(vars[k])) }), { virtual: true })

const MODULES = {
	'./ViewerIcon.vue': { default: { name: 'ViewerIcon', props: ['name', 'size'], template: '<i />' } },
	'../printCheck/printers.js': printers,
	'../printCheck/formatDuration.js': formatDuration,
	'../printCheck/repairText.js': repairText,
	'./FileUnitControl.vue': { default: { name: 'FileUnitControl', props: ['unit', 'controlId', 'selectClass'], emits: ['set'], template: '<div class="file-unit-stub" :data-key="unit.key" @click="$emit(\'set\', \'in\')" />' } },
}

function meshState(overrides = {}) {
	return {
		kind: 'mesh',
		fileUnit: { millimetres: 1, key: 'mm', suffix: 'mm', source: 'default', changeable: true, canEdit: true, status: '' },
		settings: { ...printers.PRINT_CHECK_DEFAULTS, custom: { ...printers.PRINT_CHECK_DEFAULTS.custom } },
		up: 'y',
		fit: { size: { width: 10, depth: 10, height: 10 }, fits: true, over: { width: 0, depth: 0, height: 0 }, fitsTurned: true },
		overhang: { share: 0.123 },
		closed: 'closed',
		openParts: 0,
		estimate: { grams: 0.96224, metres: 0.32262 },
		slicerSummary: null,
		thickness: { state: 'idle', progress: 0, share: 0, sampled: false, warnOpen: false },
		problems: { state: 'idle', report: null },
		repair: { state: 'idle', progress: 0, summary: null, after: null, highlight: true, holeLimit: 500, busy: false, canSave: false },
		hoverMm: null,
		...overrides,
	}
}

/** What the mesh analysis reports for a model with nothing wrong, with changes. */
function report(changes = {}) {
	return {
		meshes: 1, triangles: 12, vertices: 36, joinableVertices: 0, nearVertices: 0, degenerateFaces: 0, duplicateFaces: 0, openEdges: 0,
		holes: { count: 0, fillable: 0, tooLarge: 0, complex: 0 }, nonManifoldEdges: 0, flippedFaces: 0, twistedEdges: 0, insideOutParts: 0,
		parts: 1, volume: 1000, area: 600, closed: true, fixable: false, ...changes,
	}
}

const SUMMARY = {
	joinedVertices: 1204, removedDegenerateFaces: 0, removedDuplicateFaces: 0, turnedFaces: 36, turnedParts: 0, filledHoles: 3, addedFaces: 9,
	leftTooLarge: 0, leftComplex: 0, leftUnfillable: 0,
}

const button = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)

function mount(state) {
	return mountSfc('PrintCheckCard', { state }, MODULES)
}

const text = () => document.body.textContent.replace(/\s+/g, ' ')

afterEach(() => document.body.replaceChildren())

test('shows the file\'s units, where the old note was, and passes a choice on', () => {
	const { events } = mount(meshState())
	expect(text()).not.toContain('Sizes assume millimetres')
	const control = document.querySelector('.file-unit-stub')
	expect(control.dataset.key).toBe('mm')
	control.click()
	expect(events).toContainEqual(['set-unit', ['in']])
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

test('says what is still being measured, and when it could not be', () => {
	mount(meshState({ fit: null, overhang: null, closed: 'checking', estimate: null }))
	expect(text().match(/Measuring…/g)).toHaveLength(2)
	expect(text()).toContain('Checking…')
	expect(text()).not.toContain('Fits the build volume')
	document.body.replaceChildren()

	mount(meshState({ fit: null, overhang: null, measureFailed: true }))
	expect(text().match(/Could not measure the model/g)).toHaveLength(2)
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

test('a G-code file shows no units: it shows no sizes', () => {
	mount(meshState({ kind: 'gcode', slicerSummary: { slicer: null, printSeconds: 60, filamentMm: null, filamentGrams: null } }))
	expect(document.querySelector('.file-unit-stub')).toBeNull()
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

describe('mesh problems and repair', () => {
	test('says it is checking, and when it could not', () => {
		mount(meshState({ problems: { state: 'checking', report: null } }))
		expect(text()).toContain('Mesh problems')
		expect(text().match(/Checking…/g)).toHaveLength(1)
		document.body.replaceChildren()
		mount(meshState({ closed: 'closed', problems: { state: 'error', report: null } }))
		expect(text()).toContain('Could not check the mesh for problems')
		expect(button('Repair')).toBeUndefined()
	})

	test('on a large model the check waits to be asked for', () => {
		const { events } = mount(meshState({ problems: { state: 'waiting', report: null } }))
		expect(text()).toContain('On a large model this is checked when you ask.')
		expect(button('Repair')).toBeUndefined()
		button('Check the mesh for problems').click()
		expect(events).toEqual([['repair', ['check']]])
	})

	test('a model with nothing wrong says so and offers no repair', () => {
		mount(meshState({ problems: { state: 'done', report: report({ joinableVertices: 28 }) } }))
		expect(text()).toContain('No problems found')
		expect(text()).toContain('28 vertices repeat another one\'s place, as in most STL files')
		expect(button('Repair')).toBeUndefined()
	})

	test('lists each problem in plain words, and offers Repair', () => {
		const { events } = mount(meshState({
			closed: 'open',
			problems: {
				state: 'done',
				report: report({
					closed: false, fixable: true, openEdges: 12, holes: { count: 3, fillable: 3, tooLarge: 0, complex: 0 }, flippedFaces: 36, insideOutParts: 1,
					degenerateFaces: 2, duplicateFaces: 1, nearVertices: 4, nonManifoldEdges: 4, twistedEdges: 1,
				}),
			},
		}))
		const lines = [...document.querySelectorAll('.print-check-lines li')].map((li) => li.textContent.trim())
		expect(lines).toEqual([
			'3 holes, open edges: 12',
			'36 faces turned the wrong way',
			'1 part is inside out',
			'2 faces with no area',
			'1 duplicate face',
			'4 places where vertices almost meet but do not',
			'4 edges shared by more than two faces',
			'1 edge where the faces on both sides cannot face the same way',
		])
		expect(text()).not.toContain('No problems found')
		button('Repair').click()
		expect(events).toEqual([['repair', ['run']]])
	})

	test('a single hole reads as one', () => {
		mount(meshState({ problems: { state: 'done', report: report({ closed: false, fixable: true, openEdges: 4, holes: { count: 1, fillable: 1, tooLarge: 0, complex: 0 } }) } }))
		expect(text()).toContain('1 hole, open edges: 4')
	})

	test('a repair shows progress and Cancel, and no Repair button meanwhile', () => {
		const { events } = mount(meshState({
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: { state: 'running', progress: 0.4, summary: null, after: null, highlight: true, holeLimit: 500 },
		}))
		const bar = [...document.querySelectorAll('progress')].find((element) => element.getAttribute('aria-label') === 'Repairing the mesh')
		expect(bar.value).toBeCloseTo(0.4, 9)
		expect(button('Repair')).toBeUndefined()
		button('Cancel').click()
		expect(events).toEqual([['repair', ['cancel']]])
	})

	test('a repair that failed or was cancelled says so, and can be run again', () => {
		const problems = { state: 'done', report: report({ fixable: true }) }
		mount(meshState({ problems, repair: { state: 'error', progress: 0, summary: null, after: null, highlight: true, holeLimit: 500 } }))
		expect(text()).toContain('Could not repair the model')
		expect(button('Repair')).toBeDefined()
		document.body.replaceChildren()
		mount(meshState({ problems, repair: { state: 'cancelled', progress: 0, summary: null, after: null, highlight: true, holeLimit: 500 } }))
		expect(text()).toContain('Repair cancelled')
		expect(button('Repair')).toBeDefined()
	})

	test('a finished repair says what it did, one line each', () => {
		mount(meshState({
			closed: 'closed',
			problems: { state: 'done', report: report({ fixable: true, flippedFaces: 36 }) },
			repair: { state: 'done', progress: 1, summary: SUMMARY, after: report(), highlight: true, holeLimit: 500 },
		}))
		const lines = [...document.querySelectorAll('.print-check-lines li')].map((li) => li.textContent.trim())
		expect(lines).toEqual(['Joined 1,204 vertices', 'Turned 36 faces the right way', 'Filled 3 holes'])
		expect(text()).toContain('The repaired model is closed.')
		expect(text()).not.toContain('Left as it is')
		// Done: no second Repair, but a way back
		expect(button('Repair')).toBeUndefined()
		expect(button('Undo repair')).toBeDefined()
		// The problems found before are not listed again
		expect(text()).not.toContain('faces turned the wrong way')
	})

	test('says what is left and why', () => {
		mount(meshState({
			closed: 'open',
			openParts: 1,
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: {
				state: 'done',
				progress: 1,
				summary: { ...SUMMARY, turnedParts: 1, removedDuplicateFaces: 5, removedDegenerateFaces: 1, leftTooLarge: 1, leftComplex: 2, leftUnfillable: 1 },
				after: report({ closed: false, nonManifoldEdges: 4, twistedEdges: 2, openEdges: 600, holes: { count: 4, fillable: 0, tooLarge: 1, complex: 2 } }),
				highlight: true,
				holeLimit: 500,
			},
		}))
		const body = text()
		expect(body).toContain('Turned 1 part right side out')
		expect(body).toContain('Removed 5 duplicate faces')
		expect(body).toContain('Removed 1 face with no area')
		expect(body).toContain('Left as it is:')
		expect(body).toContain('1 hole is too large to fill (over 500 edges)')
		expect(body).toContain('2 holes touch themselves, so they were left as they are')
		expect(body).toContain('1 hole could not be filled without a guess, so it was left as it is')
		expect(body).toContain('4 edges are shared by more than two faces')
		expect(body).toContain('2 edges have faces on both sides that cannot face the same way')
		expect(body).not.toContain('The repaired model is closed.')
		// The card's own verdict follows the re-run closed check
		expect(body).toContain('Needs a closed model: 1 part has holes')
	})

	test('offers the file as a download, and next to the model only where it is allowed', async () => {
		const repaired = { problems: { state: 'done', report: report({ fixable: true }) }, repair: { state: 'done', progress: 1, summary: SUMMARY, after: report(), highlight: true, holeLimit: 500 } }
		const first = mount(meshState(repaired))
		expect(button('Download repaired STL')).toBeDefined()
		expect(button('Save repaired STL next to the model')).toBeUndefined()
		button('Download repaired STL').click()
		expect(first.events).toEqual([['repair', ['download', 'stl']]])
		document.body.replaceChildren()

		const second = mount(meshState({ ...repaired, repair: { ...repaired.repair, canSave: true } }))
		const format = document.querySelector('#print-check-repair-format')
		format.value = '3mf'
		format.dispatchEvent(new Event('change'))
		await Promise.resolve()
		button('Save repaired 3MF next to the model').click()
		button('Download repaired 3MF').click()
		expect(second.events).toEqual([['repair', ['save', '3mf']], ['repair', ['download', '3mf']]])
	})

	test('while a file is made its buttons do nothing, and say they are busy', () => {
		const { events } = mount(meshState({
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: { state: 'done', progress: 1, summary: SUMMARY, after: report(), highlight: true, holeLimit: 500, busy: true, canSave: true },
		}))
		for (const label of ['Save repaired STL next to the model', 'Download repaired STL']) {
			expect(button(label).getAttribute('aria-disabled')).toBe('true')
			expect(button(label).getAttribute('aria-busy')).toBe('true')
			button(label).click()
		}
		expect(events).toEqual([])
	})

	test('what was filled can be shown or hidden, and the repair undone', () => {
		const { events } = mount(meshState({
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: { state: 'done', progress: 1, summary: SUMMARY, after: report(), highlight: true, holeLimit: 500 },
		}))
		const box = document.querySelector('#print-check-repair-highlight')
		expect(box.checked).toBe(true)
		expect(document.querySelector('label[for="print-check-repair-highlight"]').textContent).toBe('Show what was filled in green')
		box.checked = false
		box.dispatchEvent(new Event('change'))
		button('Undo repair').click()
		expect(events).toEqual([['repair', ['highlight', false]], ['repair', ['undo']]])
	})

	test('a repair that filled nothing has nothing to show in green', () => {
		mount(meshState({
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: { state: 'done', progress: 1, summary: { ...SUMMARY, filledHoles: 0, addedFaces: 0 }, after: report(), highlight: true, holeLimit: 500 },
		}))
		expect(document.querySelector('#print-check-repair-highlight')).toBeNull()
	})

	test('the repair controls are all labelled', () => {
		mount(meshState({
			problems: { state: 'done', report: report({ fixable: true }) },
			repair: { state: 'done', progress: 1, summary: SUMMARY, after: report(), highlight: true, holeLimit: 500, busy: false, canSave: true },
		}))
		for (const control of document.querySelectorAll('input, select')) {
			expect(document.querySelector(`label[for="${control.id}"]`) || control.getAttribute('aria-label')).toBeTruthy()
		}
		expect([...document.querySelectorAll('button')].every((b) => b.getAttribute('type') === 'button')).toBe(true)
	})

	test('no repair section for a toolpath or a scan', () => {
		mount(meshState({ kind: 'gcode', slicerSummary: { slicer: null, printSeconds: 60, filamentMm: null, filamentGrams: null } }))
		expect(text()).not.toContain('Mesh problems')
		document.body.replaceChildren()
		mount(meshState({ kind: 'points', overhang: null, closed: null, estimate: null }))
		expect(text()).not.toContain('Mesh problems')
	})
})
