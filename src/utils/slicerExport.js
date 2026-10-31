/**
 * What Send to Slicer sends. A slicer reads an STL, OBJ or PLY as millimetres, so the copy
 * it gets is written in millimetres, whatever unit the model was drawn in, and a file goes
 * as it is only when that is what it holds.
 */

import { withExportState, withMillimetres } from './ownDisplayState.js'

/**
 * Write the model with an exporter, as an export writes it, in millimetres.
 *
 * @param {THREE.Object3D} object - The model
 * @param {number} millimetresPerUnit - Millimetres per scene unit (utils/sourceUnits.js)
 * @param {Function} parse - A single synchronous exporter `parse()`
 * @return {*} What `parse` returns
 */
export function parseInMillimetres(object, millimetresPerUnit, parse) {
	return withExportState(object, () => withMillimetres(object, millimetresPerUnit, parse))
}

/**
 * Whether the file itself is sent rather than a copy: its format is on the passthrough
 * list, and the numbers in it are what the slicer will take them for. A file whose unit
 * was chosen in the viewer (it records none) holds its numbers in that unit, so unless it
 * is millimetres it is converted.
 *
 * @param {object} file - What is known of the open file
 * @param {string} file.extension - Its lower-case extension
 * @param {string[]} file.passthroughFormats - Extensions sent as they are
 * @param {?(number|string)} file.fileId - Its id; without one there is nothing to send
 * @param {boolean} file.unitChosen - Whether a unit was chosen for it
 * @param {number} file.millimetresPerUnit - Millimetres per scene unit
 * @return {boolean}
 */
export function sendsFileAsIs({ extension, passthroughFormats, fileId, unitChosen, millimetresPerUnit }) {
	const list = Array.isArray(passthroughFormats) ? passthroughFormats.map((format) => String(format).toLowerCase()) : []
	if (!extension || !list.includes(extension) || !fileId) {
		return false
	}
	return !unitChosen || millimetresPerUnit === 1
}
