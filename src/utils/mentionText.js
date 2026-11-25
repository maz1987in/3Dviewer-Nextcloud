/**
 * Typing a mention: how a text that names people is written in the field and how it is
 * stored, and how the @ that starts one is found.
 *
 * The server stores a person by their id (`@alice`, or `@"alice smith"` when the id cannot be
 * written bare), so a mention keeps naming the same account when they are renamed. People
 * read and type display names: while a note is edited, the field shows `@Alice Smith`, and
 * what is stored is put back together from it. Both directions use the names the field has
 * been told about — people it offered, and people the text mentions already.
 */

import { expandMentions } from './noteReview.js'

/** The longest text the server accepts, in characters (NotePayload::MAX_TEXT_CHARS) */
export const MAX_TEXT_CHARS = 2000

/** The longest id the server reads: NoteMentions::PATTERN */
const MAX_ID_CHARS = 64

/** How many characters after the @ are searched for */
const MAX_QUERY_CHARS = 64

/** An id that can follow an @ without quotes: what NoteMentions reads as a bare id */
const BARE_ID = /^[A-Za-z0-9_\-@.']+$/

/** A character that cannot be told from a letter in a name: a word continues through it */
const WORD = '\\p{L}\\p{N}_'

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {string} id - a user id
 * @return {boolean} whether a mention of this id can be written at all: the server's quoted
 *   form holds any id but one with a quote or a line break in it
 */
export const canMention = (id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_CHARS && !/["\r\n]/.test(id)

/**
 * @param {string} id - a user id that canMention()
 * @return {string} the mention as it is stored: `@id` when that reads back as the id, `@"id"` when it would not
 */
export const mentionToken = (id) => (BARE_ID.test(id) ? `@${id}` : `@"${id}"`)

/**
 * The stored text as the field shows it: every mention of a person the field knows is their name.
 *
 * @param {string} stored - the text as stored
 * @param {?object} names - id => display name
 * @return {string}
 */
export const toDisplay = (stored, names) => expandMentions(stored, names)

/**
 * The text of the field as it is stored: every `@Display Name` of a person the field knows
 * becomes their mention. Longer names are looked for first, so "Sara Ahmed" is not read as
 * "Sara", and the text is read once, so a name that happens to equal another person's id is
 * not turned into a second mention.
 *
 * @param {string} shown - what the field holds
 * @param {?object} names - id => display name of every person the field knows
 * @return {string}
 */
export function toStored(shown, names) {
	const byName = new Map()
	for (const [id, name] of Object.entries(names && typeof names === 'object' ? names : {})) {
		if (typeof name === 'string' && name !== '' && canMention(id) && !byName.has(name)) {
			byName.set(name, id)
		}
	}
	if (byName.size === 0) {
		return shown
	}
	const alternatives = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
	const mention = new RegExp(`(^|[^A-Za-z0-9_])@(${alternatives})(?![${WORD}])`, 'gu')

	return shown.replace(mention, (_whole, before, name) => `${before}${mentionToken(byName.get(name))}`)
}

/**
 * The @ that is being typed after, if the caret is right behind one: an @ at the start of the
 * text or after a space or an opening bracket, and what has been typed since. A space ends
 * it, as it does in Nextcloud's own fields: "@Sara A" searches for "Sara".
 *
 * @param {string} shown - what the field holds
 * @param {number} caret - where the caret is
 * @return {?{start: number, query: string}} where the @ is, and what follows it
 */
export function findTrigger(shown, caret) {
	const before = shown.slice(0, caret)
	const match = new RegExp(`(^|[\\s(])@([^\\s@"]{0,${MAX_QUERY_CHARS}})$`, 'u').exec(before)
	if (!match) {
		return null
	}
	return { start: before.length - match[2].length - 1, query: match[2] }
}

/**
 * Put a person the user picked where the @ was typed.
 *
 * @param {string} shown - what the field holds
 * @param {{start: number}} trigger - from findTrigger
 * @param {number} caret - where the caret is
 * @param {{label: string}} person - who was picked
 * @return {{text: string, caret: number}} the new text of the field and where the caret goes: after the name and the space behind it
 */
export function insertMention(shown, trigger, caret, person) {
	const after = shown.slice(caret)
	const name = `@${person.label}`
	// A space follows the name so typing can go on; one that is there already is the one
	const space = /^\s/.test(after) ? '' : ' '
	return { text: shown.slice(0, trigger.start) + name + space + after, caret: trigger.start + name.length + 1 }
}
