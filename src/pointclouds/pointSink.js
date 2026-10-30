/**
 * Where a reader puts a scan's points. Allocated once, at the smaller of the file's point
 * count and the budget, so memory stays bounded however large the file; a file with more
 * points than that is thinned as it is read: evenly when the count is known up front,
 * by reservoir sampling when it is not (text formats).
 *
 * Survey files use coordinates in the millions, where 32-bit floats keep only centimetres.
 * Every point is re-centred on an origin in double precision before it is stored, so it
 * reaches the GPU as a small number that keeps its millimetres.
 */

/**
 * A small seeded PRNG (mulberry32), so a thinned text file comes out the same each time.
 *
 * @param {number} seed - Any integer
 * @return {function(): number} Numbers in [0, 1)
 */
function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6D2B79F5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

export class PointSink {
	/**
	 * @param {object} options - What the reader knows before the first point
	 * @param {?number} [options.total] - The file's point count, when its header gives one
	 * @param {number} options.budget - Points kept at most
	 * @param {{color?: boolean, intensity?: boolean, classification?: boolean}} [options.attributes] - What the file records
	 * @param {?number[]} [options.origin] - Where to re-centre; the first point when not given
	 * @param {number} [options.seed] - For the reservoir
	 */
	constructor({ total = null, budget, attributes = {}, origin = null, seed = 1 }) {
		this.total = total
		this.capacity = Math.max(0, Math.floor(total === null ? budget : Math.min(total, budget)))
		this.positions = new Float32Array(this.capacity * 3)
		this.colors = attributes.color ? new Uint8Array(this.capacity * 3) : undefined
		this.intensity = attributes.intensity ? new Uint16Array(this.capacity) : undefined
		this.classification = attributes.classification ? new Uint8Array(this.capacity) : undefined
		this.origin = origin ? [...origin] : null
		this.random = mulberry32(seed)
		this.seen = 0
		this.count = 0
	}

	/**
	 * One point, in the file's own coordinates (float64).
	 *
	 * @param {number} x - X
	 * @param {number} y - Y
	 * @param {number} z - Z
	 * @param {number} [r] - Red, 0–255
	 * @param {number} [g] - Green, 0–255
	 * @param {number} [b] - Blue, 0–255
	 * @param {number} [intensity] - 0–65535
	 * @param {number} [classification] - A LAS class
	 */
	add(x, y, z, r, g, b, intensity, classification) {
		const index = this.seen++
		if (this.origin === null) {
			this.origin = [x, y, z]
		}
		const slot = this.slotFor(index)
		if (slot < 0) {
			return
		}
		const p = slot * 3
		this.positions[p] = x - this.origin[0]
		this.positions[p + 1] = y - this.origin[1]
		this.positions[p + 2] = z - this.origin[2]
		if (this.colors) {
			this.colors[p] = r
			this.colors[p + 1] = g
			this.colors[p + 2] = b
		}
		if (this.intensity) {
			this.intensity[slot] = intensity
		}
		if (this.classification) {
			this.classification[slot] = classification
		}
	}

	/**
	 * @param {number} index - The point's place in the file
	 * @return {number} Where to store it, or -1 to skip it
	 */
	slotFor(index) {
		if (this.total !== null) {
			// Even thinning: one point for each step of total / capacity. A file holding
			// more points than its header says gets no more room than was allocated.
			const keep = this.capacity >= this.total
				|| Math.floor(((index + 1) * this.capacity) / this.total) > Math.floor((index * this.capacity) / this.total)
			return keep && this.count < this.capacity ? this.count++ : -1
		}
		if (this.count < this.capacity) {
			return this.count++
		}
		// Algorithm R: every point seen so far has the same chance of being kept
		const j = Math.floor(this.random() * (index + 1))
		return j < this.capacity ? j : -1
	}

	/**
	 * @return {{positions: Float32Array, colors?: Uint8Array, intensity?: Uint16Array, classification?: Uint8Array, count: number, total: number, origin: number[], bounds: {min: number[], max: number[]}}}
	 *   The kept points, re-centred, and the number seen
	 */
	finish() {
		const { count } = this
		const trim = (array, size) => (array && array.length !== count * size ? array.slice(0, count * size) : array)
		const positions = trim(this.positions, 3)
		const min = [Infinity, Infinity, Infinity]
		const max = [-Infinity, -Infinity, -Infinity]
		for (let i = 0; i < positions.length; i += 3) {
			for (let a = 0; a < 3; a++) {
				const v = positions[i + a]
				min[a] = Math.min(min[a], v)
				max[a] = Math.max(max[a], v)
			}
		}
		const result = { positions, count, total: this.seen, origin: this.origin ?? [0, 0, 0], bounds: count ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] } }
		if (this.colors) {
			result.colors = trim(this.colors, 3)
		}
		if (this.intensity) {
			result.intensity = trim(this.intensity, 1)
		}
		if (this.classification) {
			result.classification = trim(this.classification, 1)
		}
		return result
	}
}
