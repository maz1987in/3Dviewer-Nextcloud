/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * How thick a part's walls are.
 *
 * From the centre of each triangle, a ray goes inward along the triangle's normal; the
 * distance to the first surface it meets is the wall's thickness there. Rays start at
 * triangle centres rather than vertices: a vertex is often a corner, and a ray from a
 * corner runs along the faces beside it and grazes them. Each vertex then takes the
 * thinnest of the triangles around it, so a thin wall is coloured thin right to its edges.
 * The rays are cast against a bounding volume hierarchy (three-mesh-bvh), so a part of a
 * million triangles takes seconds rather than minutes. This runs in the print-check worker.
 */

import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

/**
 * Measure one part.
 *
 * @param {object} part - The part's geometry, in scene units
 * @param {Float32Array} part.positions - xyz per vertex
 * @param {?(Uint16Array|Uint32Array)} part.index - Three vertex indices per triangle, or null.
 *   Normals are not needed: each triangle's own normal is what counts
 * @param {object} [options] - Options
 * @param {number} [options.budget] - Measure at most this many triangles; above it an even
 *   sample is measured and the rest take a measured neighbour's value
 * @param {function(number, number): void} [options.onProgress] - Called as `(done, total)`
 *   in triangles of the part, at most every 2% of the work
 * @return {{thickness: Float32Array, triangleThickness: Float32Array, sampled: boolean}}
 *   Per vertex and per triangle, in scene units; Infinity where no wall was met
 */
export function measurePartThickness({ positions, index = null }, { budget = 300000, onProgress = null } = {}) {
	const vertexCount = Math.floor(positions.length / 3)
	const triangleCount = Math.floor((index ? index.length : vertexCount) / 3)
	const thickness = new Float32Array(vertexCount).fill(Infinity)
	const triangleThickness = new Float32Array(triangleCount).fill(Infinity)
	if (triangleCount === 0) {
		return { thickness, triangleThickness, sampled: false }
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
	if (index) {
		// MeshBVH reorders the index it is given; this copy is its own
		geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index), 1))
	}
	const bvh = new MeshBVH(geometry)
	geometry.computeBoundingBox()
	const extent = geometry.boundingBox.getSize(new THREE.Vector3()).length() || 1
	const nudge = extent * 1e-6

	const vertexOf = (t, corner) => (index ? index[t * 3 + corner] : t * 3 + corner)
	const a = new THREE.Vector3()
	const b = new THREE.Vector3()
	const c = new THREE.Vector3()
	const normal = new THREE.Vector3()
	const ray = new THREE.Ray()

	const stride = Math.max(1, Math.ceil(triangleCount / budget))
	const measured = Math.ceil(triangleCount / stride)
	const step = Math.max(1, Math.floor(measured / 50))
	let done = 0

	for (let t = 0; t < triangleCount; t += stride) {
		a.fromArray(positions, vertexOf(t, 0) * 3)
		b.fromArray(positions, vertexOf(t, 1) * 3)
		c.fromArray(positions, vertexOf(t, 2) * 3)
		normal.crossVectors(b.clone().sub(a), c.clone().sub(a))
		const length = normal.length()
		if (length > 0 && Number.isFinite(length)) {
			normal.divideScalar(length)
			// From just behind the centre, inward: the triangle itself is never hit
			ray.origin.copy(a).add(b).add(c).divideScalar(3).addScaledVector(normal, -nudge)
			ray.direction.copy(normal).negate()
			const hit = bvh.raycastFirst(ray, THREE.DoubleSide)
			if (hit) {
				triangleThickness[t] = hit.distance + nudge
			}
		}
		done++
		if (onProgress && (done % step === 0 || done === measured)) {
			// In triangles of the part, so a sampled part counts the same as the worker's total
			onProgress(done === measured ? triangleCount : Math.min(triangleCount, done * stride), triangleCount)
		}
	}

	// A triangle that was not measured takes the value of the one measured just before it
	if (stride > 1) {
		for (let t = 0; t < triangleCount; t++) {
			if (t % stride !== 0) {
				triangleThickness[t] = triangleThickness[t - (t % stride)]
			}
		}
	}

	for (let t = 0; t < triangleCount; t++) {
		for (let corner = 0; corner < 3; corner++) {
			const v = vertexOf(t, corner)
			if (triangleThickness[t] < thickness[v]) {
				thickness[v] = triangleThickness[t]
			}
		}
	}
	return { thickness, triangleThickness, sampled: stride > 1 }
}
