/**
 * The tools panel's section for a splat: how much of it is shown, which way is up, and
 * the tools that are off for it, with why.
 */
const { loadSfc, mountSfc } = require('./helpers/mountSfc.js')

const MODULES = {
	'./FileUpControl.vue': { default: loadSfc('FileUpControl', { '../pointclouds/upValues.js': require('../../src/pointclouds/upValues.js') }) },
	'../splats/splatBudget.js': require('../../src/splats/splatBudget.js'),
	'../splats/unavailable.js': require('../../src/splats/unavailable.js'),
}

const mount = (props) => mountSfc('SplatControls', { meta: { format: 'spz', count: 1000, total: 1000 }, upState: null, ...props }, MODULES)

afterEach(() => document.body.replaceChildren())

test('every tool that is off has its line, under its heading', () => {
	mount()

	const { SPLAT_UNAVAILABLE } = require('../../src/splats/unavailable.js')
	const heading = document.getElementById('tdv-unavailable-heading')
	expect(heading.textContent.trim()).toBe('Not available for splats')
	for (const { key, label, note } of SPLAT_UNAVAILABLE) {
		expect(document.getElementById(`tdv-unavailable-${key}`).textContent.trim()).toBe(`${label}: ${note}`)
	}
})

test('a thinned splat says how much is shown', () => {
	mount({ meta: { format: 'spz', count: 1000, total: 4000 } })

	const status = document.querySelector('[role="status"]')
	expect(status.textContent.trim()).toBe('Showing 1 in 4 splats')
})

test('a whole splat says nothing about thinning', () => {
	mount()

	expect(document.querySelector('[role="status"]')).toBeNull()
})

test('which way is up, when the file\'s state is known', () => {
	mount({ upState: { up: '-y', defaultUp: '+y', canEdit: true, status: 'idle' } })

	expect(document.getElementById('tdv-up')).not.toBeNull()
})
