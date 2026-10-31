/**
 * The Units control: a select for people who can edit the file, the unit and where it
 * comes from for everyone else, and a status line for saving.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const sourceUnits = require('../../src/utils/sourceUnits.js')
const vue = require('vue')

const MODULES = { '../utils/sourceUnits.js': sourceUnits }

function state(overrides = {}) {
	return { millimetres: 1, key: 'mm', suffix: 'mm', source: 'default', changeable: true, canEdit: true, status: '', ...overrides }
}

function mount(unit) {
	return mountSfc('FileUnitControl', { unit, controlId: 'stats-file-unit', selectClass: 'stats-unit-select' }, MODULES)
}

const text = () => document.body.textContent.replace(/\s+/g, ' ').trim()

afterEach(() => document.body.replaceChildren())

test('an editor gets a labelled select of the six units, the one in force selected', () => {
	mount(state({ key: 'in', millimetres: 25.4, suffix: 'in', source: 'chosen' }))
	const select = document.querySelector('select')

	expect(select.id).toBe('stats-file-unit')
	expect(select.classList.contains('stats-unit-select')).toBe(true)
	expect(document.querySelector('label[for="stats-file-unit"]').textContent.trim()).toBe('File units')
	expect([...select.options].map((o) => [o.value, o.textContent.trim()])).toEqual([
		['mm', 'Millimetres'], ['cm', 'Centimetres'], ['m', 'Metres'], ['in', 'Inches'], ['ft', 'Feet'], ['us-ft', 'US survey feet'],
	])
	expect(select.value).toBe('in')
	const hint = document.getElementById(select.getAttribute('aria-describedby').split(' ').pop())
	expect(hint.textContent.trim()).toBe('Saved with the file for everyone who can open it')
})

test('an editor sees where the unit comes from too, as part of the select\'s description', () => {
	mount(state())
	const select = document.querySelector('select')
	const description = select.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent.trim())

	expect(description).toEqual(["Assumed, because this file doesn't record a unit", 'Saved with the file for everyone who can open it'])
	document.body.replaceChildren()

	mount(state({ key: 'in', millimetres: 25.4, suffix: 'in', source: 'chosen' }))
	expect(text()).toContain('Set for this file')
})

test('choosing a unit asks for it to be set', () => {
	const { events } = mount(state())
	const select = document.querySelector('select')
	select.value = 'in'
	select.dispatchEvent(new Event('change'))

	expect(events).toEqual([['set', ['in']]])
})

test('a select whose save fails goes back to the unit in force', async () => {
	const { props } = mount(state())
	const select = document.querySelector('select')
	select.value = 'ft'
	select.dispatchEvent(new Event('change'))
	props.unit = state({ status: 'saving' })
	await vue.nextTick()
	props.unit = state({ status: 'failed' })
	await vue.nextTick()

	expect(select.value).toBe('mm')
	expect(document.querySelector('[role="status"]').textContent.trim()).toBe("Couldn't save the units")
})

test('without the rights it says the unit and that it was set for this file', () => {
	mount(state({ canEdit: false, key: 'in', millimetres: 25.4, suffix: 'in', source: 'chosen' }))

	expect(document.querySelector('select')).toBeNull()
	expect(text()).toContain('Inches')
	expect(text()).toContain('Set for this file')
})

test('a unit the file records says so, and one with no name shows its suffix', () => {
	mount(state({ canEdit: false, changeable: false, key: 'm', millimetres: 1000, suffix: 'm', source: 'file' }))
	expect(text()).toContain('Metres')
	expect(text()).toContain('From the file')
	document.body.replaceChildren()

	mount(state({ canEdit: false, changeable: false, key: null, millimetres: 0.001, suffix: 'µm', source: 'file' }))
	expect(text()).toContain('µm')
})

test('an assumed unit says why', () => {
	mount(state({ canEdit: false }))
	expect(text()).toContain("Assumed, because this file doesn't record a unit")
})

test('saving is announced', async () => {
	const { props } = mount(state())
	const status = document.querySelector('[role="status"]')
	expect(status.textContent.trim()).toBe('')

	props.unit = state({ status: 'saving' })
	await vue.nextTick()
	expect(status.textContent.trim()).toBe('Saving…')

	props.unit = state({ status: 'saved' })
	await vue.nextTick()
	expect(status.textContent.trim()).toBe('Saved')
})
