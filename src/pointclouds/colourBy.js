/**
 * What a scan is coloured by. The colours are written into the cloud's own `color`
 * attribute on the CPU, so the ordinary PointsMaterial, clipping and the thumbnail
 * renderer all draw them without a shader of their own.
 */

export const COLOUR_BY = Object.freeze(['file', 'height', 'intensity', 'classification', 'single'])

/** Low to high. */
const HEIGHT_RAMP = [0x30123b, 0x4686fb, 0x1be5b5, 0xa4fc3c, 0xfb8022, 0x7a0403]

/** The standard LAS classes worth telling apart; any other class is grey. */
const CLASS_COLOURS = new Map([
	[1, 0x9e9e9e], // unclassified
	[2, 0xa0784b], // ground
	[3, 0x9acd32], // low vegetation
	[4, 0x3cb043], // medium vegetation
	[5, 0x1e7b34], // high vegetation
	[6, 0xe2725b], // building
	[7, 0xff00ff], // noise
	[9, 0x3d85c6], // water
	[11, 0x7f7f7f], // road
	[17, 0xb8860b], // bridge
])
const OTHER_CLASS = 0x9e9e9e

const SINGLE_COLOUR = 0x8fa3b3

/** How many intensity values the percentiles are taken from, at most. */
const PERCENTILE_SAMPLE = 100_000

/**
 * @param {{attributes: {color?: boolean, intensity?: boolean, classification?: boolean}}} meta - The cloud's tdvPointCloud
 * @return {string[]} The modes this cloud can be coloured by, in COLOUR_BY's order
 */
export function availableColourBy({ attributes }) {
	return COLOUR_BY.filter((mode) => (
		(mode === 'file' && attributes.color)
		|| (mode === 'intensity' && attributes.intensity)
		|| (mode === 'classification' && attributes.classification)
		|| mode === 'height'
		|| mode === 'single'
	))
}

/**
 * @param {{attributes: {color?: boolean}}} meta - The cloud's tdvPointCloud
 * @return {string} Its own colours when it has them, otherwise height
 */
export function defaultColourBy({ attributes }) {
	return attributes.color ? 'file' : 'height'
}

/**
 * @param {Uint8Array} target - The cloud's colour attribute array, 3 per point
 * @param {string} mode - One of COLOUR_BY
 * @param {{positions: Float32Array, colors?: Uint8Array, intensity?: Uint16Array, classification?: Uint8Array, count: number, bounds: {min: number[], max: number[]}}} data - The finished sink
 * @param {string} up - Which way is up, for height ('+y', '-y', '+z', '-z')
 */
export function writeColours(target, mode, data, up) {
	const { count } = data
	if (mode === 'file' && data.colors) {
		target.set(data.colors.subarray(0, count * 3))
	} else if (mode === 'height') {
		writeHeight(target, data, up)
	} else if (mode === 'intensity' && data.intensity) {
		writeIntensity(target, data.intensity, count)
	} else if (mode === 'classification' && data.classification) {
		for (let i = 0; i < count; i++) {
			put(target, i, CLASS_COLOURS.get(data.classification[i]) ?? OTHER_CLASS)
		}
	} else {
		for (let i = 0; i < count; i++) {
			put(target, i, SINGLE_COLOUR)
		}
	}
}

/**
 * @param {Uint8Array} target - 3 per point
 * @param {number} i - The point
 * @param {number} colour - 0xRRGGBB
 */
function put(target, i, colour) {
	target[i * 3] = (colour >> 16) & 255
	target[i * 3 + 1] = (colour >> 8) & 255
	target[i * 3 + 2] = colour & 255
}

function writeHeight(target, { positions, count, bounds }, up) {
	const axis = up[1] === 'z' ? 2 : 1
	const sign = up[0] === '-' ? -1 : 1
	const low = sign > 0 ? bounds.min[axis] : -bounds.max[axis]
	const span = Math.abs(bounds.max[axis] - bounds.min[axis])
	const last = HEIGHT_RAMP.length - 1
	for (let i = 0; i < count; i++) {
		const h = span > 0 ? Math.min(1, Math.max(0, (sign * positions[i * 3 + axis] - low) / span)) : 0
		const at = h * last
		const k = Math.min(last - 1, Math.floor(at))
		const f = at - k
		const a = HEIGHT_RAMP[k]
		const b = HEIGHT_RAMP[k + 1]
		for (let c = 0; c < 3; c++) {
			const shift = 16 - c * 8
			const ca = (a >> shift) & 255
			const cb = (b >> shift) & 255
			target[i * 3 + c] = Math.round(ca + (cb - ca) * f)
		}
	}
}

function writeIntensity(target, intensity, count) {
	// Percentiles from an even sample: a few bright returns shouldn't turn the rest black
	const step = Math.max(1, Math.floor(count / PERCENTILE_SAMPLE))
	const sample = []
	for (let i = 0; i < count; i += step) {
		sample.push(intensity[i])
	}
	sample.sort((a, b) => a - b)
	const at = (p) => sample[Math.floor(p * (sample.length - 1))] ?? 0
	const low = at(0.01)
	const high = at(0.99)
	const span = high - low
	for (let i = 0; i < count; i++) {
		const v = span > 0 ? Math.round(Math.min(1, Math.max(0, (intensity[i] - low) / span)) * 255) : 128
		target[i * 3] = v
		target[i * 3 + 1] = v
		target[i * 3 + 2] = v
	}
}
