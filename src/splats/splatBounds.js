/**
 * Where a splat is. A capture leaves "floaters", stray splats far from its subject, so the
 * box is taken from a sample of the centres without the outer few on each axis; the
 * camera then frames the subject, not the strays.
 */
import * as THREE from 'three'
import { BOUNDS_PERCENTILE, BOUNDS_SAMPLE } from './limits.js'

/**
 * @param {number} total - How many there are
 * @param {number} count - How many to take
 * @return {Uint32Array} min(total, count) indices, evenly spaced and increasing:
 *   index i is floor(i × total / count)
 */
export function evenIndices(total, count) {
	const n = Math.max(0, Math.min(total, count))
	const indices = new Uint32Array(n)
	for (let i = 0; i < n; i++) {
		indices[i] = Math.floor((i * total) / n)
	}
	return indices
}

/**
 * @param {Float64Array} sorted - Values in ascending order
 * @param {number} q - 0 to 1
 * @return {number} The value at that quantile, the nearest one below it
 */
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]

/**
 * @param {{numSplats: number, getSplat: function(number): {center: THREE.Vector3}}} packed - Spark's PackedSplats
 * @return {THREE.Box3} The box of its centres, without the outer BOUNDS_PERCENTILE on each axis
 */
export function splatBounds(packed) {
	const indices = evenIndices(packed.numSplats, BOUNDS_SAMPLE)
	const axes = [new Float64Array(indices.length), new Float64Array(indices.length), new Float64Array(indices.length)]
	indices.forEach((index, i) => {
		const { center } = packed.getSplat(index)
		axes[0][i] = center.x
		axes[1][i] = center.y
		axes[2][i] = center.z
	})
	const box = new THREE.Box3()
	if (!indices.length) {
		return box
	}
	for (const axis of axes) {
		axis.sort()
	}
	box.min.set(...axes.map((a) => quantile(a, BOUNDS_PERCENTILE)))
	box.max.set(...axes.map((a) => quantile(a, 1 - BOUNDS_PERCENTILE)))
	return box
}
