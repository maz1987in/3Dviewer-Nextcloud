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
 * Whether a keypress belongs to something other than the viewer's shortcuts: a key typed
 * into a field, one held with a modifier, or any key while a modal dialog is open.
 *
 * A button is not a field. Enter and Space on a focused button or switch are not in the
 * table, so they reach it as the click they are, and a letter pressed there still works as
 * the shortcut it is.
 *
 * @param {KeyboardEvent} event - the keydown
 * @return {boolean} true when the key is not the viewer's to take
 */
export function isShortcutBlocked(event) {
	return isTyping(event) || openModal() !== null
}

/**
 * @param {KeyboardEvent} event - the keydown
 * @return {boolean} true for a key typed into a field or held with a modifier
 */
function isTyping(event) {
	if (!event || event.ctrlKey || event.metaKey || event.altKey) {
		// Cmd-P prints the page and Ctrl-S saves it. A single-letter shortcut that fires on
		// those takes the browser's own command away from the user.
		return true
	}
	const target = event.target
	return !!target && (TYPING.test(target.tagName) || !!target.isContentEditable
		|| target.getAttribute?.('contenteditable') === 'true')
}

/**
 * A modal dialog has the keyboard while it is open, wherever the focus is: a key is for
 * the dialog, never for a tool behind it. A dialog may name, in `data-shortcut`, the one
 * shortcut that still works, the one that closes it.
 *
 * @return {?HTMLElement} the open modal dialog, if any
 */
function openModal() {
	return typeof document === 'undefined' ? null : document.querySelector('[aria-modal="true"]')
}

/**
 * @return {boolean} true while a modal dialog is open: Escape is the dialog's, too
 */
export function hasOpenModal() {
	return openModal() !== null
}

/**
 * The event a keypress asks for, if any.
 *
 * @param {KeyboardEvent} event - the keydown
 * @return {?string} the event name to emit, or null to let the key through
 */
export function shortcutFor(event) {
	if (isTyping(event)) {
		return null
	}

	const key = String(event.key || '').toLowerCase()
	const shortcut = TOOL_SHORTCUTS.find((entry) => entry.key === key)?.event ?? null
	const modal = openModal()
	return modal && modal.dataset?.shortcut !== shortcut ? null : shortcut
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
