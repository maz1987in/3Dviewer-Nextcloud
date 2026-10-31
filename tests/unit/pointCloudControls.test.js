/**
 * The tools panel's controls for a scan: what it is coloured by, how big its points are,
 * how much of it is shown, and the tools that are off for it, with why.
 */
const { loadSfc, mountSfc } = require('./helpers/mountSfc.js')
const vue = require('vue')

const MODULES = {
	'./FileUpControl.vue': { default: loadSfc('FileUpControl', { '../pointclouds/upValues.js': require('../../src/pointclouds/upValues.js') }) },
	'../pointclouds/colourBy.js': require('../../src/pointclouds/colourBy.js'),
	'../pointclouds/budget.js': require('../../src/pointclouds/budget.js'),
	'../pointclouds/limits.js': require('../../src/pointclouds/limits.js'),
	'../pointclouds/unavailable.js': require('../../src/pointclouds/unavailable.js'),
}

const meta = (attributes = {}, counts = { count: 1000, total: 1000 }) => ({
	format: 'xyz',
	...counts,
	attributes: { color: false, intensity: false, classification: false, ...attributes },
})

const mount = (props) => mountSfc('PointCloudControls', { colourBy: 'height', pointSize: 2, upState: null, ...props }, MODULES)
const byId = (id) => document.getElementById(id)

afterEach(() => document.body.replaceChildren())

test('a bare cloud is coloured by height or a single colour only', () => {
	mount({ meta: meta() })

	const select = byId('tdv-colour-by')
	expect(document.querySelector('label[for="tdv-colour-by"]').textContent.trim()).toBe('Colour by')
	expect([...select.options].map((o) => [o.value, o.textContent.trim()])).toEqual([['height', 'Height'], ['single', 'Single colour']])
	expect(select.value).toBe('height')
})

test('a cloud with everything offers everything', () => {
	mount({ meta: meta({ color: true, intensity: true, classification: true }), colourBy: 'file' })

	expect([...byId('tdv-colour-by').options].map((o) => o.textContent.trim()))
		.toEqual(['File colours', 'Height', 'Intensity', 'Classification', 'Single colour'])
	expect(byId('tdv-colour-by').value).toBe('file')
})

test('choosing a colour emits it', async () => {
	const { events } = mount({ meta: meta({ intensity: true }) })

	const select = byId('tdv-colour-by')
	select.value = 'intensity'
	select.dispatchEvent(new Event('change'))
	await vue.nextTick()

	expect(events).toEqual([['set-colour-by', ['intensity']]])
})

test('the point size slider says its value and emits a number', async () => {
	const { events } = mount({ meta: meta() })

	const slider = byId('tdv-point-size')
	expect(document.querySelector('label[for="tdv-point-size"]').textContent.trim()).toBe('Point size')
	expect(slider.getAttribute('type')).toBe('range')
	expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['1', '10', '0.5', '2'])
	expect(slider.getAttribute('aria-valuetext')).toBe('2 px')
	slider.value = '3.5'
	slider.dispatchEvent(new Event('input'))
	await vue.nextTick()

	expect(events).toEqual([['set-point-size', [3.5]]])
})

test('a thinned cloud says how much of it is shown', () => {
	mount({ meta: meta({}, { count: 250, total: 1000 }) })

	const note = document.querySelector('[role="status"]')
	expect(note.textContent.trim()).toBe('Showing 1 in 4 points')
})

test('a whole cloud says nothing about thinning', () => {
	mount({ meta: meta() })

	expect(document.querySelector('[role="status"]')).toBeNull()
})

test('the tools that are off are listed, each with the id its control points at', () => {
	mount({ meta: meta() })

	const items = ['printCheck', 'shading', 'exploded', 'compare', 'export'].map((key) => byId(`tdv-unavailable-${key}`))
	expect(items.every(Boolean)).toBe(true)
	expect(items[0].textContent.trim()).toBe('Print check: A scan is a cloud of points with no closed surface, so there\'s nothing to check for printing.')
	expect(items[4].textContent.trim()).toBe('Export: Export saves meshes, and a scan is points.')
	const list = items[0].closest('ul')
	expect(document.getElementById(list.getAttribute('aria-labelledby')).textContent.trim()).toBe('Not available for scans')
})

test('which way is up, once the server has answered, and its choice passed on', async () => {
	const { events, props } = mount({ meta: meta() })
	expect(byId('tdv-up')).toBeNull()

	props.upState = { up: '+z', saved: null, defaultUp: '+z', canEdit: true, status: '' }
	await vue.nextTick()
	const select = byId('tdv-up')
	select.value = '-y'
	select.dispatchEvent(new Event('change'))
	await vue.nextTick()

	expect(events).toEqual([['set-up', ['-y']]])
})
