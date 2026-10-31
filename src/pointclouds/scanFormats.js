/**
 * The scan formats, and how a reader says a file can't be shown. A reader module exports
 * `read(blob, { budget, onProgress, signal })`, resolving `{ sink, unit, format }`: the
 * finished PointSink, the unit the file records ('m', 'ft', 'us-ft') or null, and the
 * format read. A PLY is a scan only when it has no faces, so it isn't listed here.
 */

export { isScanExtension, SCAN_EXTENSIONS } from './scanExtensions.js'

/**
 * The file is a scan, but this one can't be read. `reason` says why in a few words, with
 * `{name}` placeholders for `vars`; the page translates it (scanReasons.js), since a
 * worker has no translations. The message is the English, filled in.
 */
export class ScanError extends Error {
	constructor(reason, vars = {}) {
		super(reason.replace(/{(\w+)}/g, (_, key) => String(vars[key] ?? `{${key}}`)))
		this.name = 'ScanError'
		this.reason = reason
		this.vars = vars
	}
}

/** The file isn't a scan at all: a chemistry .xyz, which lists atoms. */
export class NotAScanError extends Error {
	constructor(message = 'not a scan') {
		super(message)
		this.name = 'NotAScanError'
	}
}

/** What a cancelled read rejects with, the same name fetch uses. */
export function abortError() {
	return new DOMException('Aborted', 'AbortError')
}

/**
 * @param {string} ext - A lower-case extension
 * @return {?Promise<object>} Its reader module, or null. A switch, not a lookup: an
 *   extension such as `constructor` must not find a property every object has
 */
function importReader(ext) {
	switch (ext) {
	case 'xyz': return import('./readers/xyz.js')
	case 'ply': return import('./readers/plyPoints.js')
	case 'pcd': return import('./readers/pcd.js')
	case 'las':
	case 'laz': return import('./readers/las.js')
	case 'e57': return import('./readers/e57.js')
	default: return null
	}
}

/**
 * @param {string} ext - A scan's extension
 * @return {Promise<{read: function(Blob, object): Promise<object>}>} Its reader
 */
export async function readerFor(ext) {
	const reader = importReader(String(ext).toLowerCase())
	if (!reader) {
		throw new ScanError('there is no reader for .{ext}', { ext })
	}
	return reader
}
