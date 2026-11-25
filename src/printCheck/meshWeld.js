/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Joining vertices that are the same place: how close counts as the same, and a spatial
 * hash that finds them in one pass over typed arrays, with no object per vertex.
 *
 * Plain module, no DOM and no three.js, so the print-check worker can import it.
 */

// A float32 coordinate is good to about 2^-24 of its size; a few of those are noise
const FLOAT_NOISE = 2 ** -21
// Never join vertices further apart than this share of the part's largest side
const MAX_SHARE_OF_EXTENT = 1e-4
// Keeps the number of cells along an axis far inside what an Int32 holds
const MIN_SHARE_OF_EXTENT = 2 ** -24

/** The most a weld reaches, in millimetres: a micron, far below what a printer resolves. */
export const MAX_WELD_MM = 1e-3
/** The share of a part's largest side that two vertices may differ by and still be one. */
export const WELD_SHARE_OF_EXTENT = 1e-5

/**
 * The box a part sits in.
 *
 * @param {Float32Array|Float64Array} positions - xyz per vertex
 * @return {{min: number[], max: number[], extent: number, maxAbs: number, finite: number}} The
 *   corners of the box round the vertices that have finite coordinates, its largest side
 *   (0 when there are none or they are one point), the largest absolute coordinate, and how
 *   many vertices had finite coordinates
 */
export function measureBounds(positions) {
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	let maxAbs = 0
	let finite = 0
	const count = Math.floor(positions.length / 3)
	for (let v = 0; v < count; v++) {
		const x = positions[v * 3]
		const y = positions[v * 3 + 1]
		const z = positions[v * 3 + 2]
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			continue
		}
		finite++
		if (x < min[0]) { min[0] = x }
		if (y < min[1]) { min[1] = y }
		if (z < min[2]) { min[2] = z }
		if (x > max[0]) { max[0] = x }
		if (y > max[1]) { max[1] = y }
		if (z > max[2]) { max[2] = z }
		const a = Math.max(Math.abs(x), Math.abs(y), Math.abs(z))
		if (a > maxAbs) { maxAbs = a }
	}
	if (!finite) {
		return { min: [0, 0, 0], max: [0, 0, 0], extent: 0, maxAbs: 0, finite: 0 }
	}
	return { min, max, extent: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]), maxAbs, finite }
}

/**
 * How far apart two vertices of a part may be and still be the same vertex, in the part's
 * own units.
 *
 * It comes from the part's size and from what a unit is, never from a fixed number: a part
 * 2 mm across is joined to a few tens of nanometres, a metre-sized one to a micron, and the
 * same part gives the same answer whether it is written in millimetres or in metres. Two
 * vertices a micron apart on a small part are two vertices.
 *
 * @param {{extent: number, maxAbs: number}} bounds - From measureBounds
 * @param {number} [millimetresPerUnit] - Millimetres in one of the part's units
 * @return {number} The tolerance; always above zero
 */
export function weldTolerance(bounds, millimetresPerUnit = 1) {
	const unit = millimetresPerUnit > 0 && Number.isFinite(millimetresPerUnit) ? millimetresPerUnit : 1
	const extent = bounds.extent > 0 ? bounds.extent : 1
	const wanted = Math.min(extent * unit * WELD_SHARE_OF_EXTENT, MAX_WELD_MM) / unit
	// A part far from the origin has coarser coordinates: join what they cannot tell apart
	const floored = Math.max(wanted, bounds.maxAbs * FLOAT_NOISE)
	return Math.min(Math.max(floored, extent * MIN_SHARE_OF_EXTENT), extent * MAX_SHARE_OF_EXTENT)
}

/**
 * Join the vertices that lie within `tolerance` of one another.
 *
 * Space is cut into cells twice the tolerance wide, so two vertices that close are in the
 * same cell or in the next one along each axis, and a vertex looks into at most eight
 * cells. A vertex is joined to the first earlier vertex within the tolerance of it, which
 * stays where it is: a chain of near neighbours does not drift into one vertex.
 *
 * @param {Float32Array|Float64Array} positions - xyz per vertex
 * @param {number} tolerance - The most two joined vertices may differ by
 * @param {{min: number[]}} bounds - From measureBounds
 * @return {{ids: Int32Array, count: number, representative: Int32Array, repeats: number, nearPlaces: number}}
 *   `ids`: the joined vertex each vertex became, -1 for one with a non-finite coordinate;
 *   `count`: how many joined vertices there are; `representative`: for each, the input
 *   vertex whose place it keeps; how many vertices repeat an earlier one's place (exactly, or
 *   within the tolerance); and in how many joined vertices the places were not all exactly
 *   the same, which is where one that should meet another misses by a hair
 */
export function weldVertices(positions, tolerance, bounds) {
	const n = Math.floor(positions.length / 3)
	const ids = new Int32Array(n)
	const representative = new Int32Array(n)
	const nextInCell = new Int32Array(n)
	let count = 0
	let repeats = 0
	let nearPlaces = 0
	const inexact = new Uint8Array(n)

	let size = 16
	while (size < n * 2) { size <<= 1 }
	const mask = size - 1
	const slots = new Int32Array(size).fill(-1)
	// One entry per occupied cell: where it is, and the newest vertex in it
	const cellX = new Int32Array(n)
	const cellY = new Int32Array(n)
	const cellZ = new Int32Array(n)
	const cellHead = new Int32Array(n)
	let cells = 0

	const cellSize = tolerance * 2
	const limit = tolerance * tolerance
	const [minX, minY, minZ] = bounds.min

	/**
	 * @param {number} cx - A cell's column
	 * @param {number} cy - Its row
	 * @param {number} cz - Its layer
	 * @param {boolean} create - Make the entry when there is none
	 * @return {number} The cell's entry, or -1
	 */
	const cellAt = (cx, cy, cz, create) => {
		let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791)) & mask
		while (slots[h] !== -1) {
			const c = slots[h]
			if (cellX[c] === cx && cellY[c] === cy && cellZ[c] === cz) {
				return c
			}
			h = (h + 1) & mask
		}
		if (!create) {
			return -1
		}
		const c = cells++
		slots[h] = c
		cellX[c] = cx
		cellY[c] = cy
		cellZ[c] = cz
		cellHead[c] = -1
		return c
	}

	// How far from the point the last joined vertex searchCell found is, squared
	let foundDistance = 0
	/**
	 * @param {number} c - A cell's entry
	 * @param {number} x - A point
	 * @param {number} y - Its y
	 * @param {number} z - Its z
	 * @return {number} The first joined vertex in the cell within the tolerance of the point, or -1
	 */
	const searchCell = (c, x, y, z) => {
		for (let id = cellHead[c]; id !== -1; id = nextInCell[id]) {
			const r = representative[id] * 3
			const dx = positions[r] - x
			const dy = positions[r + 1] - y
			const dz = positions[r + 2] - z
			const d = dx * dx + dy * dy + dz * dz
			if (d <= limit) {
				foundDistance = d
				return id
			}
		}
		return -1
	}

	for (let v = 0; v < n; v++) {
		const x = positions[v * 3]
		const y = positions[v * 3 + 1]
		const z = positions[v * 3 + 2]
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			ids[v] = -1
			continue
		}
		const fx = (x - minX) / cellSize
		const fy = (y - minY) / cellSize
		const fz = (z - minZ) / cellSize
		const cx = Math.floor(fx)
		const cy = Math.floor(fy)
		const cz = Math.floor(fz)

		const own = cellAt(cx, cy, cz, false)
		let found = own !== -1 ? searchCell(own, x, y, z) : -1
		if (found === -1) {
			// The next cell, on the side of each axis the vertex is nearer to
			const sx = fx - cx < 0.5 ? -1 : 1
			const sy = fy - cy < 0.5 ? -1 : 1
			const sz = fz - cz < 0.5 ? -1 : 1
			for (let k = 1; k < 8 && found === -1; k++) {
				const c = cellAt(cx + (k & 1 ? sx : 0), cy + (k & 2 ? sy : 0), cz + (k & 4 ? sz : 0), false)
				if (c !== -1) {
					found = searchCell(c, x, y, z)
				}
			}
		}

		if (found !== -1) {
			ids[v] = found
			repeats++
			if (foundDistance !== 0 && !inexact[found]) {
				inexact[found] = 1
				nearPlaces++
			}
			continue
		}
		const id = count++
		representative[id] = v
		ids[v] = id
		const c = own !== -1 ? own : cellAt(cx, cy, cz, true)
		nextInCell[id] = cellHead[c]
		cellHead[c] = id
	}

	return { ids, count, representative, repeats, nearPlaces }
}
