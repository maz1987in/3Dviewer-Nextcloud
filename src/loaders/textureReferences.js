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
 * directories it names are never followed. 3ds Max and others write paths relative to
 * the project rather than the model, `..\..\textures\wood.jpg`, while the user uploads
 * the texture beside the model; a relative path that climbs above the model's folder
 * falls back to its file name the same way. A reference with any other scheme (`http:`,
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
 * A relative path walked segment by segment, `..` collapsed. One pass, linear in the path.
 *
 * Every segment is checked, even after the walk has climbed out of the model's folder,
 * so a NUL or a segment of dots and spaces anywhere rejects the path whether or not it
 * climbs.
 *
 * @param {string} path - trimmed, with `/` separators, relative and without a scheme
 * @return {{segments: string[], climbed: boolean, valid: boolean}} the segments left
 *   inside the folder; whether a `..` went above it; whether every segment is one a
 *   file or folder can have
 */
function walkRelative(path) {
	const segments = []
	let climbed = false
	let valid = true
	for (const segment of path.split('/')) {
		if (segment === '' || segment === '.') {
			continue
		}
		if (segment === '..') {
			if (segments.length === 0) {
				climbed = true
			} else {
				segments.pop()
			}
			continue
		}
		if (segment.includes('\0') || DOTS_AND_SPACES.test(segment)) {
			valid = false
		}
		segments.push(segment)
	}
	return { segments, climbed, valid }
}

/**
 * Whether a reference falls back to its bare file name beside the model: an absolute
 * path or `file:` URL (see isLocalAbsoluteRef), or a relative path that climbs above the
 * model's folder once `..` is collapsed, `../wood.jpg` or `textures/../../wood.jpg`.
 *
 * @param {string} ref - a reference as declared
 * @return {boolean} true when nameOnlyRef() is what the reference reduces to
 */
export function fallsBackToName(ref) {
	if (isLocalAbsoluteRef(ref)) {
		return true
	}
	const path = asciiTrim(String(ref).replace(/\\/g, '/'))
	return !SCHEME.test(path) && walkRelative(path).climbed
}

/**
 * The file name an absolute, `file:` or climbing relative reference falls back to (see
 * fallsBackToName()), or null for any other reference.
 *
 * A `file:` URL loses its query and fragment, and its name is percent-decoded once. An
 * empty name, one made only of dots and spaces, or one that decodes to something holding
 * a separator or NUL names no file beside the model and is refused. So is a climbing
 * relative path with a NUL or a segment of dots and spaces anywhere in it, as any other
 * relative path is: `../ .. /wood.jpg`. The name is the last segment as written, so
 * `../wood.jpg/` and `../textures/..` name none.
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
		if (SCHEME.test(path)) {
			return null
		}
		const walked = walkRelative(path)
		if (!walked.climbed || !walked.valid) {
			return null
		}
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
 * if it holds a NUL, which no file name does, or has a segment made only of dots and
 * spaces other than `.` and `..` (see DOTS_AND_SPACES). One that climbs above the model's
 * folder at any point, `../wood.jpg`, `..\..\textures\wood.jpg` or
 * `textures/../../wood.jpg`, becomes its bare file name like an absolute one: the folders
 * it names are never followed, and the name is looked for in the model's folder alone.
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

	const { segments, climbed, valid } = walkRelative(path)
	if (!valid) {
		return null
	}
	if (climbed) {
		// Above the model's folder lie files the share never covered, so the folders the
		// path names are not followed; only its name is, beside the model.
		return nameOnlyRef(path)
	}

	return segments.length === 0 ? null : segments.join('/')
}
