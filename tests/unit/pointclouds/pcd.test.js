/**
 * @jest-environment node
 */
/**
 * PCD, the Point Cloud Library's format: ASCII, binary and binary_compressed, with packed
 * colours, an intensity and labels. three's own PCDLoader reads each fixture too, so the
 * fixtures are checked by something other than the reader under test.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader.js'
import { read } from '../../../src/pointclouds/readers/pcd.js'
import { ScanError } from '../../../src/pointclouds/scanFormats.js'

const bytes = (name) => fs.readFileSync(path.join(__dirname, '../../fixtures/pointclouds', name))
const blob = (data) => new Blob([data])
const round = (values) => Array.from(values, (v) => Math.round(v * 1000) / 1000)

test.each(['cube-ascii.pcd', 'cube-binary.pcd', 'cube-compressed.pcd'])('%s: the same points and colours three reads', async (name) => {
	const data = bytes(name)
	const three = new PCDLoader().parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
	const theirs = three.geometry.getAttribute('position').array

	const { sink, format, unit } = await read(blob(data), { budget: 5000 })

	expect(format).toBe('pcd')
	expect(unit).toBeNull()
	expect(sink.count).toBe(1000)
	expect(round(sink.positions.map((v, i) => v + sink.origin[i % 3]))).toEqual(round(theirs))
	expect(Array.from(sink.colors.slice(-3))).toEqual([255, 255, 255])
	// Labelled ground (2) below z = 1 and building (6) above, as the fixture writes them
	const labels = Array.from(sink.classification)
	expect(labels.every((label, i) => label === (sink.positions[i * 3 + 2] + sink.origin[2] < 1 ? 2 : 6))).toBe(true)
	expect(new Set(labels)).toEqual(new Set([2, 6]))
})

test('thins evenly to the budget', async () => {
	const { sink } = await read(blob(bytes('cube-binary.pcd')), { budget: 100 })

	expect(sink.count).toBe(100)
	expect(sink.total).toBe(1000)
})

test('a header with doubled spaces and an intensity', async () => {
	const file = 'VERSION .7\nFIELDS x  y  z intensity\nSIZE 4 4 4 4\nTYPE F F F F\nCOUNT 1 1 1 1\nWIDTH 2\nHEIGHT 1\nPOINTS 2\nDATA ascii\n1  2  3 0.5\n4 5 6 0.25\n'

	const { sink } = await read(blob(file), { budget: 10 })

	expect(sink.count).toBe(2)
	expect(Array.from(sink.positions)).toEqual([0, 0, 0, 3, 3, 3])
	expect(Array.from(sink.intensity)).toEqual([32768, 16384])
})

test('an organised cloud\'s empty points (NaN) are left out', async () => {
	const file = 'FIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 3\nHEIGHT 1\nPOINTS 3\nDATA ascii\n1 2 3\nnan nan nan\n4 5 6\n'

	const { sink } = await read(blob(file), { budget: 10 })

	expect(sink.count).toBe(2)
})

test('a data kind PCD doesn\'t have is refused', async () => {
	const file = 'FIELDS x y z\nSIZE 4 4 4\nTYPE F F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA zipped\n'

	await expect(read(blob(file), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
})

test('a file without x, y and z is refused', async () => {
	const file = 'FIELDS a b\nSIZE 4 4\nTYPE F F\nWIDTH 1\nHEIGHT 1\nPOINTS 1\nDATA ascii\n1 2\n'

	await expect(read(blob(file), { budget: 10 })).rejects.toThrow('x, y and z')
})
