/**
 * The length unit a LAS or LAZ file's coordinate system names: from its GeoTIFF keys
 * (LASF_Projection 34735, with 34736 holding doubles) or its OGC WKT (LASF_Projection
 * 2112). Only the unit is read; where on Earth the scan is, and how, is not.
 *
 * A unit is judged by its conversion factor, not its name, which every writer spells its
 * own way: 1 is the metre, 0.3048 the international foot, 0.3048006096012192 the US
 * survey foot. The two feet differ by two parts in a million, so the match is close.
 */

/** EPSG unit codes, as GeoKeys give them. */
const EPSG_UNITS = new Map([[9001, 'm'], [9002, 'ft'], [9003, 'us-ft']])
const FACTORS = [[1, 'm'], [0.3048, 'ft'], [0.3048006096012192, 'us-ft']]

const PROJ_LINEAR_UNITS = 3076
const PROJ_LINEAR_UNIT_SIZE = 3077
const VERTICAL_UNITS = 4099

/**
 * @param {number} metres - Metres per unit
 * @return {?string} 'm', 'ft' or 'us-ft', or null for another length
 */
export function unitFromFactor(metres) {
	if (!Number.isFinite(metres) || metres <= 0) {
		return null
	}
	return FACTORS.find(([factor]) => Math.abs(metres - factor) <= factor * 1e-9)?.[1] ?? null
}

/**
 * @param {Array<{userId: string, recordId: number, data: Uint8Array}>} vlrs - The file's VLRs and EVLRs
 * @return {?string} 'm', 'ft' or 'us-ft', or null when the coordinate system names none
 */
export function crsUnit(vlrs) {
	const record = (id) => vlrs.find((v) => v.userId === 'LASF_Projection' && v.recordId === id)?.data
	return geoKeysUnit(record(34735), record(34736)) ?? wktUnit(record(2112))
}

/**
 * @param {?Uint8Array} directory - The GeoKeyDirectoryTag record
 * @param {?Uint8Array} doubles - The GeoDoubleParamsTag record
 * @return {?string} The unit, or null
 */
function geoKeysUnit(directory, doubles) {
	if (!directory || directory.length < 8) {
		return null
	}
	const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
	const count = Math.min(view.getUint16(6, true), Math.floor((directory.length - 8) / 8))
	const keys = new Map()
	for (let k = 0; k < count; k++) {
		const at = 8 + k * 8
		keys.set(view.getUint16(at, true), { location: view.getUint16(at + 2, true), value: view.getUint16(at + 6, true) })
	}
	for (const id of [PROJ_LINEAR_UNITS, VERTICAL_UNITS]) {
		const key = keys.get(id)
		if (key?.location === 0 && EPSG_UNITS.has(key.value)) {
			return EPSG_UNITS.get(key.value)
		}
	}
	// A unit given only by its size in metres
	const size = keys.get(PROJ_LINEAR_UNIT_SIZE)
	if (size?.location === 34736 && doubles && (size.value + 1) * 8 <= doubles.length) {
		return unitFromFactor(new DataView(doubles.buffer, doubles.byteOffset, doubles.byteLength).getFloat64(size.value * 8, true))
	}
	return null
}

/**
 * The block that starts at `open` (its `[`), to its matching `]`.
 *
 * @param {string} text - WKT
 * @param {number} open - Index of a `[`
 * @return {number} Index just past the matching `]`, or the text's end
 */
function blockEnd(text, open) {
	let depth = 0
	for (let i = open; i < text.length; i++) {
		if (text[i] === '[') depth++
		else if (text[i] === ']' && --depth === 0) return i + 1
	}
	return text.length
}

/**
 * @param {?Uint8Array} bytes - The WKT record
 * @return {?string} The projected system's length unit, or null
 */
function wktUnit(bytes) {
	if (!bytes) {
		return null
	}
	const text = new TextDecoder().decode(bytes).replace(/\0+$/, '')
	const projected = /\b(PROJCS|PROJCRS|PROJECTEDCRS)\s*\[/.exec(text)
	if (!projected) {
		return null
	}
	let block = text.slice(projected.index, blockEnd(text, projected.index + projected[0].length - 1))
	// The geographic system inside is in degrees: take it out, nested brackets and all
	for (;;) {
		const geographic = /\b(GEOGCS|GEOGCRS|BASEGEOGCRS|GEODCRS|BASEGEODCRS)\s*\[/.exec(block)
		if (!geographic) {
			break
		}
		block = block.slice(0, geographic.index) + block.slice(blockEnd(block, geographic.index + geographic[0].length - 1))
	}
	const units = [...block.matchAll(/\b(?:LENGTHUNIT|UNIT)\s*\[\s*"[^"]*"\s*,\s*([-+0-9.eE]+)/g)]
	return units.length ? unitFromFactor(Number(units[units.length - 1][1])) : null
}
