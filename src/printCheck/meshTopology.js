/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How a mesh's triangles meet, on typed arrays: which faces to leave out, the edges and who
 * shares them, which way each face points against its neighbours, whether a whole part is
 * inside out, and the loops round its holes. meshAnalysis.js reports on it and
 * meshRepair.js changes it; both go through here so they always agree.
 *
 * A triangle's three half-edges are `3t`, `3t + 1` and `3t + 2`: corner k to corner k + 1.
 *
 * Plain module, no DOM and no three.js, so the print-check worker can import it.
 */

/**
 * Which triangles can be used, and the welded corners of those that can.
 *
 * Left out, and counted: a triangle with a vertex that has a non-finite coordinate or that
 * uses one welded vertex twice or is thinner than the tolerance (degenerate), and a
 * triangle on the same three welded vertices as an earlier one (duplicate).
 *
 * @param {Float32Array|Float64Array} positions - xyz per vertex
 * @param {?(Uint16Array|Uint32Array)} index - Three vertex indices per triangle, or null
 * @param {{ids: Int32Array, representative: Int32Array}} weld - From weldVertices
 * @param {number} tolerance - Thinner than this is degenerate
 * @return {{tri: Int32Array, source: Int32Array, degenerate: number, duplicate: number}} The kept
 *   triangles' welded corners, the input triangle each came from, and what was left out
 */
export function usableTriangles(positions, index, weld, tolerance) {
	const { ids, representative } = weld
	const total = Math.floor((index ? index.length : ids.length) / 3)
	const tri = new Int32Array(total * 3)
	const source = new Int32Array(total)
	// Corners of the triangles kept, each sorted, for finding a second triangle on the same three
	const sorted = new Int32Array(total * 3)
	let size = 16
	while (size < total * 2) { size <<= 1 }
	const mask = size - 1
	const slots = new Int32Array(size).fill(-1)
	let kept = 0
	let degenerate = 0
	let duplicate = 0
	const limit = tolerance * tolerance

	for (let t = 0; t < total; t++) {
		const a = ids[index ? index[t * 3] : t * 3]
		const b = ids[index ? index[t * 3 + 1] : t * 3 + 1]
		const c = ids[index ? index[t * 3 + 2] : t * 3 + 2]
		if (a < 0 || b < 0 || c < 0 || a === b || b === c || a === c) {
			degenerate++
			continue
		}
		// Thinner than the tolerance: the height over the longest edge is below it
		const pa = representative[a] * 3
		const pb = representative[b] * 3
		const pc = representative[c] * 3
		const ux = positions[pb] - positions[pa]
		const uy = positions[pb + 1] - positions[pa + 1]
		const uz = positions[pb + 2] - positions[pa + 2]
		const wx = positions[pc] - positions[pa]
		const wy = positions[pc + 1] - positions[pa + 1]
		const wz = positions[pc + 2] - positions[pa + 2]
		const cx = uy * wz - uz * wy
		const cy = uz * wx - ux * wz
		const cz = ux * wy - uy * wx
		const longest = Math.max(ux * ux + uy * uy + uz * uz, wx * wx + wy * wy + wz * wz,
			(wx - ux) * (wx - ux) + (wy - uy) * (wy - uy) + (wz - uz) * (wz - uz))
		if (cx * cx + cy * cy + cz * cz <= limit * longest) {
			degenerate++
			continue
		}

		let lo = a
		let mid = b
		let hi = c
		if (lo > mid) { const s = lo; lo = mid; mid = s }
		if (mid > hi) { const s = mid; mid = hi; hi = s }
		if (lo > mid) { const s = lo; lo = mid; mid = s }
		let h = (Math.imul(lo, 73856093) ^ Math.imul(mid, 19349663) ^ Math.imul(hi, 83492791)) & mask
		let twin = false
		while (slots[h] !== -1) {
			const k = slots[h] * 3
			if (sorted[k] === lo && sorted[k + 1] === mid && sorted[k + 2] === hi) {
				twin = true
				break
			}
			h = (h + 1) & mask
		}
		if (twin) {
			duplicate++
			continue
		}
		slots[h] = kept
		sorted[kept * 3] = lo
		sorted[kept * 3 + 1] = mid
		sorted[kept * 3 + 2] = hi
		tri[kept * 3] = a
		tri[kept * 3 + 1] = b
		tri[kept * 3 + 2] = c
		source[kept] = t
		kept++
	}
	return { tri: tri.subarray(0, kept * 3), source: source.subarray(0, kept), degenerate, duplicate }
}

/**
 * The edges of a set of triangles and which half-edges make each.
 *
 * @param {Int32Array} tri - Welded corners, three per triangle
 * @return {object} `edgeOf`: each half-edge's edge; `first` and `second`: the first two
 *   half-edges of each edge; `count`: how many half-edges each edge has (saturating at
 *   255); `edges`; `boundary`: edges of one half-edge; `nonManifold`: edges of three or
 *   more; and `find(a, b)`: the edge between two welded vertices, or -1
 */
export function buildEdges(tri) {
	const half = tri.length
	const edgeOf = new Int32Array(half)
	const first = new Int32Array(half)
	const second = new Int32Array(half)
	const lo = new Int32Array(half)
	const hi = new Int32Array(half)
	const count = new Uint8Array(half)
	let size = 16
	while (size < half * 2) { size <<= 1 }
	const mask = size - 1
	const slots = new Int32Array(size).fill(-1)
	let edges = 0

	const slotFor = (a, b) => {
		let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) & mask
		while (slots[h] !== -1 && !(lo[slots[h]] === a && hi[slots[h]] === b)) {
			h = (h + 1) & mask
		}
		return h
	}

	for (let t = 0; t < half; t += 3) {
		for (let k = 0; k < 3; k++) {
			const a = tri[t + k]
			const b = tri[t + (k + 1) % 3]
			const l = a < b ? a : b
			const m = a < b ? b : a
			const h = slotFor(l, m)
			let e = slots[h]
			if (e === -1) {
				e = edges++
				slots[h] = e
				lo[e] = l
				hi[e] = m
				first[e] = t + k
			} else if (count[e] === 1) {
				second[e] = t + k
			}
			if (count[e] < 255) {
				count[e]++
			}
			edgeOf[t + k] = e
		}
	}

	let boundary = 0
	let nonManifold = 0
	for (let e = 0; e < edges; e++) {
		if (count[e] === 1) {
			boundary++
		} else if (count[e] > 2) {
			nonManifold++
		}
	}
	return {
		edgeOf,
		first,
		second,
		count,
		edges,
		boundary,
		nonManifold,
		find: (a, b) => {
			const l = a < b ? a : b
			const m = a < b ? b : a
			return slots[slotFor(l, m)]
		},
	}
}

/**
 * Which way each triangle has to be turned to agree with its neighbours, and which
 * triangles belong together.
 *
 * Parts are grown across edges of exactly two triangles. The first triangle of a part
 * sets the direction and a neighbour that disagrees is turned; the whole part is then
 * turned back if that made more of it face the other way, so the fewest faces change.
 *
 * @param {Int32Array} tri - Welded corners, three per triangle
 * @param {object} edges - From buildEdges
 * @return {{flip: Uint8Array, part: Int32Array, parts: number, flipped: number, conflicts: number}}
 *   `flip`: 1 for a triangle to turn; `part`: each triangle's part; `parts`: how many; `flipped`:
 *   how many triangles turn; `conflicts`: edges whose two triangles cannot both agree
 *   (a surface with a twist in it, such as a Mobius strip)
 */
export function orientFaces(tri, edges) {
	const triangles = tri.length / 3
	const flip = new Uint8Array(triangles)
	const part = new Int32Array(triangles).fill(-1)
	const queue = new Int32Array(triangles)
	let parts = 0
	let flipped = 0
	let conflicts = 0

	for (let seed = 0; seed < triangles; seed++) {
		if (part[seed] !== -1) {
			continue
		}
		const id = parts++
		let head = 0
		let tail = 0
		queue[tail++] = seed
		part[seed] = id
		while (head < tail) {
			const t = queue[head++]
			for (let k = 0; k < 3; k++) {
				const h = t * 3 + k
				const e = edges.edgeOf[h]
				if (edges.count[e] !== 2) {
					continue
				}
				const other = edges.first[e] === h ? edges.second[e] : edges.first[e]
				const u = (other - (other % 3)) / 3
				// Both half-edges starting at the same vertex means the two faces disagree
				const disagree = tri[h] === tri[other] ? 1 : 0
				const wanted = flip[t] ^ disagree
				if (part[u] === -1) {
					part[u] = id
					flip[u] = wanted
					queue[tail++] = u
				} else if (flip[u] !== wanted) {
					conflicts++
				}
			}
		}
		// The queue now holds this part's triangles, and the majority keeps its direction
		let turned = 0
		for (let i = 0; i < tail; i++) {
			turned += flip[queue[i]]
		}
		if (turned * 2 > tail) {
			for (let i = 0; i < tail; i++) {
				flip[queue[i]] ^= 1
			}
			turned = tail - turned
		}
		flipped += turned
	}
	// A conflict is found from both of its triangles
	return { flip, part, parts, flipped, conflicts: conflicts / 2 }
}

/**
 * The volume each part encloses, and whether it should be turned inside out.
 *
 * A part's volume is taken about its own centre. For a closed part that is the usual
 * signed volume, and it does not depend on the centre. A part with a hole still gets a
 * sign that tells inside from outside, as the hole is closed by the cone to the centre,
 * which is worth nothing about the centre.
 *
 * A part that comes out negative is inside out, unless it lies inside another part: the
 * wall of a cavity inside a solid is meant to face into the cavity.
 *
 * @param {Float64Array|Float32Array} points - xyz of each welded vertex
 * @param {Int32Array} tri - Welded corners, three per triangle
 * @param {Uint8Array} flip - From orientFaces
 * @param {Int32Array} part - From orientFaces
 * @param {number} parts - How many parts
 * @param {number} extent - The largest side of the model, to tell a flat part from an empty one
 * @return {{volume: Float64Array, area: Float64Array, insideOut: Uint8Array}} Each part's signed volume, its
 *   surface area, and 1 for those to turn
 */
export function partVolumes(points, tri, flip, part, parts, extent) {
	const triangles = tri.length / 3
	const centreX = new Float64Array(parts)
	const centreY = new Float64Array(parts)
	const centreZ = new Float64Array(parts)
	const members = new Float64Array(parts)
	for (let t = 0; t < triangles; t++) {
		const p = part[t]
		for (let k = 0; k < 3; k++) {
			const v = tri[t * 3 + k] * 3
			centreX[p] += points[v]
			centreY[p] += points[v + 1]
			centreZ[p] += points[v + 2]
		}
		members[p] += 3
	}
	for (let p = 0; p < parts; p++) {
		centreX[p] /= members[p] || 1
		centreY[p] /= members[p] || 1
		centreZ[p] /= members[p] || 1
	}

	const volume = new Float64Array(parts)
	const area = new Float64Array(parts)
	// Each part's box, for finding what a ray can meet, and its vertex with the highest x
	const boxes = new Float64Array(parts * 6)
	const highest = new Int32Array(parts).fill(-1)
	for (let p = 0; p < parts; p++) {
		boxes.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], p * 6)
	}
	for (let t = 0; t < triangles; t++) {
		const p = part[t]
		const a = tri[t * 3] * 3
		const b = tri[t * 3 + 1] * 3
		const c = tri[t * 3 + 2] * 3
		const ax = points[a] - centreX[p]
		const ay = points[a + 1] - centreY[p]
		const az = points[a + 2] - centreZ[p]
		const bx = points[b] - centreX[p]
		const by = points[b + 1] - centreY[p]
		const bz = points[b + 2] - centreZ[p]
		const cx = points[c] - centreX[p]
		const cy = points[c + 1] - centreY[p]
		const cz = points[c + 2] - centreZ[p]
		const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
		volume[p] += (flip[t] ? -det : det) / 6
		const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
		const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
		const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
		area[p] += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2
		growBox(boxes, p, points, a)
		growBox(boxes, p, points, b)
		growBox(boxes, p, points, c)
		noteHighest(highest, p, points, a)
		noteHighest(highest, p, points, b)
		noteHighest(highest, p, points, c)
	}

	const insideOut = new Uint8Array(parts)
	// A flat part has no inside to be turned
	const negligible = (extent || 1) ** 3 * 1e-9
	// Each part that comes out negative is tested against every triangle, so a model of
	// thousands of negative parts is given a limit: past it a part is left as it is, which is
	// the safe way to be wrong about one that may be a cavity
	const budget = { left: RAY_BUDGET }
	for (let p = 0; p < parts; p++) {
		if (volume[p] < -negligible && !insideAnother(p, points, tri, part, parts, boxes, highest[p], budget)) {
			insideOut[p] = 1
		}
	}
	return { volume, area, insideOut }
}

/**
 * @param {Int32Array} highest - Each part's vertex with the highest x so far, -1 for none
 * @param {number} p - The part
 * @param {Float64Array|Float32Array} points - xyz of each welded vertex
 * @param {number} v - Offset of a vertex in `points`
 */
function noteHighest(highest, p, points, v) {
	if (highest[p] === -1 || points[v] > points[highest[p]]) {
		highest[p] = v
	}
}

/**
 * @param {Float64Array} boxes - Each part's box, min then max
 * @param {number} p - The part
 * @param {Float64Array|Float32Array} points - xyz of each welded vertex
 * @param {number} v - Offset of a vertex in `points`
 */
function growBox(boxes, p, points, v) {
	for (let axis = 0; axis < 3; axis++) {
		const value = points[v + axis]
		if (value < boxes[p * 6 + axis]) { boxes[p * 6 + axis] = value }
		if (value > boxes[p * 6 + 3 + axis]) { boxes[p * 6 + 3 + axis] = value }
	}
}

// A ray that no axis-aligned face of a model lines up with
const RAY = [1, 0.1234567, 0.0765432]
// How many triangles in all the rays of a model may be tested against: about a second
const RAY_BUDGET = 4e8

/**
 * Whether a part lies inside another one: a ray from just beyond its highest point, along
 * +x, meets the other parts' surfaces an odd number of times.
 *
 * @param {number} p - The part
 * @param {Float64Array|Float32Array} points - xyz of each welded vertex
 * @param {Int32Array} tri - Welded corners, three per triangle
 * @param {Int32Array} part - Each triangle's part
 * @param {number} parts - How many parts
 * @param {Float64Array} boxes - Each part's box, min then max
 * @param {number} top - Offset in `points` of the part's vertex with the highest x
 * @param {{left: number}} budget - How many more triangles may be tested, in all
 * @return {boolean} True when it does, or when the budget is used up
 */
function insideAnother(p, points, tri, part, parts, boxes, top, budget) {
	if (parts < 2) {
		return false
	}
	budget.left -= part.length
	if (budget.left < 0) {
		return true
	}
	// The point just past the part's highest x
	let ox = points[top]
	const oy = points[top + 1]
	const oz = points[top + 2]
	const reach = Math.max(boxes[p * 6 + 3] - boxes[p * 6], boxes[p * 6 + 4] - boxes[p * 6 + 1], boxes[p * 6 + 5] - boxes[p * 6 + 2], 1e-12)
	ox += reach * 1e-6
	const candidates = new Uint8Array(parts)
	for (let q = 0; q < parts; q++) {
		const reachesRay = boxes[q * 6 + 3] >= ox && boxes[q * 6 + 1] <= oy && boxes[q * 6 + 4] >= oy
			&& boxes[q * 6 + 2] <= oz && boxes[q * 6 + 5] >= oz
		candidates[q] = q !== p && reachesRay ? 1 : 0
	}
	let crossings = 0
	for (let t = 0; t < part.length; t++) {
		if (!candidates[part[t]]) {
			continue
		}
		const a = tri[t * 3] * 3
		const b = tri[t * 3 + 1] * 3
		const c = tri[t * 3 + 2] * 3
		// Moller-Trumbore
		const e1x = points[b] - points[a]
		const e1y = points[b + 1] - points[a + 1]
		const e1z = points[b + 2] - points[a + 2]
		const e2x = points[c] - points[a]
		const e2y = points[c + 1] - points[a + 1]
		const e2z = points[c + 2] - points[a + 2]
		const px = RAY[1] * e2z - RAY[2] * e2y
		const py = RAY[2] * e2x - RAY[0] * e2z
		const pz = RAY[0] * e2y - RAY[1] * e2x
		const det = e1x * px + e1y * py + e1z * pz
		if (Math.abs(det) < 1e-18) {
			continue
		}
		const inverse = 1 / det
		const tx = ox - points[a]
		const ty = oy - points[a + 1]
		const tz = oz - points[a + 2]
		const u = (tx * px + ty * py + tz * pz) * inverse
		if (u < 0 || u > 1) {
			continue
		}
		const qx = ty * e1z - tz * e1y
		const qy = tz * e1x - tx * e1z
		const qz = tx * e1y - ty * e1x
		const v = (RAY[0] * qx + RAY[1] * qy + RAY[2] * qz) * inverse
		if (v < 0 || u + v > 1) {
			continue
		}
		if ((e2x * qx + e2y * qy + e2z * qz) * inverse > 0) {
			crossings++
		}
	}
	return crossings % 2 === 1
}

/**
 * The loops round a mesh's holes.
 *
 * @param {Int32Array} tri - Welded corners, three per triangle
 * @param {object} edges - From buildEdges
 * @param {Uint8Array} turned - 1 for a triangle that is turned, so its edges run the other way
 * @param {number} vertexCount - How many welded vertices there are
 * @return {{loops: Array<{vertices: Int32Array, simple: boolean}>, boundaryEdges: number}} The
 *   loops, each its welded vertices in the direction the mesh's own edges run along it; a loop
 *   is simple when each of its vertices has one edge in and one out and it closes
 */
export function boundaryLoops(tri, edges, turned, vertexCount) {
	const from = []
	const to = []
	for (let e = 0; e < edges.edges; e++) {
		if (edges.count[e] !== 1) {
			continue
		}
		const h = edges.first[e]
		const t = (h - (h % 3)) / 3
		const a = tri[h]
		const b = tri[t * 3 + ((h % 3) + 1) % 3]
		from.push(turned[t] ? b : a)
		to.push(turned[t] ? a : b)
	}
	const total = from.length
	if (!total) {
		return { loops: [], boundaryEdges: 0 }
	}
	// Edges leaving each vertex, in a flat list
	const start = new Int32Array(vertexCount + 1)
	const incoming = new Int32Array(vertexCount)
	for (let i = 0; i < total; i++) {
		start[from[i] + 1]++
		incoming[to[i]]++
	}
	for (let v = 0; v < vertexCount; v++) {
		start[v + 1] += start[v]
	}
	const fill = start.slice(0, vertexCount)
	const leaving = new Int32Array(total)
	for (let i = 0; i < total; i++) {
		leaving[fill[from[i]]++] = i
	}

	const used = new Uint8Array(total)
	const loops = []
	for (let i = 0; i < total; i++) {
		if (used[i]) {
			continue
		}
		const vertices = []
		let simple = true
		let current = i
		for (;;) {
			used[current] = 1
			const v = from[current]
			vertices.push(v)
			if (start[v + 1] - start[v] !== 1 || incoming[v] !== 1) {
				simple = false
			}
			const w = to[current]
			let next = -1
			for (let k = start[w]; k < start[w + 1]; k++) {
				// Back to where the loop began, or on to an edge not walked yet
				if (leaving[k] === i || !used[leaving[k]]) {
					next = leaving[k]
					break
				}
			}
			if (next === -1) {
				// A chain that does not come back
				simple = false
				break
			}
			if (next === i) {
				break
			}
			current = next
		}
		loops.push({ vertices: Int32Array.from(vertices), simple })
	}
	return { loops, boundaryEdges: total }
}
