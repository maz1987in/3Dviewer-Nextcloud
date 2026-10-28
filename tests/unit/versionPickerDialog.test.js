/**
 * The dialog that lists a file's earlier versions. The viewer fetches the list and hands
 * it in; the dialog shows it, says when there is nothing to show or the list could not be
 * read, and reports which version was picked.
 */
const { nextTick } = require('vue')
const { mountSfc } = require('./helpers/mountSfc.js')

const MODULES = {
	'./ViewerIcon.vue': { default: { name: 'ViewerIcon', props: ['name', 'size'], template: '<i />' } },
	'../composables/useFocusTrap.js': { useFocusTrap: () => ({ activate: jest.fn(), deactivate: jest.fn() }) },
	'../utils/fileVersions.js': { formatVersionDate: (ms) => `date:${ms}` },
}

const VERSIONS = [
	{ id: '2', url: '/v/2', mtime: 2000, size: 2048, label: 'Before the fillet', author: 'alice' },
	{ id: '1', url: '/v/1', mtime: 1000, size: 512, label: null, author: null },
]

function mount(props) {
	return mountSfc('VersionPickerDialog', { versions: [], loading: false, error: false, multiFile: false, ...props }, MODULES)
}

afterEach(() => document.body.replaceChildren())

test('lists the versions it is given, in that order, as buttons', () => {
	mount({ versions: VERSIONS })
	const rows = [...document.querySelectorAll('.version-row')]
	expect(rows.map(row => row.tagName)).toEqual(['BUTTON', 'BUTTON'])
	expect(rows.every(row => row.getAttribute('type') === 'button')).toBe(true)
	expect(rows[0].textContent).toContain('date:2000')
	expect(rows[0].textContent).toContain('2 KB')
	expect(rows[0].textContent).toContain('alice')
	expect(rows[0].textContent).toContain('Before the fillet')
	expect(rows[1].textContent).toContain('date:1000')
})

test('shows the empty state for no versions', () => {
	mount({ versions: [] })
	expect(document.body.textContent).toContain('No earlier versions')
	expect(document.querySelector('.version-row')).toBeNull()
})

test('shows the error state when the list could not be read', () => {
	mount({ error: true })
	expect(document.body.textContent).toContain("Couldn't load the versions")
	expect(document.body.textContent).not.toContain('No earlier versions')
})

test('says it is loading while the list is on its way', () => {
	mount({ loading: true })
	expect(document.body.textContent).toContain('Loading versions…')
})

test('the supporting-files note appears only for multi-file formats', async () => {
	const { props } = mount({ versions: VERSIONS })
	const note = 'Supporting files such as textures are loaded as they are now.'
	expect(document.body.textContent).not.toContain(note)
	props.multiFile = true
	await nextTick()
	expect(document.body.textContent).toContain(note)
})

test('clicking a row picks that version', () => {
	const { events } = mount({ versions: VERSIONS })
	document.querySelectorAll('.version-row')[1].click()
	expect(events).toEqual([['pick', [VERSIONS[1]]]])
})

test('Close and Escape cancel', () => {
	const { events } = mount({ versions: VERSIONS })
	document.querySelector('.version-picker-close').click()
	document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
	expect(events.map(([name]) => name)).toEqual(['cancel', 'cancel'])
})

test('is a labelled modal dialog with a named close button', () => {
	mount({ versions: VERSIONS })
	const dialog = document.querySelector('[role="dialog"]')
	expect(dialog.getAttribute('aria-modal')).toBe('true')
	const title = document.getElementById(dialog.getAttribute('aria-labelledby'))
	expect(title.textContent).toContain('Earlier versions')
	expect(document.querySelector('.version-picker-close').getAttribute('aria-label')).toBe('Close')
	expect(document.querySelector('[aria-live="polite"]')).not.toBeNull()
})

test('closing gives focus back to what had it before the dialog opened', async () => {
	const { useFocusTrap } = require('../../src/composables/useFocusTrap.js')
	const trigger = document.createElement('button')
	trigger.textContent = 'Compare with earlier version'
	document.body.appendChild(trigger)
	trigger.focus()

	const { unmount } = mountSfc('VersionPickerDialog', { versions: VERSIONS }, { ...MODULES, '../composables/useFocusTrap.js': { useFocusTrap } })
	await new Promise((resolve) => setTimeout(resolve, 0))
	expect(document.querySelector('[role="dialog"]').contains(document.activeElement)).toBe(true)

	unmount()
	expect(document.activeElement).toBe(trigger)
})
