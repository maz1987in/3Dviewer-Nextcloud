/**
 * What drawing a thread needs and drawing the notes does not: the time of a reply, and the
 * people the text field is told about. Kept apart from noteReview.js, which loads with every
 * model, because it is only used by the components that open with a note's thread.
 */

/**
 * What the rich text editor needs to draw a mention as a person rather than as an id.
 *
 * @param {?object} names - written id => display name
 * @return {object} id => the editor's description of the person
 */
export function mentionUserData(names) {
	const data = {}
	for (const [id, label] of Object.entries(names && typeof names === 'object' ? names : {})) {
		data[id] = { id, label, source: 'users', icon: 'icon-user' }
	}
	return data
}

/**
 * @param {number} seconds - a Unix timestamp
 * @return {string} the moment in the reader's own locale; empty for a value that is not a time
 */
export function formatNoteTime(seconds) {
	if (!Number.isFinite(seconds) || seconds <= 0) { return '' }
	return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
