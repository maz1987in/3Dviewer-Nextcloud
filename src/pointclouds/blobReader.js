/**
 * Reading a scan without holding it in the JS heap. The viewer downloads a scan as a Blob,
 * which the browser may keep on disk, and readers take it in windows or ranges.
 */
// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'
import { formatBytes } from '../utils/validation.js'
import { SCAN_CEILING_BYTES } from './limits.js'
import { ScanError, abortError } from './scanFormats.js'

/** The longest line a text scan may have: far longer than any point's. */
const LINE_MAX_CHARS = 64 * 1024

/**
 * @param {string} rest - What a text reader holds after a window's last line break
 * @throws {ScanError} When it is longer than any line can be: a file with no line breaks
 *   (binary content, or old CR-only endings) would otherwise be held whole
 */
export function checkLineLength(rest) {
	if (rest.length > LINE_MAX_CHARS) {
		throw new ScanError('a line is far longer than a point\'s; it may not be a text file')
	}
}

/** A scan over the ceiling: the message says how big, and the most the viewer opens. */
export class ScanTooLargeError extends Error {
	constructor(size) {
		super(t('threedviewer', 'This scan is {size}. The viewer opens scans up to 2 GB.', { size: formatBytes(size) }))
		this.name = 'ScanTooLargeError'
	}
}

/**
 * @param {Blob} blob - The file
 * @param {object} [options] - How to read it
 * @param {number} [options.windowBytes] - Bytes per window
 * @param {number} [options.start] - Where to begin
 * @param {AbortSignal} [options.signal] - Stops between windows
 * @yields {{offset: number, bytes: Uint8Array}} Each window, in order
 */
export async function* readWindows(blob, { windowBytes = 64 * 1024 ** 2, start = 0, signal } = {}) {
	for (let offset = start; offset < blob.size; offset += windowBytes) {
		if (signal?.aborted) {
			throw abortError()
		}
		const end = Math.min(blob.size, offset + windowBytes)
		yield { offset, bytes: new Uint8Array(await blob.slice(offset, end).arrayBuffer()) }
	}
}

/**
 * @param {Blob} blob - The file
 * @param {number} start - First byte
 * @param {number} length - Bytes wanted; fewer at the end of the file
 * @return {Promise<DataView>} Those bytes
 */
export async function readRange(blob, start, length) {
	return new DataView(await blob.slice(start, start + length).arrayBuffer())
}

/** The bytes `ceilingFor` is shown: the most a PLY header the viewer reads takes. */
export const HEAD_BYTES = 64 * 1024

/**
 * A stream that passes bytes through, counting them, and stops once there are too many.
 * With `ceilingFor`, the limit can change once the first HEAD_BYTES are in: a PLY's header
 * says whether it is a splat, which has a lower ceiling than a scan.
 *
 * @param {function(number): void} onBytes - Told the running total
 * @param {number} [limit] - Bytes allowed
 * @param {function(number): Error} [tooLarge] - The error past the limit
 * @param {function(Uint8Array): ?{ceiling: number, tooLarge: function(number): Error}} [ceilingFor] -
 *   Shown the head of the file; what it returns replaces the limit and the error
 * @return {TransformStream} The counter
 */
export function byteCounter(onBytes, limit = Infinity, tooLarge = (size) => new ScanTooLargeError(size), ceilingFor = null) {
	let received = 0
	let head = ceilingFor ? new Uint8Array(HEAD_BYTES) : null
	return new TransformStream({
		transform(chunk, controller) {
			if (head) {
				head.set(chunk.subarray(0, Math.max(0, HEAD_BYTES - received)), received)
				if (received + chunk.byteLength >= HEAD_BYTES) {
					const narrowed = ceilingFor(head)
					head = null
					if (narrowed) {
						limit = narrowed.ceiling
						tooLarge = narrowed.tooLarge
					}
				}
			}
			received += chunk.byteLength
			if (received > limit) {
				controller.error(tooLarge(received))
				return
			}
			onBytes(received)
			controller.enqueue(chunk)
		},
	})
}

/**
 * A scan's download as a Blob, refused before its body is read when the server says it is
 * over the ceiling, and stopped part way when it sends no length and passes it.
 *
 * @param {Response} response - The file route's answer
 * @param {object} [options] - How to read it
 * @param {function(number): void} [options.onBytes] - Told the bytes received so far
 * @param {number} [options.ceiling] - Bytes allowed
 * @param {function(number): Error} [options.tooLarge] - The refusal past the ceiling; a
 *   splat's has its own words
 * @param {function(Uint8Array): ?object} [options.ceilingFor] - A lower ceiling, decided from
 *   the head of the file (byteCounter)
 * @param {AbortSignal} [options.signal] - The fetch's: a body cut short by it is a cancellation
 * @return {Promise<Blob>} The file
 */
export async function readScanBody(response, { onBytes = () => {}, ceiling = SCAN_CEILING_BYTES, tooLarge = (size) => new ScanTooLargeError(size), ceilingFor = null, signal } = {}) {
	const length = parseInt(response.headers.get('content-length') || '0', 10)
	if (length > ceiling) {
		throw tooLarge(length)
	}
	try {
		if (!response.body) {
			return await response.blob()
		}
		return await new Response(response.body.pipeThrough(byteCounter(onBytes, ceiling, tooLarge, ceilingFor))).blob()
	} catch (error) {
		// Some browsers fail a body cut short by an abort with a network error instead
		throw signal?.aborted ? abortError() : error
	}
}
