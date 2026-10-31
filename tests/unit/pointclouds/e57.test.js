/**
 * @jest-environment node
 */
/**
 * E57 (ASTM E2807): pages with checksums, an XML description, and bit-packed binary
 * sections. The real files come from the e57 Rust crate (SOURCES.md), with what its own
 * tests say they hold; the writer covers what they don't.
 */
import fs from 'node:fs'
import path from 'node:path'
import { read } from '../../../src/pointclouds/readers/e57.js'
import { ScanError } from '../../../src/pointclouds/scanFormats.js'
import { CARTESIAN, e57File } from './helpers/e57Writer.js'

const fixture = (name) => new Blob([fs.readFileSync(path.join(__dirname, '../../fixtures/pointclouds', name))])
const world = (sink, i) => [0, 1, 2].map((a) => sink.positions[i * 3 + a] + sink.origin[a])
const near = (a, b, digits = 4) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))

test('a real scan: 2,090 points with colours, in metres', async () => {
	const { sink, unit, format } = await read(fixture('tinyCartesianFloatRgb.e57'), { budget: 5000 })

	expect(format).toBe('e57')
	expect(unit).toBe('m')
	expect(sink.count).toBe(2090)
	expect(sink.colors).toBeDefined()
	const xs = Array.from({ length: sink.count }, (_, i) => world(sink, i)[0])
	expect(Math.min(...xs)).toBeCloseTo(-9.7795295715332031, 4)
	expect(Math.max(...xs)).toBeCloseTo(-6.774238109588623, 4)
})

test.each(['integer_intensity.e57', 'scaled_integer_intensity.e57'])('%s: intensity at both ends of its limits', async (name) => {
	const { sink } = await read(fixture(name), { budget: 10 })

	expect(sink.count).toBe(2)
	expect(Array.from(sink.intensity)).toEqual([0, 65535])
})

test('points without a valid position are left out', async () => {
	const { sink } = await read(fixture('cartesian_invalid_state_single.e57'), { budget: 10 })

	expect(sink.count).toBe(1)
	near(world(sink, 0), [-1, -2, -3])
})

test('a spherical scan is refused, saying so', async () => {
	await expect(read(fixture('tiny_spherical.e57'), { budget: 10 })).rejects.toThrow('spherical E57 scans aren\'t supported yet')
})

test('scaled integers, and records that straddle packets', async () => {
	const fields = ['X', 'Y', 'Z'].map((a) => ({ name: `cartesian${a}`, type: 'ScaledInteger', min: -100000, max: 100000, scale: 0.001, offset: 0 }))
	const records = Array.from({ length: 300 }, (_, i) => [i * 0.5, -i * 0.25, i * 0.125])
	const file = e57File({ scans: [{ fields, records, packets: 7 }] })

	const { sink } = await read(new Blob([file]), { budget: 1000 })

	expect(sink.count).toBe(300)
	near(world(sink, 0), [0, 0, 0])
	near(world(sink, 299), [149.5, -74.75, 37.375], 3)
})

test('several scans, each placed by its pose', async () => {
	const records = [[1, 0, 0], [0, 1, 0]]
	// The second scan turned 90° about Z (w = cos 45°, z = sin 45°) and moved 10 along X
	const turn = Math.SQRT1_2
	const file = e57File({
		scans: [
			{ fields: CARTESIAN, records },
			{ fields: CARTESIAN, records, pose: { rotation: [turn, 0, 0, turn], translation: [10, 0, 0] } },
		],
	})

	const { sink } = await read(new Blob([file]), { budget: 10 })

	expect(sink.count).toBe(4)
	near(world(sink, 0), [1, 0, 0])
	near(world(sink, 2), [10, 1, 0])
	near(world(sink, 3), [9, 0, 0])
})

test('thins evenly to the budget across scans', async () => {
	const records = Array.from({ length: 100 }, (_, i) => [i, 0, 0])
	const file = e57File({ scans: [{ fields: CARTESIAN, records }, { fields: CARTESIAN, records }] })

	const { sink } = await read(new Blob([file]), { budget: 50 })

	expect(sink.count).toBe(50)
	expect(sink.total).toBe(200)
})

test('a file that isn\'t E57 is refused', async () => {
	await expect(read(new Blob(['x'.repeat(2048)]), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
})

// Checked before the records are read: a crafted file can claim any number of them
test('a scan whose records take no bits is refused, whatever count it claims', async () => {
	const constant = ['X', 'Y', 'Z'].map((a) => ({ name: `cartesian${a}`, type: 'Integer', min: 5, max: 5 }))
	const file = e57File({ scans: [{ fields: constant, records: [[5, 5, 5]], recordCount: 100_000_000 }] })

	await expect(read(new Blob([file]), { budget: 10 })).rejects.toThrow('records take no space')
})

test('a scan claiming more records than its section can hold is refused', async () => {
	const file = e57File({ scans: [{ fields: CARTESIAN, records: [[1, 2, 3]], recordCount: 1_000_000 }] })

	await expect(read(new Blob([file]), { budget: 10 })).rejects.toThrow('more points than it holds')
})

test('a field whose range runs backwards is refused', async () => {
	const fields = [...CARTESIAN, { name: 'intensity', type: 'Integer', min: 10, max: 5 }]
	const file = e57File({ scans: [{ fields, records: [[0, 0, 0, 7]] }] })

	await expect(read(new Blob([file]), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
})

// One field's stream never arriving would otherwise hold every other one, whole
test('fields that never line up into a record are refused, not held', async () => {
	const fields = [...CARTESIAN, { name: 'intensity', type: 'Integer', min: 0, max: 255 }]
	// Over a megabyte for each coordinate, in packets inside E57's 64 KiB
	const records = Array.from({ length: 200000 }, (_, i) => [i, i, i, i % 256])
	// Empty packets pad the section, so the record count alone can't give it away
	const file = e57File({ scans: [{ fields, records, packets: 100, starve: 3, emptyPackets: 8 }] })

	await expect(read(new Blob([file]), { budget: 10 })).rejects.toThrow('don\'t line up')
})
