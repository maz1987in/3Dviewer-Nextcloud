/**
 * @jest-environment node
 */
/**
 * Thinning a splat copies the kept splats' packed rows, and their spherical harmonics, so
 * a thinned capture keeps the colour that changes with the view.
 */
import { textureCapacity, thinSplats } from '../../../src/splats/thinSplats.js'

/** Spark's PackedSplats as far as thinning reads and makes it. */
class PackedSplats {

	constructor(options = {}) {
		this.options = options
	}

}

/** A Uint32Array of `count` rows of `stride` words, each word naming its row and column. */
const rows = (count, stride) => Uint32Array.from({ length: count * stride }, (_, i) => Math.floor(i / stride) * 100 + (i % stride))

const source = (count, sh = 0) => ({
	numSplats: count,
	packedArray: rows(count, 4),
	extra: {
		...(sh >= 1 ? { sh1: rows(count, 2) } : {}),
		...(sh >= 2 ? { sh2: rows(count, 4) } : {}),
		...(sh >= 3 ? { sh3: rows(count, 4) } : {}),
	},
	splatEncoding: { rgbMin: 0, rgbMax: 1, sh1Max: 0.5 },
})

test('the kept splats\' packed rows, in order', () => {
	const thinned = thinSplats(source(10), Uint32Array.from([1, 4, 9]), PackedSplats)
	const { packedArray, numSplats } = thinned.options

	expect(numSplats).toBe(3)
	expect(Array.from(packedArray.subarray(0, 12))).toEqual([100, 101, 102, 103, 400, 401, 402, 403, 900, 901, 902, 903])
})

test('the packed rows fill a whole number of Spark\'s texture rows', () => {
	const { packedArray } = thinSplats(source(10), Uint32Array.from([0, 1]), PackedSplats).options

	expect(packedArray.length).toBe(2048 * 4)
	expect(textureCapacity(1)).toBe(2048)
	expect(textureCapacity(2049)).toBe(4096)
	expect(textureCapacity(5_000_000)).toBe(2048 * 2048 * 2)
})

test('the kept splats\' spherical harmonics come with them', () => {
	const { extra } = thinSplats(source(10, 3), Uint32Array.from([2, 7]), PackedSplats).options

	expect(Array.from(extra.sh1)).toEqual([200, 201, 700, 701])
	expect(Array.from(extra.sh2)).toEqual([200, 201, 202, 203, 700, 701, 702, 703])
	expect(Array.from(extra.sh3)).toEqual([200, 201, 202, 203, 700, 701, 702, 703])
})

test('a splat with no harmonics has none, and keeps its encoding', () => {
	const read = source(10)
	const { extra, splatEncoding } = thinSplats(read, Uint32Array.from([0]), PackedSplats).options

	expect(extra).toEqual({})
	expect(splatEncoding).toBe(read.splatEncoding)
})
