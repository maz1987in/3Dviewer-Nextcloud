/**
 * What note review needs that is not drawing or talking to the server: whether a note is
 * resolved, the filter over the list and its counts, how a marker looks once its note is
 * resolved, and how a text that mentions people reads.
 *
 * Kept free of Vue components and of the viewer so it can be tested on its own, and small,
 * because the panel that uses it loads with every model.
 */

import { toRaw } from 'vue'

/** The list filter's choices, in the order they are offered */
export const NOTE_FILTERS = ['all', 'open', 'resolved']

/** How much of its colour a resolved note's marker keeps when resolved notes are shown */
export const DIMMED_OPACITY = 0.3

/**
 * @param {?object} item - an annotation or a measurement as the panel lists it
 * @return {boolean} whether its note has been resolved; a note nobody has resolved, and one
 *   that was never saved, is open
 */
export const isResolved = (item) => item?.meta?.state === 'resolved'

/**
 * @param {object[]} items - every note in the panel, annotations and measurements together
 * @return {{all: number, open: number, resolved: number}} how many notes each filter shows
 */
export function countByState(items) {
	const counts = { all: 0, open: 0, resolved: 0 }
	for (const item of items) {
		counts.all++
		counts[isResolved(item) ? 'resolved' : 'open']++
	}
	return counts
}

/**
 * @param {object} item - a note as the panel lists it
 * @param {string} filter - one of NOTE_FILTERS; anything else shows everything
 * @return {boolean}
 */
export function matchesFilter(item, filter) {
	if (filter === 'open') { return !isResolved(item) }
	if (filter === 'resolved') { return isResolved(item) }
	return true
}

/**
 * How a note's marker is drawn: a resolved note's is hidden until someone asks to see
 * resolved notes, and dimmed while they do.
 *
 * @param {object} item - a note as the panel lists it
 * @param {boolean} showResolved - whether resolved notes' markers are asked for
 * @return {'normal'|'dim'|'hidden'}
 */
export function markerLook(item, showResolved) {
	if (!isResolved(item)) { return 'normal' }
	return showResolved ? 'dim' : 'hidden'
}

/**
 * Draw markers as a look says. Each material's own opacity is remembered the first time it
 * is touched, so going back to normal restores exactly what the marker started with.
 *
 * @param {Array<?object>} objects - Three.js objects of one note: its points, lines and label
 * @param {'normal'|'dim'|'hidden'} look - how to draw them
 */
export function applyMarkerLook(objects, look) {
	for (const entry of objects) {
		if (!entry) { continue }
		// The panel's entries are reactive, and a proxy of a Three.js object is not the object the scene holds
		const object = toRaw(entry)
		object.visible = look !== 'hidden'

		const material = object.material
		if (!material || Array.isArray(material)) { continue }
		material.userData ??= {}
		if (material.userData.tdvBase === undefined) {
			material.userData.tdvBase = { opacity: material.opacity, transparent: material.transparent }
		}
		const base = material.userData.tdvBase
		material.transparent = look === 'dim' ? true : base.transparent
		material.opacity = look === 'dim' ? base.opacity * DIMMED_OPACITY : base.opacity
		material.needsUpdate = true
	}
}

/*
 * The server stores a mention as the person's id — `@alice`, or `@"alice smith"` when the id
 * has a space — and sends, with each text, the name to show for every id it names. This is
 * the same pattern NoteMentions reads on the server: an @ not preceded by a letter, digit or
 * underscore (so an email address is not one), then a quoted or an unquoted id. The first
 * group is the character before the @, which is how "not preceded by" is written without a
 * lookbehind, for the browsers that have none.
 */
const MENTION = /(^|[^A-Za-z0-9_])@(?:"([^"\r\n]{1,64})"|([A-Za-z0-9_\-@.']{1,64}))/g

/**
 * A text cut into what is plain and what is a mention of a person.
 *
 * @param {string} text - a note's or a reply's text, with ids as stored
 * @param {?object} names - written id => display name, as the server sent it; an @ that
 *   names nobody in it is plain text
 * @return {Array<{text: string, mention: boolean}>} the pieces, in order; a mention's text
 *   is `@` and the person's display name
 */
export function segments(text, names) {
	const source = typeof text === 'string' ? text : ''
	const known = names && typeof names === 'object' && !Array.isArray(names) ? names : {}
	const has = (id) => Object.hasOwn(known, id)
	const pieces = []
	let cursor = 0
	const plain = (to) => {
		if (to > cursor) { pieces.push({ text: source.slice(cursor, to), mention: false }) }
		cursor = to
	}

	for (const match of source.matchAll(MENTION)) {
		const quoted = match[2] !== undefined
		let written = quoted ? match[2] : match[3]
		const start = match.index + match[1].length
		let end = match.index + match[0].length
		// An unquoted id swallows the punctuation after it ("@alice."): give it back until it names someone
		while (!quoted && written && !has(written) && /[.'\-@]$/.test(written)) {
			written = written.slice(0, -1)
			end--
		}
		if (!written || !has(written)) { continue }
		plain(start)
		pieces.push({ text: `@${known[written]}`, mention: true })
		cursor = end
	}
	plain(source.length)

	return pieces
}

/**
 * @param {string} text - a note's or a reply's text, with ids as stored
 * @param {?object} names - written id => display name
 * @return {string} the text as people read it: every mention of a known person by display name
 */
export const expandMentions = (text, names) => segments(text, names).map((piece) => piece.text).join('')
