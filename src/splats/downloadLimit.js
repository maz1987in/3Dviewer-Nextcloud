/**
 * What a splat's download is held to: this device's ceiling (splatBudget.js), refused in
 * a splat's words. A .splat or .spz is held to it from the start; a PLY, which may be a
 * scan or a mesh, once its header has come in and says it is a splat.
 */
import { plyHeader } from '../pointclouds/readers/plyPoints.js'
import { splatCeiling } from './splatBudget.js'
import { SplatTooLargeError } from './splatErrors.js'
import { isSplatPly } from './splatPly.js'

/**
 * @return {{ceiling: number, tooLarge: function(number): Error}} For readScanBody
 */
export function splatDownloadLimit() {
	const ceiling = splatCeiling()
	return { ceiling, tooLarge: (size) => new SplatTooLargeError(size, ceiling) }
}

/**
 * @param {Uint8Array} head - The first bytes of a PLY's download
 * @return {?{ceiling: number, tooLarge: function(number): Error}} A splat's limit, or null
 *   when it is not a splat (or the header can't be read, and PLYLoader will say why)
 */
export function plyDownloadLimit(head) {
	try {
		return isSplatPly(plyHeader(head)) ? splatDownloadLimit() : null
	} catch {
		return null
	}
}
