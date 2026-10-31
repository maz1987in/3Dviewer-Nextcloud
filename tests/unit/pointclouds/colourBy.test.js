/**
 * What a scan is coloured by: only what the file records, with height and a single
 * colour always there.
 */
import { COLOUR_BY, availableColourBy, defaultColourBy, writeColours } from '../../../src/pointclouds/colourBy.js'

const meta = (attributes) => ({ attributes: { color: false, intensity: false, classification: false, ...attributes } })
const rgbAt = (target, i) => Array.from(target.slice(i * 3, i * 3 + 3))
const hex = (value) => [(value >> 16) & 255, (value >> 8) & 255, value & 255]

/** A finished sink, as PointSink.finish() returns it. */
function cloud(points, extra = {}) {
	const positions = new Float32Array(points.flat())
	const min = [0, 1, 2].map((a) => Math.min(...points.map((p) => p[a])))
	const max = [0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])))
	return { positions, count: points.length, total: points.length, bounds: { min, max }, ...extra }
}

test('the modes, in their order', () => {
	expect(COLOUR_BY).toEqual(['file', 'height', 'intensity', 'classification', 'single'])
})

test('a bare cloud offers height and a single colour, and defaults to height', () => {
	expect(availableColourBy(meta({}))).toEqual(['height', 'single'])
	expect(defaultColourBy(meta({}))).toBe('height')
})

test('a cloud with everything offers everything, and defaults to its own colours', () => {
	expect(availableColourBy(meta({ color: true, intensity: true, classification: true }))).toEqual(COLOUR_BY)
	expect(defaultColourBy(meta({ color: true }))).toBe('file')
})

test('file colours are copied', () => {
	const data = cloud([[0, 0, 0], [1, 1, 1]], { colors: new Uint8Array([10, 20, 30, 40, 50, 60]) })
	const target = new Uint8Array(6)

	writeColours(target, 'file', data, '+y')

	expect(Array.from(target)).toEqual([10, 20, 30, 40, 50, 60])
})

test('height runs from the first to the last colour of the ramp along the up axis', () => {
	const data = cloud([[0, 5, 0], [0, 0, 10], [0, 0, 0]])
	const target = new Uint8Array(9)

	writeColours(target, 'height', data, '+z')

	expect(rgbAt(target, 1)).toEqual(hex(0x7a0403))
	expect(rgbAt(target, 0)).toEqual(hex(0x30123b))
	expect(rgbAt(target, 2)).toEqual(hex(0x30123b))
})

test('height along a downward axis is turned over', () => {
	const data = cloud([[0, 0, 0], [0, -10, 0]])
	const target = new Uint8Array(6)

	writeColours(target, 'height', data, '-y')

	expect(rgbAt(target, 1)).toEqual(hex(0x7a0403))
})

test('a flat cloud is one colour, not a division by nothing', () => {
	const data = cloud([[0, 1, 0], [5, 1, 5]])
	const target = new Uint8Array(6)

	writeColours(target, 'height', data, '+y')

	expect(rgbAt(target, 0)).toEqual(rgbAt(target, 1))
	expect(Array.from(target).every(Number.isFinite)).toBe(true)
})

test('intensity is grey between the 1st and 99th percentile', () => {
	const values = Array.from({ length: 1000 }, (_, i) => i)
	values[999] = 65535
	const data = cloud(values.map(() => [0, 0, 0]), { intensity: new Uint16Array(values) })
	const target = new Uint8Array(3000)

	writeColours(target, 'intensity', data, '+y')

	expect(rgbAt(target, 0)).toEqual([0, 0, 0])
	expect(rgbAt(target, 999)).toEqual([255, 255, 255])
	expect(Math.abs(target[500 * 3] - 128)).toBeLessThanOrEqual(1)
	expect(target[500 * 3]).toBe(target[500 * 3 + 1])
})

test('classification uses the standard LAS colours, grey for the rest', () => {
	const data = cloud([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], { classification: new Uint8Array([2, 6, 9, 42]) })
	const target = new Uint8Array(12)

	writeColours(target, 'classification', data, '+y')

	expect(rgbAt(target, 0)).toEqual(hex(0xa0784b))
	expect(rgbAt(target, 1)).toEqual(hex(0xe2725b))
	expect(rgbAt(target, 2)).toEqual(hex(0x3d85c6))
	expect(rgbAt(target, 3)).toEqual(hex(0x9e9e9e))
})

test('a single colour', () => {
	const target = new Uint8Array(3)

	writeColours(target, 'single', cloud([[0, 0, 0]]), '+y')

	expect(Array.from(target)).toEqual(hex(0x8fa3b3))
})
