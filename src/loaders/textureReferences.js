/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How a companion a model declares becomes a name to ask for.
 *
 * Mirrors normalise() in lib/Service/ModelDependencyResolver.php. The server serves a
 * companion on a public share only by a name the model declares, so the client must ask
 * for exactly the names the server derives from the same declaration. Change one, change
 * both.
 *
 * Models exported on Windows often name their textures by a path on the author's machine:
 * `C:\Users\anna\textures\wood.jpg`, `file:///C:/textures/wood.jpg`, a UNC path or
 * `/home/anna/wood.jpg`. None of those directories exist here, so such a reference falls
 * back to its file name alone, looked for beside the model. Only the name is used: the
 * directories it names are never followed. A reference with any other scheme (`http:`,
 * `data:`, `blob:`) is not a file beside the model at all.
 *
 * Every check here is a fixed-length test at the start of the string or a single scan,
 * so each is linear in the reference.
 */

/** `C:` and the like. A single letter is never a URL scheme anyone uses. */
const DRIVE_LETTER = /^[a-z]:/i

const FILE_URL = /^file:/i

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * What a reference is trimmed of: the ASCII blanks, and nothing else. String#trim() also
 * strips no-break spaces, a byte-order mark and the Unicode line separators, and PHP's
 * trim() strips NUL instead; one set on both sides keeps the client and the server's
 * resolver reading the same name.
 */
const BLANKS = ' \t\n\r\v\f'

/**
 * A path segment made only of dots and spaces, `...`, `.. ` or `. .`. Windows drops
 * trailing dots and spaces from a name, so storage on a Windows share can read such a
 * segment as `.` or `..`; none is a real folder or file name, so none is followed.
 */
const DOTS_AND_SPACES = /^[. ]+$/

/**
 * Trim the ASCII blanks off both ends. An index scan, linear in the text; a pattern
 * anchored at the end, such as /\s+$/, retries from every blank in V8.
 *
 * @param {string} text - a reference as declared
 * @return {string} the text without leading or trailing ASCII blanks
 */
export function asciiTrim(text) {
	const value = String(text)
	let start = 0
	let end = value.length
	while (start < end && BLANKS.includes(value[start])) {
		start++
	}
	while (end > start && BLANKS.includes(value[end - 1])) {
		end--
	}
	return value.slice(start, end)
}

/**
 * @param {string} text - possibly percent-encoded
 * @return {string} decoded, or as it was when it is not valid encoding
 */
export function percentDecoded(text) {
	try {
		return decodeURIComponent(text)
	} catch {
		return text
	}
}

/**
 * @param {string} ref - a reference as declared
 * @return {boolean} true for a `file:` URL, whose name is percent-encoded
 */
export function isFileUrl(ref) {
	return FILE_URL.test(asciiTrim(ref))
}

/**
 * @param {string} ref - a reference as declared
 * @return {boolean} true when it starts with a URL scheme, `C:` included
 */
export function hasScheme(ref) {
	return SCHEME.test(asciiTrim(ref))
}

/**
 * Whether a reference names a place on some machine's disk rather than a path relative
 * to the model: a drive letter, a leading slash (a UNC path too, once `\` is folded), or a
 * `file:` URL.
 *
 * @param {string} ref - a reference as declared
 * @return {boolean} true for an absolute or `file:` reference
 */
export function isLocalAbsoluteRef(ref) {
	const path = asciiTrim(String(ref).replace(/\\/g, '/'))
	return FILE_URL.test(path) || DRIVE_LETTER.test(path) || path.startsWith('/')
}

/**
 * The file name an absolute or `file:` reference falls back to.
 *
 * A `file:` URL loses its query and fragment, and its name is percent-decoded once. An
 * empty name, one made only of dots and spaces, or one that decodes to something holding
 * a separator or NUL names no file beside the model and is refused.
 *
 * @param {string} ref - a reference as declared
 * @return {string|null} the bare file name, or null when there is none to use
 */
export function nameOnlyRef(ref) {
	let path = asciiTrim(String(ref).replace(/\\/g, '/'))
	const url = FILE_URL.test(path)
	if (url) {
		path = path.slice('file:'.length)
		const end = path.search(/[?#]/)
		if (end !== -1) {
			path = path.slice(0, end)
		}
	} else if (DRIVE_LETTER.test(path)) {
		path = path.slice(2)
	} else if (!path.startsWith('/')) {
		return null
	}

	let name = path.slice(path.lastIndexOf('/') + 1)
	if (url) {
		name = percentDecoded(name)
	}
	if (name === '' || DOTS_AND_SPACES.test(name) || /[/\\\0]/.test(name)) {
		return null
	}
	return name
}

/**
 * Reduce a declared reference to a path inside the model's own folder, or reject it.
 *
 * An absolute or `file:` reference becomes its bare file name. Any other scheme is
 * rejected. A relative path has its separators folded and `..` collapsed, and is rejected
 * if it climbs out of the model's folder, holds a NUL, which no file name does, or has a
 * segment made only of dots and spaces other than `.` and `..` (see DOTS_AND_SPACES).
 * Only the ASCII blanks are trimmed (see BLANKS).
 *
 * @param {string} raw - reference exactly as the document wrote it
 * @return {string|null} normalised relative path, or null if it is not one
 */
export function normaliseRef(raw) {
	// Exporters on Windows write backslashes; every path here uses forward slashes.
	const path = asciiTrim(String(raw).replace(/\\/g, '/'))
	if (path === '') {
		return null
	}
	if (isLocalAbsoluteRef(path)) {
		return nameOnlyRef(path)
	}
	// data:, https:, blob: — not a file beside the model.
	if (SCHEME.test(path)) {
		return null
	}

	const segments = []
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') {
			continue
		}
		if (segment.includes('\0')) {
			return null
		}
		if (segment !== '..' && DOTS_AND_SPACES.test(segment)) {
			return null
		}
		if (segment === '..') {
			if (segments.length === 0) {
				// Climbing out of the model's folder reaches files the share never covered.
				return null
			}
			segments.pop()
			continue
		}
		segments.push(segment)
	}

	return segments.length === 0 ? null : segments.join('/')
}
