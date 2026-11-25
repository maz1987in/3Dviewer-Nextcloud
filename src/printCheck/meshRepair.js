/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Mend a mesh for printing, and say what was done and what was not.
 *
 * In this order: join vertices within a tolerance that comes from the part's size and unit
 * (meshWeld.weldTolerance), leave out zero-area and duplicate faces, turn faces to agree
 * with their neighbours and turn a part that is inside out, and fill the holes whose edge
 * is a simple loop, up to a size. Nothing here removes self-intersections or remeshes: a
 * face that passes through another is left as it is, and so is any edge shared by more than
 * two faces, and both are reported.
 *
 * A hole is filled by cutting ears off the loop, on the plane that fits it best; where that
 * finds no ear, by a fan from the loop's centre, but only when every face of the fan faces
 * the same way on that plane. A hole neither can fill safely is left open.
 *
 * Plain module, no DOM and no three.js, so the print-check worker can import it.
 */

import { analyzeMesh, inspectMesh } from './meshAnalysis.js'
import { MAX_HOLE_EDGES } from './meshReport.js'

/**
 * Fill one hole.
 *
 * @param {Int32Array} loop - The hole's welded vertices, in the direction the mesh's edges run along it
 * @param {Float64Array} points - xyz of each welded vertex
 * @param {{find: function(number, number): number}} edges - From buildEdges, to keep a new edge
 *   from doubling one the mesh already has
 * @param {number} nextVertex - The id the first vertex this adds takes
 * @return {?{triangles: number[], centre: ?number[]}} The faces, three vertex ids each, facing
 *   the way the mesh's other faces do, and the new vertex's place when it had to add one; null
 *   when the hole could not be filled safely
 */
export function fillHole(loop, points, edges, nextVertex) {
	const n = loop.length
	if (n < 3) {
		return null
	}
	// The new faces meet the mesh's edges the other way round
	const ring = Int32Array.from(loop).reverse()

	// The plane that fits the loop: Newell's normal, and the loop's centre
	let nx = 0
	let ny = 0
	let nz = 0
	let cx = 0
	let cy = 0
	let cz = 0
	let perimeter = 0
	for (let i = 0; i < n; i++) {
		const a = ring[i] * 3
		const b = ring[(i + 1) % n] * 3
		nx += (points[a + 1] - points[b + 1]) * (points[a + 2] + points[b + 2])
		ny += (points[a + 2] - points[b + 2]) * (points[a] + points[b])
		nz += (points[a] - points[b]) * (points[a + 1] + points[b + 1])
		cx += points[a]
		cy += points[a + 1]
		cz += points[a + 2]
		perimeter += Math.hypot(points[b] - points[a], points[b + 1] - points[a + 1], points[b + 2] - points[a + 2])
	}
	cx /= n
	cy /= n
	cz /= n
	const length = Math.hypot(nx, ny, nz)
	// A loop with no area, such as a line folded back on itself, has no plane
	if (!(length > perimeter * perimeter * 1e-9)) {
		return null
	}
	nx /= length
	ny /= length
	nz /= length
	// Two axes on that plane. Their cross product points along the normal, so a ring that
	// runs counter-clockwise about it has positive area there
	const helper = Math.abs(nx) <= Math.abs(ny) && Math.abs(nx) <= Math.abs(nz) ? [1, 0, 0] : (Math.abs(ny) <= Math.abs(nz) ? [0, 1, 0] : [0, 0, 1])
	let ux = ny * helper[2] - nz * helper[1]
	let uy = nz * helper[0] - nx * helper[2]
	let uz = nx * helper[1] - ny * helper[0]
	const ulen = Math.hypot(ux, uy, uz)
	ux /= ulen
	uy /= ulen
	uz /= ulen
	const wx = ny * uz - nz * uy
	const wy = nz * ux - nx * uz
	const wz = nx * uy - ny * ux

	const X = new Float64Array(n)
	const Y = new Float64Array(n)
	for (let i = 0; i < n; i++) {
		const a = ring[i] * 3
		const dx = points[a] - cx
		const dy = points[a + 1] - cy
		const dz = points[a + 2] - cz
		X[i] = dx * ux + dy * uy + dz * uz
		Y[i] = dx * wx + dy * wy + dz * wz
	}
	const small = perimeter * perimeter * 1e-12

	const triangles = earClip(ring, X, Y, points, edges, small)
	if (triangles) {
		return { triangles, centre: null }
	}

	// No ear: a fan from the centre, when every face of it faces the same way on the plane
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n
		if (!(X[i] * Y[j] - X[j] * Y[i] > small)) {
			return null
		}
	}
	const fan = []
	for (let i = 0; i < n; i++) {
		fan.push(nextVertex, ring[i], ring[(i + 1) % n])
	}
	return { triangles: fan, centre: [cx, cy, cz] }
}

/**
 * Cut a polygon into triangles by cutting off ears.
 *
 * @param {Int32Array} ring - The polygon's vertex ids, counter-clockwise on the plane
 * @param {Float64Array} X - Each vertex's first coordinate on the plane
 * @param {Float64Array} Y - Its second
 * @param {Float64Array} points - xyz of each welded vertex
 * @param {{find: function(number, number): number}} edges - The mesh's edges
 * @param {number} small - What a face must be larger than to count, as twice its area
 * @return {?number[]} The faces, three vertex ids each; null when an ear cannot be found
 */
function earClip(ring, X, Y, points, edges, small) {
	const n = ring.length
	const previous = new Int32Array(n)
	const next = new Int32Array(n)
	for (let i = 0; i < n; i++) {
		previous[i] = (i + n - 1) % n
		next[i] = (i + 1) % n
	}
	const out = []
	let remaining = n
	let at = 0

	const cross = (a, b, c) => (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a])

	while (remaining > 3) {
		let cut = -1
		let i = at
		for (let k = 0; k < remaining && cut === -1; k++, i = next[i]) {
			const p = previous[i]
			const q = next[i]
			if (!(cross(p, i, q) > small)) {
				continue
			}
			// The edge it would make must not be one the mesh has already
			if (edges.find(ring[p], ring[q]) !== -1) {
				continue
			}
			let empty = true
			for (let j = next[q]; j !== p; j = next[j]) {
				// Inside the ear, or on its edge
				if (cross(p, i, j) >= -small && cross(i, q, j) >= -small && cross(q, p, j) >= -small) {
					empty = false
					break
				}
			}
			if (empty) {
				cut = i
			}
		}
		if (cut === -1) {
			return null
		}
		const p = previous[cut]
		const q = next[cut]
		out.push(ring[p], ring[cut], ring[q])
		next[p] = q
		previous[q] = p
		remaining--
		at = p
	}
	const p = previous[at]
	const q = next[at]
	if (!(cross(p, at, q) > small)) {
		return null
	}
	out.push(ring[p], ring[at], ring[q])
	return out
}

/**
 * Repair one mesh.
 *
 * @param {object} part - As for meshAnalysis.inspectMesh
 * @param {Float32Array|Float64Array} part.positions - xyz per vertex
 * @param {?(Uint16Array|Uint32Array)} [part.index] - Three vertex indices per triangle, or null
 * @param {number} [part.millimetresPerUnit] - Millimetres in one of its units
 * @param {number} [part.maxHoleEdges] - Holes with more edges than this are too large to fill
 * @param {object} [options] - Options
 * @param {function(number): void} [options.onProgress] - Called with how far along it is, 0 to 1
 * @return {{positions: Float32Array|Float64Array, index: Uint32Array, patchStart: number, changed: boolean, summary: object, before: object, after: object}}
 *   The repaired mesh, its vertices only those its faces use, and its faces from `patchStart`
 *   on the ones that fill holes; what was done (`summary`); the counts before and after
 *   (meshAnalysis.analyzeMesh); `changed` is false when there was nothing to do and the
 *   mesh is returned as it came
 */
export function repairMesh(part, { onProgress } = {}) {
	const maxHoleEdges = part.maxHoleEdges ?? MAX_HOLE_EDGES
	onProgress?.(0)
	const inspected = inspectMesh({ ...part, maxHoleEdges })
	onProgress?.(0.5)
	const { report: before, points, tri, weld, orientation, holes, turned } = inspected

	// The kept faces, each turned the way it has to face
	const kept = tri.length / 3
	const patches = []
	const centres = []
	let filled = 0
	let failed = 0
	for (const loop of holes.loops) {
		if (!loop.simple || loop.vertices.length > maxHoleEdges) {
			continue
		}
		const result = fillHole(loop.vertices, points, inspected.edges, weld.count + centres.length)
		if (!result) {
			failed++
			continue
		}
		filled++
		if (result.centre) {
			centres.push(result.centre)
		}
		patches.push(...result.triangles)
	}
	onProgress?.(0.7)

	// Only the vertices that a face uses stay
	const total = weld.count + centres.length
	const renumber = new Int32Array(total).fill(-1)
	let used = 0
	const use = (v) => {
		if (renumber[v] === -1) {
			renumber[v] = used++
		}
		return renumber[v]
	}
	const index = new Uint32Array(tri.length + patches.length)
	for (let t = 0; t < kept; t++) {
		const a = use(tri[t * 3])
		const b = use(tri[t * 3 + 1])
		const c = use(tri[t * 3 + 2])
		index[t * 3] = a
		index[t * 3 + 1] = turned[t] ? c : b
		index[t * 3 + 2] = turned[t] ? b : c
	}
	for (let i = 0; i < patches.length; i++) {
		index[tri.length + i] = use(patches[i])
	}
	const Positions = part.positions instanceof Float64Array ? Float64Array : Float32Array
	const positions = new Positions(used * 3)
	for (let v = 0; v < total; v++) {
		const to = renumber[v]
		if (to === -1) {
			continue
		}
		if (v < weld.count) {
			positions[to * 3] = points[v * 3]
			positions[to * 3 + 1] = points[v * 3 + 1]
			positions[to * 3 + 2] = points[v * 3 + 2]
		} else {
			const centre = centres[v - weld.count]
			positions[to * 3] = centre[0]
			positions[to * 3 + 1] = centre[1]
			positions[to * 3 + 2] = centre[2]
		}
	}

	const after = analyzeMesh({ positions, index, millimetresPerUnit: part.millimetresPerUnit, tolerance: inspected.tolerance, maxHoleEdges })
	onProgress?.(1)

	const summary = {
		joinedVertices: before.joinableVertices,
		removedDegenerateFaces: before.degenerateFaces,
		removedDuplicateFaces: before.duplicateFaces,
		turnedFaces: orientation.flipped,
		turnedParts: before.insideOutParts,
		filledHoles: filled,
		addedFaces: patches.length / 3,
		// What the repair met and left: holes it would not or could not fill
		leftTooLarge: before.holes.tooLarge,
		leftComplex: before.holes.complex,
		leftUnfillable: failed,
	}
	// Corners an STL gives every face of its own are joined without it being a change
	const changed = before.nearVertices > 0 || before.degenerateFaces > 0 || before.duplicateFaces > 0
		|| orientation.flipped > 0 || before.insideOutParts > 0 || filled > 0
	return { positions, index, patchStart: kept, changed, summary, before, after }
}
