/**
 * "Which way is up" in the scan's controls: a choice for those who can edit the file,
 * shown read-only to everyone else.
 */
const { mountSfc } = require('./helpers/mountSfc.js')
const vue = require('vue')

const MODULES = { '../pointclouds/upValues.js': require('../../src/pointclouds/upValues.js') }
const state = (patch = {}) => ({ up: '+z', saved: null, defaultUp: '+z', canEdit: true, status: '', ...patch })
const byId = (id) => document.getElementById(id)

afterEach(() => document.body.replaceChildren())

test('an editor chooses which way is up, saved for everyone', async () => {
	const { events } = mountSfc('FileUpControl', { state: state() }, MODULES)

	const select = byId('tdv-up')
	expect(document.querySelector('label[for="tdv-up"]').textContent.trim()).toBe('Which way is up')
	expect([...select.options].map((o) => [o.value, o.textContent.trim()])).toEqual([['+y', '+Y up'], ['-y', '−Y up'], ['+z', '+Z up'], ['-z', '−Z up']])
	expect(select.value).toBe('+z')
	expect(byId(select.getAttribute('aria-describedby')).textContent.trim()).toBe('Saved with the file for everyone who can see it.')

	select.value = '-y'
	select.dispatchEvent(new Event('change'))
	await vue.nextTick()

	expect(events).toEqual([['set-up', ['-y']]])
})

test('saving is announced', () => {
	mountSfc('FileUpControl', { state: state({ status: 'saving' }) }, MODULES)

	expect(document.querySelector('[role="status"]').textContent.trim()).toBe('Saving…')
})

test('everyone else sees it, and why they can\'t change it', () => {
	mountSfc('FileUpControl', { state: state({ canEdit: false, up: '-z' }) }, MODULES)

	expect(byId('tdv-up')).toBeNull()
	const control = document.querySelector('.file-up-control')
	expect(control.textContent).toContain('Which way is up')
	expect(control.textContent).toContain('−Z up')
	expect(control.textContent).toContain('Only people who can edit this file can change this.')
})
