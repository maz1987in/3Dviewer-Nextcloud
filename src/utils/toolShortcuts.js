/**
 * The keyboard shortcuts the tools panel offers, and the hints it prints beside its rows.
 *
 * One table for both. "Viewer Options.dc.html" draws each row with its key on the trailing
 * edge; a hint and a handler kept as two lists drift, and the way this one drifts is silent —
 * a key printed beside a row that does nothing when pressed looks exactly like a key that
 * works, until someone presses it.
 */

/** @type {Array<{key: string, event: string}>} */
export const TOOL_SHORTCUTS = [
	{ key: 'r', event: 'reset-view' },
	{ key: 'f', event: 'fit-to-view' },
	{ key: 'm', event: 'toggle-measurement' },
	{ key: 's', event: 'toggle-stats' },
	{ key: 'p', event: 'take-screenshot' },
	{ key: '?', event: 'toggle-help' },
]

/** Elements that take typed text, where a single letter is a letter and not a command. */
const TYPING = /^(INPUT|TEXTAREA|SELECT)$/

/**
 * The event a keypress asks for, if any.
 *
 * @param {KeyboardEvent} event - the keydown
 * @return {?string} the event name to emit, or null to let the key through
 */
export function shortcutFor(event) {
	if (!event || event.ctrlKey || event.metaKey || event.altKey) {
		// Cmd-P prints the page and Ctrl-S saves it. A single-letter shortcut that fires on
		// those takes the browser's own command away from the user.
		return null
	}

	const target = event.target
	if (target && (TYPING.test(target.tagName) || target.isContentEditable
		|| target.getAttribute?.('contenteditable') === 'true')) {
		return null
	}

	const key = String(event.key || '').toLowerCase()
	return TOOL_SHORTCUTS.find((shortcut) => shortcut.key === key)?.event ?? null
}

/**
 * The hint to print beside the row that emits an event.
 *
 * @param {string} event - the event the row emits
 * @return {string} the key as it is written on a keyboard, or an empty string
 */
export function shortcutKey(event) {
	return TOOL_SHORTCUTS.find((shortcut) => shortcut.event === event)?.key.toUpperCase() ?? ''
}
