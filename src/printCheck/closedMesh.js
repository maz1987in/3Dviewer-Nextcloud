/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Whether a part is closed: every edge shared by exactly two triangles, so it has an
 * inside a slicer can fill. `useModelStats` answers the same question for the stats panel,
 * but only on indexed meshes under 500,000 triangles; an STL is never indexed (every
 * triangle has its own three vertices), so it always read as unknown. Here vertices at the
 * same place are welded first, and there is no size cap: this runs in a worker when Print
 * check opens, not while a model loads.
 *
 * Plain module, no DOM and no three.js, so the worker can import it.
 */

/** Distinct quantised values per axis that fit beside another axis in one safe integer. */
const AXIS_RANGE = 2 ** 21

/**
 * Count a part's open and over-shared edges.
 *
 * @param {object} part - The part's geometry
 * @param {Float32Array|Float64Array} part.positions - xyz per vertex
 * @param {?(Uint16Array|Uint32Array)} part.index - Three vertex indices per triangle, or
 *   null for one triangle per three vertices
 * @param {number} [part.tolerance] - Vertices this close, as a fraction of the part's
 *   largest extent, are the same vertex
 * @return {{boundaryEdges: number, nonManifoldEdges: number, closed: boolean}} The counts;
 *   closed when there are none of either and at least one triangle
 */
export function edgeReport({ positions, index = null, tolerance = 1e-6 }) {
	const vertexCount = Math.floor(positions.length / 3)

	let min = Infinity
	let max = -Infinity
	for (let i = 0; i < positions.length; i++) {
		const v = positions[i]
		if (Number.isFinite(v)) {
			if (v < min) { min = v }
			if (v > max) { max = v }
		}
	}
	const extent = Number.isFinite(max - min) && max > min ? max - min : 1
	const step = Math.max(extent * tolerance, extent / (AXIS_RANGE - 1))

	// Welded id per vertex: -1 for a vertex with a NaN or infinite coordinate
	const welded = new Int32Array(vertexCount)
	const cells = new Map()
	let nextId = 0
	for (let v = 0; v < vertexCount; v++) {
		const x = positions[v * 3]
		const y = positions[v * 3 + 1]
		const z = positions[v * 3 + 2]
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
			welded[v] = -1
			continue
		}
		const qx = Math.round((x - min) / step)
		const qy = Math.round((y - min) / step)
		const qz = Math.round((z - min) / step)
		const outer = qx * AXIS_RANGE + qy
		let column = cells.get(outer)
		if (!column) {
			column = new Map()
			cells.set(outer, column)
		}
		let id = column.get(qz)
		if (id === undefined) {
			id = nextId++
			column.set(qz, id)
		}
		welded[v] = id
	}

	const edges = new Map()
	const addEdge = (a, b) => {
		const key = a < b ? a * nextId + b : b * nextId + a
		edges.set(key, (edges.get(key) || 0) + 1)
	}
	const triangles = Math.floor((index ? index.length : vertexCount) / 3)
	let counted = 0
	for (let t = 0; t < triangles; t++) {
		const a = welded[index ? index[t * 3] : t * 3]
		const b = welded[index ? index[t * 3 + 1] : t * 3 + 1]
		const c = welded[index ? index[t * 3 + 2] : t * 3 + 2]
		// A broken vertex, or a triangle collapsed to a line or a point, has no edges to share
		if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) {
			continue
		}
		addEdge(a, b)
		addEdge(b, c)
		addEdge(c, a)
		counted++
	}

	let boundaryEdges = 0
	let nonManifoldEdges = 0
	for (const count of edges.values()) {
		if (count === 1) {
			boundaryEdges++
		} else if (count > 2) {
			nonManifoldEdges++
		}
	}
	return { boundaryEdges, nonManifoldEdges, closed: counted > 0 && boundaryEdges === 0 && nonManifoldEdges === 0 }
}

/**
 * Whether a whole model is closed: every part is.
 *
 * @param {Array<{closed: boolean}>} reports - One edgeReport per part
 * @return {{closed: boolean, openParts: number}} Closed, and how many parts are not
 */
export function modelClosed(reports) {
	const openParts = reports.filter((report) => !report.closed).length
	return { closed: reports.length > 0 && openParts === 0, openParts }
}
