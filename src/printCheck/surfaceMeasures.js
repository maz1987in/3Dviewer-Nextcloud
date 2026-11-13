/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Print check's per-vertex and per-triangle measurements, on plain arrays, so the
 * print-check worker can run them off the page's thread: the model's extent along the
 * bed's axes, its overhanging area, and its volume and surface area.
 *
 * Each one does the same arithmetic, in the same order, as the three.js version it
 * replaces on the page (`modelExtentMm`, `overhangShare`, `modelVolumeAndArea`), so the
 * results are the same to the last bit; tests/unit/printCheck/surfaceMeasures.test.js
 * holds them to that.
 *
 * Plain module, no DOM and no three.js, so the worker can import it.
 */

const DEGREES = 180 / Math.PI

/**
 * What Print check measures the model's size on: every mesh, line and point set with
 * vertices, overlays left out, in the order `modelExtentMm` visits them. The meshes among
 * them are the parts `overhangShare` and `modelVolumeAndArea` are given, in the same order.
 *
 * @param {?object} root - The model, a THREE.Object3D
 * @return {object[]} The objects
 */
export function measuredObjects(root) {
	const objects = []
	root?.traverse((child) => {
		if ((child.isMesh || child.isPoints || child.isLine) && child.geometry?.attributes?.position && !child.userData?.viewerOverlay) {
			objects.push(child)
		}
	})
	return objects
}

/**
 * A copy of one object's geometry for the worker, in the object's own space. The
 * positions are the values `BufferAttribute.getX/Y/Z` give, so measuring the copy is
 * measuring the model: a plain float attribute is copied as it is, and any other
 * (interleaved, quantised) is read value by value into doubles, which hold them exactly.
 *
 * @param {object} object - A THREE.Mesh, THREE.Points or THREE.Line
 * @return {MeasuredPart} Its part
 */
export function surfacePart(object) {
	const attribute = object.geometry.attributes.position
	let positions
	if (!attribute.isInterleavedBufferAttribute && !attribute.normalized && attribute.itemSize === 3 && attribute.array instanceof Float32Array) {
		positions = attribute.array.slice(0, attribute.count * 3)
	} else {
		positions = new Float64Array(attribute.count * 3)
		for (let i = 0; i < attribute.count; i++) {
			positions[i * 3] = attribute.getX(i)
			positions[i * 3 + 1] = attribute.getY(i)
			positions[i * 3 + 2] = attribute.getZ(i)
		}
	}
	const surface = !!object.isMesh
	return { positions, index: surface ? (object.geometry.index?.array.slice() ?? null) : null, surface }
}

/**
 * A part as the worker holds it.
 *
 * @typedef {object} MeasuredPart
 * @property {Float32Array|Float64Array} positions - xyz per vertex, in the part's own space
 * @property {?(Uint16Array|Uint32Array)} index - Three vertex indices per triangle, or null
 * @property {boolean} surface - A mesh (counted for overhangs, volume and area), not only
 *   points or lines (counted for the extent alone)
 */

/**
 * Put vertex `v` of `positions`, moved by the matrix `e`, into `out` at `at`: what
 * `Vector3.applyMatrix4` does, perspective divide included.
 *
 * @param {ArrayLike<number>} positions - xyz per vertex
 * @param {number} v - The vertex
 * @param {ArrayLike<number>} e - A Matrix4's 16 elements, column-major
 * @param {Float64Array} out - Where the point goes
 * @param {number} at - Its offset in `out`
 */
function worldPoint(positions, v, e, out, at) {
	const x = positions[v * 3]
	const y = positions[v * 3 + 1]
	const z = positions[v * 3 + 2]
	const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
	out[at] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
	out[at + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w
	out[at + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
}

/**
 * @param {Float64Array} p - A point at offset `at`
 * @param {number} at - Its offset
 * @param {number[]} axis - A direction, xyz
 * @return {number} How far along `axis` the point is
 */
const along = (p, at, axis) => p[at] * axis[0] + p[at + 1] * axis[1] + p[at + 2] * axis[2]

/**
 * The lowest and highest point of every part along the bed's axes, as `modelExtentMm`
 * measures it.
 *
 * @param {MeasuredPart[]} parts - The parts
 * @param {ArrayLike<number>[]} matrices - Each part's world matrix, 16 elements
 * @param {{up: number[], width: number[], depth: number[]}} axes - The bed's axes, xyz each
 * @return {?{min: number[], max: number[]}} `[width, up, depth]` each, in scene units;
 *   null when no vertex has a finite position
 */
export function extentAlong(parts, matrices, axes) {
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	const p = new Float64Array(3)
	parts.forEach((part, i) => {
		const e = matrices[i]
		const count = Math.floor(part.positions.length / 3)
		for (let v = 0; v < count; v++) {
			worldPoint(part.positions, v, e, p, 0)
			if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
				continue
			}
			const w = along(p, 0, axes.width)
			const u = along(p, 0, axes.up)
			const d = along(p, 0, axes.depth)
			min[0] = Math.min(min[0], w)
			min[1] = Math.min(min[1], u)
			min[2] = Math.min(min[2], d)
			max[0] = Math.max(max[0], w)
			max[1] = Math.max(max[1], u)
			max[2] = Math.max(max[2], d)
		}
	})
	return Number.isFinite(min[0]) ? { min, max } : null
}

/**
 * The overhanging area of the surface parts and their whole area, as `overhangShare`
 * measures it, in squared scene units.
 *
 * @param {MeasuredPart[]} parts - The parts; only surface parts count
 * @param {ArrayLike<number>[]} matrices - Each part's world matrix, 16 elements
 * @param {number[]} up - The bed's up axis, xyz, a unit vector
 * @param {number} thresholdDeg - Steeper than this is overhang
 * @param {number} bedHeight - The bed's height along `up`, in scene units
 * @param {number} bedEpsilon - A triangle no higher than `bedHeight + bedEpsilon` rests on the bed
 * @return {{overhangArea: number, totalArea: number}} The two areas
 */
export function overhangAreas(parts, matrices, up, thresholdDeg, bedHeight, bedEpsilon) {
	const p = new Float64Array(9)
	let overhangArea = 0
	let totalArea = 0
	parts.forEach((part, i) => {
		if (!part.surface) {
			return
		}
		const e = matrices[i]
		const { positions, index } = part
		const triangles = (index ? index.length : positions.length / 3) / 3
		for (let t = 0; t < triangles; t++) {
			const i0 = t * 3
			worldPoint(positions, index ? index[i0] : i0, e, p, 0)
			worldPoint(positions, index ? index[i0 + 1] : i0 + 1, e, p, 3)
			worldPoint(positions, index ? index[i0 + 2] : i0 + 2, e, p, 6)
			const abx = p[3] - p[0]
			const aby = p[4] - p[1]
			const abz = p[5] - p[2]
			const acx = p[6] - p[0]
			const acy = p[7] - p[1]
			const acz = p[8] - p[2]
			let nx = aby * acz - abz * acy
			let ny = abz * acx - abx * acz
			let nz = abx * acy - aby * acx
			const twiceArea = Math.sqrt(nx * nx + ny * ny + nz * nz)
			// Degenerate, or a broken exporter's NaN: no area, no direction
			if (!(twiceArea > 1e-12) || !Number.isFinite(twiceArea)) {
				continue
			}
			const area = twiceArea / 2
			totalArea += area

			const inverse = 1 / twiceArea
			nx *= inverse
			ny *= inverse
			nz *= inverse
			const down = -(nx * up[0] + ny * up[1] + nz * up[2])
			// Facing up has no overhang angle (overhang.overhangAngleDeg)
			if (down < 0 || Math.asin(Math.min(1, down)) * DEGREES <= thresholdDeg) {
				continue
			}
			const highest = Math.max(along(p, 0, up), along(p, 3, up), along(p, 6, up))
			if (highest <= bedHeight + bedEpsilon) {
				continue
			}
			overhangArea += area
		}
	})
	return { overhangArea, totalArea }
}

/**
 * The volume and surface area of the surface parts, in the world, as
 * `modelVolumeAndArea` measures them, in scene units: multiply by the millimetres per
 * unit cubed and squared.
 *
 * @param {MeasuredPart[]} parts - The parts; only surface parts count
 * @param {ArrayLike<number>[]} matrices - Each part's world matrix, 16 elements
 * @return {{volume: number, area: number}} The two
 */
export function volumeAndArea(parts, matrices) {
	let volume = 0
	let area = 0
	const p = [0, 0, 0, 0, 0, 0, 0, 0, 0]
	parts.forEach((part, i) => {
		if (!part.surface) {
			return
		}
		const e = matrices[i]
		const { positions, index } = part
		const triangles = (index ? index.length : positions.length / 3) / 3
		let signed = 0
		for (let t = 0; t < triangles; t++) {
			for (let corner = 0; corner < 3; corner++) {
				const v = index ? index[t * 3 + corner] : t * 3 + corner
				const x = positions[v * 3]
				const y = positions[v * 3 + 1]
				const z = positions[v * 3 + 2]
				p[corner * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]
				p[corner * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
				p[corner * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
			}
			const [ax, ay, az, bx, by, bz, cx, cy, cz] = p
			if (![ax, ay, az, bx, by, bz, cx, cy, cz].every(Number.isFinite)) {
				continue
			}
			// a · (b × c) / 6, and |(b − a) × (c − a)| / 2
			signed += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
			const ux = bx - ax
			const uy = by - ay
			const uz = bz - az
			const wx = cx - ax
			const wy = cy - ay
			const wz = cz - az
			area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
		}
		volume += Math.abs(signed)
	})
	return { volume, area }
}

/**
 * Everything Print check measures on the model for one placement and one set of
 * settings: the extent, then the overhangs against the bed it sets, then volume and area.
 *
 * @param {MeasuredPart[]} parts - The parts
 * @param {object} request - What to measure
 * @param {ArrayLike<number>[]} request.matrices - Each part's world matrix
 * @param {{up: number[], width: number[], depth: number[]}} request.axes - The bed's axes
 * @param {number} request.thresholdDeg - The overhang angle
 * @param {number} request.bedEpsilon - How close to the bed counts as on it, in scene units
 * @return {{extent: ?{min: number[], max: number[]}, overhangArea: number, totalArea: number, volume: number, area: number}}
 *   The measurements; `extent` as from extentAlong
 */
export function measureSurface(parts, { matrices, axes, thresholdDeg, bedEpsilon }) {
	const extent = extentAlong(parts, matrices, axes)
	// As `modelExtentMm` gives it for a model with no finite vertex: everything at 0
	const bedHeight = extent ? extent.min[1] : 0
	const { overhangArea, totalArea } = overhangAreas(parts, matrices, axes.up, thresholdDeg, bedHeight, bedEpsilon)
	const { volume, area } = volumeAndArea(parts, matrices)
	return { extent, overhangArea, totalArea, volume, area }
}
