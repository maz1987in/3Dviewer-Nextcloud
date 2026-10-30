/**
 * The scan formats, and how a reader says a file can't be shown. A reader module exports
 * `read(blob, { budget, onProgress, signal })`, resolving `{ sink, unit, format }`: the
 * finished PointSink, the unit the file records ('m', 'ft', 'us-ft') or null, and the
 * format read. A PLY is a scan only when it has no faces, so it isn't listed here.
 */

export { isScanExtension, SCAN_EXTENSIONS } from './scanExtensions.js'

/** The file is a scan, but this one can't be read; the message says why, in a few words. */
export class ScanError extends Error {
	constructor(reason) {
		super(reason)
		this.name = 'ScanError'
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

const READERS = {
	xyz: () => import('./readers/xyz.js'),
	ply: () => import('./readers/plyPoints.js'),
	pcd: () => import('./readers/pcd.js'),
	las: () => import('./readers/las.js'),
	laz: () => import('./readers/las.js'),
	e57: () => import('./readers/e57.js'),
}

/**
 * @param {string} ext - A scan's extension
 * @return {Promise<{read: function(Blob, object): Promise<object>}>} Its reader
 */
export async function readerFor(ext) {
	const load = READERS[String(ext).toLowerCase()]
	if (!load) {
		throw new ScanError(`there is no reader for .${ext}`)
	}
	return load()
}
