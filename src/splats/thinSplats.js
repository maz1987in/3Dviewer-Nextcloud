/**
 * Thinning a splat to the device's budget: the kept splats' rows are copied from Spark's
 * PackedSplats into a new one, word for word, with their spherical harmonics. Spark's own
 * extractSplats decodes and re-encodes each splat and leaves the harmonics behind, so a
 * thinned capture would lose the colour that changes with the view; copying rows also
 * takes a fraction of the time, on the page's thread.
 */

/** Words a splat takes in each of Spark's arrays. */
const ROW_WORDS = Object.freeze({ packedArray: 4, sh1: 2, sh2: 4, sh3: 4 })

/** Spark's splat textures are 2048 wide and up to 2048 high, in layers. */
const TEXTURE_SIDE = 2048

/**
 * @param {number} count - Splats
 * @return {number} Splats Spark's texture holds for them: whole rows, then whole layers
 */
export function textureCapacity(count) {
	const height = Math.max(1, Math.min(TEXTURE_SIDE, Math.ceil(count / TEXTURE_SIDE)))
	return TEXTURE_SIDE * height * Math.ceil(count / (TEXTURE_SIDE * height))
}

/**
 * @param {Uint32Array} from - One of Spark's arrays
 * @param {Uint32Array} indices - The splats kept
 * @param {number} words - Words a splat takes in it
 * @param {number} capacity - Splats the copy has room for
 * @return {Uint32Array} The kept splats' rows, in order
 */
function copyRows(from, indices, words, capacity) {
	const to = new Uint32Array(capacity * words)
	for (let i = 0; i < indices.length; i++) {
		const source = indices[i] * words
		const target = i * words
		for (let w = 0; w < words; w++) {
			to[target + w] = from[source + w]
		}
	}
	return to
}

/**
 * @param {object} packed - Spark's PackedSplats, as read from the file
 * @param {Uint32Array} indices - The splats to keep, in order
 * @param {Function} PackedSplats - Spark's class, to make the thinned one with
 * @return {object} A PackedSplats of the kept splats
 */
export function thinSplats(packed, indices, PackedSplats) {
	const extra = {}
	for (const key of ['sh1', 'sh2', 'sh3']) {
		if (packed.extra?.[key]) {
			extra[key] = copyRows(packed.extra[key], indices, ROW_WORDS[key], indices.length)
		}
	}
	return new PackedSplats({
		packedArray: copyRows(packed.packedArray, indices, ROW_WORDS.packedArray, textureCapacity(indices.length)),
		numSplats: indices.length,
		extra,
		splatEncoding: packed.splatEncoding,
	})
}
