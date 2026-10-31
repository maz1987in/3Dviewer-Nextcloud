/**
 * Writers for small point-cloud files, for the fixtures (scripts/make-point-fixtures.mjs)
 * and for tests that need a file of a particular shape. They write what the formats
 * specify and nothing clever, so a reader is tested against the specification, not
 * against itself.
 */

/** Bytes per point record, by LAS point format (ASPRS LAS 1.4 R15, table 6 onwards). */
export const LAS_RECORD_LENGTH = { 0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63, 6: 30, 7: 36, 8: 38, 9: 59, 10: 67 }

const GPS = new Set([1, 3, 4, 5])
const LAS_RGB_OFFSET = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }

/**
 * A LAS file.
 *
 * @param {object} options - What to write
 * @param {[number, number]} [options.version] - Major, minor; [1, 2] by default
 * @param {number} [options.format] - Point data format, 0–10
 * @param {Array<{x: number, y: number, z: number, intensity?: number, classification?: number, rgb?: number[]}>} options.points - In real coordinates
 * @param {number[]} [options.scale] - Per axis
 * @param {number[]} [options.offset] - Per axis
 * @param {Array<{userId: string, recordId: number, data: Uint8Array}>} [options.vlrs] - Variable-length records
 * @param {boolean} [options.wkt] - Set the global encoding's WKT bit (1.4)
 * @param {boolean} [options.compressed] - Set the format byte's compression bit, as LAZ does
 * @return {Uint8Array} The file
 */
export function lasFile({ version = [1, 2], format = 3, points, scale = [0.001, 0.001, 0.001], offset = [0, 0, 0], vlrs = [], wkt = false, compressed = false }) {
	const minor = version[1]
	const headerSize = minor >= 4 ? 375 : minor === 3 ? 235 : 227
	const vlrBytes = vlrs.reduce((n, v) => n + 54 + v.data.length, 0)
	const recordLength = LAS_RECORD_LENGTH[format]
	const offsetToPoints = headerSize + vlrBytes
	const out = new Uint8Array(offsetToPoints + points.length * recordLength)
	const view = new DataView(out.buffer)
	const text = (at, s, length) => {
		for (let i = 0; i < length; i++) out[at + i] = i < s.length ? s.charCodeAt(i) : 0
	}
	const min = [0, 1, 2].map((a) => Math.min(...points.map((p) => [p.x, p.y, p.z][a])))
	const max = [0, 1, 2].map((a) => Math.max(...points.map((p) => [p.x, p.y, p.z][a])))

	text(0, 'LASF', 4)
	view.setUint16(6, wkt ? 1 << 4 : 0, true)
	view.setUint8(24, version[0])
	view.setUint8(25, minor)
	text(26, 'fixture', 32)
	text(58, 'make-point-fixtures', 32)
	view.setUint16(94, headerSize, true)
	view.setUint32(96, offsetToPoints, true)
	view.setUint32(100, vlrs.length, true)
	view.setUint8(104, format | (compressed ? 0x80 : 0))
	view.setUint16(105, recordLength, true)
	view.setUint32(107, format <= 5 ? points.length : 0, true)
	scale.forEach((s, a) => view.setFloat64(131 + a * 8, s, true))
	offset.forEach((o, a) => view.setFloat64(155 + a * 8, o, true))
	for (let a = 0; a < 3; a++) {
		view.setFloat64(179 + a * 16, max[a], true)
		view.setFloat64(187 + a * 16, min[a], true)
	}
	if (minor >= 4) {
		view.setBigUint64(247, BigInt(points.length), true)
	}

	let at = headerSize
	for (const vlr of vlrs) {
		text(at + 2, vlr.userId, 16)
		view.setUint16(at + 18, vlr.recordId, true)
		view.setUint16(at + 20, vlr.data.length, true)
		out.set(vlr.data, at + 54)
		at += 54 + vlr.data.length
	}

	points.forEach((p, i) => {
		const base = offsetToPoints + i * recordLength
		;[p.x, p.y, p.z].forEach((v, a) => view.setInt32(base + a * 4, Math.round((v - offset[a]) / scale[a]), true))
		view.setUint16(base + 12, p.intensity ?? 0, true)
		if (format <= 5) {
			view.setUint8(base + 15, (p.classification ?? 0) & 0x1f)
		} else {
			view.setUint8(base + 16, p.classification ?? 0)
		}
		if (GPS.has(format)) {
			view.setFloat64(base + 20, i, true)
		}
		const rgbAt = LAS_RGB_OFFSET[format]
		if (rgbAt !== undefined && p.rgb) {
			p.rgb.forEach((c, k) => view.setUint16(base + rgbAt + k * 2, c, true))
		}
	})
	return out
}

/**
 * A GeoKeyDirectoryTag VLR: GeoTIFF keys, each stored in the directory itself.
 *
 * @param {Array<[number, number]>} keys - [key id, value]
 * @return {{userId: string, recordId: number, data: Uint8Array}} The record
 */
export function geoKeys(keys) {
	const shorts = [1, 1, 0, keys.length, ...keys.flatMap(([id, value]) => [id, 0, 1, value])]
	const data = new Uint8Array(shorts.length * 2)
	const view = new DataView(data.buffer)
	shorts.forEach((s, i) => view.setUint16(i * 2, s, true))
	return { userId: 'LASF_Projection', recordId: 34735, data }
}

/**
 * An OGC WKT VLR.
 *
 * @param {string} wkt - The coordinate system
 * @return {{userId: string, recordId: number, data: Uint8Array}} The record
 */
export function wktRecord(wkt) {
	return { userId: 'LASF_Projection', recordId: 2112, data: new TextEncoder().encode(wkt + '\0') }
}
