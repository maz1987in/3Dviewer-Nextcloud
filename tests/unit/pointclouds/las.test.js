/**
 * @jest-environment node
 */
/**
 * LAS 1.2–1.4: the header, the point records of every format, and survey coordinates in
 * the millions kept to the millimetre.
 */
import fs from 'node:fs'
import path from 'node:path'
import { lasFile } from '../../../scripts/pointFixtureWriters.mjs'
import { lasHeader, read } from '../../../src/pointclouds/readers/las.js'
import { ScanError } from '../../../src/pointclouds/scanFormats.js'

const fixture = (name) => new Blob([fs.readFileSync(path.join(__dirname, '../../fixtures/pointclouds', name))])
const world = (sink, i) => [0, 1, 2].map((a) => Math.round((sink.positions[i * 3 + a] + sink.origin[a]) * 1000) / 1000)

test('a LAS 1.2 survey in UTM metres', async () => {
	const { sink, unit, format } = await read(fixture('utm-1.2.las'), { budget: 5000 })

	expect(format).toBe('las')
	expect(unit).toBe('m')
	expect(sink.count).toBe(1000)
	expect(world(sink, 0)).toEqual([500000, 4500000, 100])
	expect(world(sink, 999)).toEqual([500010, 4500010, 110])
	expect(sink.origin).toEqual([500000, 4500000, 100])
	expect(Array.from(sink.colors.slice(-3))).toEqual([255, 255, 255])
	expect(sink.intensity[999]).toBe(999)
	expect(sink.classification[0]).toBe(2)
})

test('a LAS 1.4 in US survey feet, named in WKT', async () => {
	const { sink, unit } = await read(fixture('feet-1.4.las'), { budget: 5000 })

	expect(unit).toBe('us-ft')
	expect(sink.count).toBe(1000)
	expect(world(sink, 999)).toEqual([2000010, 10000010, 10])
	expect(sink.colors).toBeDefined()
})

test('a LAS 1.4 with classes and no coordinate system', async () => {
	const { sink, unit } = await read(fixture('classes-1.4.las'), { budget: 5000 })

	expect(unit).toBeNull()
	expect(sink.colors).toBeUndefined()
	expect(Array.from(sink.classification.slice(0, 3))).toEqual([2, 5, 6])
	expect(sink.intensity[0]).toBe(1000)
})

test('points a millimetre apart, far from the origin, stay a millimetre apart', async () => {
	const file = lasFile({ format: 0, offset: [500000, 4500000, 0], points: [{ x: 500000.001, y: 4500000, z: 100 }, { x: 500000.002, y: 4500000, z: 100 }] })

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(sink.positions[3] - sink.positions[0]).toBeCloseTo(0.001, 6)
})

test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('point format %i is read', async (format) => {
	const file = lasFile({ version: [1, 4], format, points: [{ x: 1, y: 2, z: 3, intensity: 7, classification: 6, rgb: [65535, 0, 32896] }] })

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(world(sink, 0)).toEqual([1, 2, 3])
	if ([2, 3, 5, 7, 8, 10].includes(format)) {
		expect(Array.from(sink.colors)).toEqual([255, 0, 128])
	} else {
		expect(sink.colors).toBeUndefined()
	}
})

test('colours written as 8-bit values in the 16-bit fields are kept', async () => {
	const file = lasFile({ format: 2, points: [{ x: 0, y: 0, z: 0, rgb: [255, 128, 0] }, { x: 1, y: 1, z: 1, rgb: [10, 20, 30] }] })

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(Array.from(sink.colors)).toEqual([255, 128, 0, 10, 20, 30])
})

test('thins evenly to the budget', async () => {
	const { sink } = await read(fixture('classes-1.4.las'), { budget: 250 })

	expect(sink.count).toBe(250)
	expect(sink.total).toBe(1000)
})

test('the header', async () => {
	const bytes = new Uint8Array(await fixture('utm-1.2.las').arrayBuffer())

	const header = lasHeader(new DataView(bytes.buffer))

	expect(header).toMatchObject({ version: [1, 2], pointFormat: 3, recordLength: 34, pointCount: 1000, offsetToPoints: 313, compressed: false })
	expect(header.scale).toEqual([0.001, 0.001, 0.001])
	expect(header.min).toEqual([500000, 4500000, 100])
	expect(header.vlrs).toHaveLength(1)
	expect(header.vlrs[0]).toMatchObject({ userId: 'LASF_Projection', recordId: 34735 })
})

test('a compressed file needs the LAZ reader', async () => {
	const file = lasFile({ format: 1, compressed: true, points: [{ x: 0, y: 0, z: 0 }] })

	await expect(read(new Blob([file]), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
})

test('a file that isn\'t LAS is refused', async () => {
	await expect(read(new Blob(['not a las file at all'.repeat(20)]), { budget: 10 })).rejects.toThrow('isn\'t a LAS file')
})

// Review fixes
test('blank colour fields mean no colours, not black', async () => {
	const file = lasFile({ format: 3, points: [{ x: 0, y: 0, z: 0, rgb: [0, 0, 0] }, { x: 1, y: 1, z: 1, rgb: [0, 0, 0] }] })

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(sink.colors).toBeUndefined()
})

test.each([['zeroed', 0], ['garbage', NaN]])('survey coordinates keep their millimetres when the header\'s bounds are %s', async (_, bound) => {
	const file = lasFile({ format: 0, offset: [500000, 4500000, 0], points: [{ x: 500000.001, y: 4500000, z: 100 }, { x: 500000.002, y: 4500000, z: 100 }] })
	const view = new DataView(file.buffer)
	for (let at = 179; at < 227; at += 8) view.setFloat64(at, bound, true)

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(Array.from(sink.positions).every(Number.isFinite)).toBe(true)
	expect(sink.positions[3] - sink.positions[0]).toBeCloseTo(0.001, 6)
})

test('a header claiming more points than the file holds reads what is there', async () => {
	const file = lasFile({ format: 0, points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }] })
	new DataView(file.buffer).setUint32(107, 1_000_000, true)

	// Thinned against the count it claims, the two real points would be thinned away
	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(sink.count).toBe(2)
})
