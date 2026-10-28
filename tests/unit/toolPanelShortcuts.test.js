/**
 * A key printed beside a row is a key that does something.
 *
 * "Viewer Options.dc.html" draws each tool row with its shortcut on the trailing edge — R
 * for reset view, F for fit, M, S, P, and ? for help. The app implemented two, T and Escape,
 * so copying the row as drawn would have printed five keys that do nothing: wrong in the one
 * way a label can be wrong without anyone noticing, since the only way to find out is to
 * press the key and watch nothing happen.
 *
 * One table answers both questions. The panel renders its hints from it and its keydown
 * handler dispatches from it, so a hint without a shortcut is not something that can be
 * written — which is a better guarantee than two lists checked against each other.
 */

const { readFileSync } = require('fs')
const { join } = require('path')
const { TOOL_SHORTCUTS, isShortcutBlocked, shortcutFor, shortcutKey, hasOpenModal } = require('../../src/utils/toolShortcuts.js')

const PANEL = readFileSync(
	join(__dirname, '..', '..', 'src', 'components', 'SlideOutToolPanel.vue'),
	'utf8',
)

describe('the shortcut table', () => {
	it('covers the keys the sheet prints, and L for a link to the view', () => {
		expect(TOOL_SHORTCUTS.map((s) => s.key)).toEqual(['r', 'f', 'm', 's', 'p', 'l', '?'])
	})

	it('copies a link to the view on L', () => {
		expect(shortcutFor({ key: 'l', target: document.body })).toBe('copy-view-link')
	})

	it('prints the L hint beside the copy-link row', () => {
		expect(PANEL).toContain("shortcutKey('copy-view-link')")
	})

	it('names an event for each, and no event twice', () => {
		const events = TOOL_SHORTCUTS.map((s) => s.event)
		expect(events.every(Boolean)).toBe(true)
		expect(new Set(events).size).toBe(events.length)
	})

	it('is what the panel emits, so every shortcut reaches a handler', () => {
		const declared = /emits: \[([\s\S]*?)\]/.exec(PANEL)[1]
		for (const { event } of TOOL_SHORTCUTS) {
			expect(declared).toContain(`'${event}'`)
		}
	})
})

describe('what a keypress resolves to', () => {
	/**
	 * A keydown as the browser delivers it.
	 *
	 * @param {string} key - `event.key`
	 * @param {object} [overrides] - anything else to set on the event
	 * @return {object} the event
	 */
	const keydown = (key, overrides = {}) => ({ key, target: document.body, ...overrides })

	it.each(TOOL_SHORTCUTS.map((s) => [s.key, s.event]))('%s resolves to %s', (key, event) => {
		expect(shortcutFor(keydown(key))).toBe(event)
	})

	it('takes the key whichever case it arrives in', () => {
		expect(shortcutFor(keydown('R'))).toBe('reset-view')
	})

	it.each(['input', 'textarea', 'select'])('ignores a key typed into a <%s>', (tag) => {
		expect(shortcutFor(keydown('r', { target: document.createElement(tag) }))).toBeNull()
	})

	it('ignores a key typed into an editable element', () => {
		const editable = document.createElement('div')
		editable.setAttribute('contenteditable', 'true')
		expect(shortcutFor(keydown('r', { target: editable }))).toBeNull()
	})

	it.each(['ctrlKey', 'metaKey', 'altKey'])('ignores the key when %s is held', (modifier) => {
		// Cmd-P prints the page, Ctrl-S saves it. A single-letter shortcut that fires on
		// those takes the browser's own command away from the user.
		expect(shortcutFor(keydown('p', { [modifier]: true }))).toBeNull()
	})

	it.each([' ', 'Enter'])('leaves %j alone on a button, so a focused switch gets its click', (key) => {
		// Space and Enter are how a keyboard user operates the panel's own buttons and
		// switches. If either resolved to a shortcut, pressing it on a focused row would
		// operate the row and fire the shortcut as well.
		const button = document.createElement('button')
		button.setAttribute('role', 'switch')
		expect(shortcutFor(keydown(key, { target: button }))).toBeNull()
		expect(TOOL_SHORTCUTS.map((s) => s.key)).not.toContain(key)
	})

	it('still takes a letter pressed on a focused button, as it does anywhere outside a field', () => {
		const button = document.createElement('button')
		expect(shortcutFor(keydown('r', { target: button }))).toBe('reset-view')
	})

	it('leaves a key alone for the same reasons the panel\'s own T does', () => {
		// One test, shared: T used to check three tag names of its own and ignore both
		// modifiers and editable elements
		const editable = document.createElement('div')
		editable.setAttribute('contenteditable', 'true')
		expect(isShortcutBlocked(keydown('t', { target: editable }))).toBe(true)
		expect(isShortcutBlocked(keydown('t', { ctrlKey: true }))).toBe(true)
		expect(isShortcutBlocked(keydown('t', { target: document.createElement('input') }))).toBe(true)
		expect(isShortcutBlocked(keydown('t', { target: document.createElement('button') }))).toBe(false)
		expect(PANEL).toContain('isShortcutBlocked(event)')
	})

	it('leaves a key pressed inside a modal dialog to the dialog', () => {
		const dialog = document.createElement('div')
		dialog.setAttribute('role', 'dialog')
		dialog.setAttribute('aria-modal', 'true')
		const button = document.createElement('button')
		dialog.appendChild(button)
		document.body.appendChild(dialog)
		expect(isShortcutBlocked(keydown('s', { target: button }))).toBe(true)
		expect(shortcutFor(keydown('s', { target: button }))).toBeNull()
		dialog.remove()
	})

	it('leaves every key alone while a modal dialog is open, wherever the focus has gone', () => {
		const dialog = document.createElement('div')
		dialog.setAttribute('role', 'dialog')
		dialog.setAttribute('aria-modal', 'true')
		document.body.appendChild(dialog)
		expect(isShortcutBlocked(keydown('s', { target: document.body }))).toBe(true)
		expect(shortcutFor(keydown('r', { target: document.body }))).toBeNull()
		dialog.remove()
		expect(shortcutFor(keydown('r', { target: document.body }))).not.toBeNull()
	})

	it('lets a modal keep the one shortcut that closes it: ? closes Help', () => {
		const dialog = document.createElement('div')
		dialog.setAttribute('role', 'dialog')
		dialog.setAttribute('aria-modal', 'true')
		dialog.dataset.shortcut = 'toggle-help'
		const button = document.createElement('button')
		dialog.appendChild(button)
		document.body.appendChild(dialog)
		expect(shortcutFor(keydown('?', { target: button }))).toBe('toggle-help')
		expect(shortcutFor(keydown('s', { target: button }))).toBeNull()
		dialog.remove()
		const HELP = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'HelpPanel.vue'), 'utf8')
		expect(HELP).toContain('data-shortcut="toggle-help"')
	})

	it('leaves Escape to an open modal dialog: the tools panel behind it stays open', () => {
		const dialog = document.createElement('div')
		dialog.setAttribute('aria-modal', 'true')
		document.body.appendChild(dialog)
		expect(hasOpenModal()).toBe(true)
		dialog.remove()
		expect(hasOpenModal()).toBe(false)
		expect(PANEL).toContain("event.key === 'Escape' && isOpen.value && !hasOpenModal()")
	})

	it('leaves a key it does not know alone', () => {
		expect(shortcutFor(keydown('q'))).toBeNull()
	})
})

describe('the help panel', () => {
	const HELP = readFileSync(
		join(__dirname, '..', '..', 'src', 'components', 'HelpPanel.vue'),
		'utf8',
	)

	/*
	 * The third place a shortcut could be described, and the one that goes stale quietest:
	 * it listed T and Escape while the panel offered nothing else, and would have kept
	 * listing exactly those two after six more were added.
	 */
	it('lists the shortcuts from the same table rather than its own copy', () => {
		expect(HELP).toContain('TOOL_SHORTCUTS')
		expect(HELP).toContain('v-for="shortcut in toolShortcuts"')
	})

	it('says what each one does', () => {
		const labels = /shortcutLabels: \{([\s\S]*?)\n\t\t\t\}/.exec(HELP)[1]
		for (const { event } of TOOL_SHORTCUTS) {
			expect(labels).toContain(`'${event}':`)
		}
	})
})

describe('what the panel prints', () => {
	it('gives the key for a row that has one, in the case it is written on a keyboard', () => {
		expect(shortcutKey('reset-view')).toBe('R')
		expect(shortcutKey('toggle-help')).toBe('?')
	})

	it('gives nothing for a row that has none, so the hint is simply absent', () => {
		expect(shortcutKey('toggle-grid')).toBe('')
	})

	it('is rendered from the table rather than typed into the markup', () => {
		const hardcoded = [...PANEL.matchAll(/class="tool-hint"[^>]*>\s*([A-Za-z?])\s*</g)].map((m) => m[0])
		expect(hardcoded).toEqual([])
		expect(PANEL).toContain('shortcutKey(')
	})
})
