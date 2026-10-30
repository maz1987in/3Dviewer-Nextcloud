/**
 * @jest-environment node
 */
/**
 * LAZ, compressed LAS: the chunk table, decoded with LASzip's own arithmetic coding, and
 * the chunks with laz-perf. The real files' twins say what every point must be.
 * Sources and licences of the fixtures: tests/fixtures/pointclouds/SOURCES.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { lasFile } from '../../../scripts/pointFixtureWriters.mjs'
import { readChunkTable } from '../../../src/pointclouds/readers/lazChunks.js'
import { lasHeader, read } from '../../../src/pointclouds/readers/las.js'
import { ScanError } from '../../../src/pointclouds/scanFormats.js'

// laz-perf's Node build in place of the worker build, which finds its WASM by URL
jest.mock('../../../src/pointclouds/lazPerf.js', () => {
	let module = null
	return { getLazPerf: () => (module ??= require('laz-perf').createLazPerf()) }
})

const file = (name) => new Blob([fs.readFileSync(path.join(__dirname, '../../fixtures/pointclouds', name))])
const headerOf = async (blob) => {
	const head = lasHeader(new DataView(await blob.slice(0, 375).arrayBuffer()))
	return lasHeader(new DataView(await blob.slice(0, head.offsetToPoints).arrayBuffer()))
}

test('simple.laz holds exactly the points of simple.las', async () => {
	const laz = await read(file('simple.laz'), { budget: 5000 })
	const las = await read(file('simple.las'), { budget: 5000 })

	expect(laz.format).toBe('laz')
	expect(laz.sink.count).toBe(1065)
	expect(laz.sink.origin).toEqual(las.sink.origin)
	expect(Array.from(laz.sink.positions)).toEqual(Array.from(las.sink.positions))
	expect(Array.from(laz.sink.colors)).toEqual(Array.from(las.sink.colors))
	expect(Array.from(laz.sink.intensity)).toEqual(Array.from(las.sink.intensity))
	expect(Array.from(laz.sink.classification)).toEqual(Array.from(las.sink.classification))
})

test('the chunk table', async () => {
	const blob = file('simple.laz')
	const header = await headerOf(blob)

	const chunks = await readChunkTable(blob, header)

	expect(chunks.map((c) => c.pointCount)).toEqual([1065])
	const tableAt = Number(new DataView(await blob.slice(header.offsetToPoints, header.offsetToPoints + 8).arrayBuffer()).getBigInt64(0, true))
	expect(chunks[0].start).toBe(header.offsetToPoints + 8)
	expect(chunks[0].start + chunks[0].byteCount).toBe(tableAt)
})

test('a LAS 1.4 LAZ, with its coordinate system in WKT', async () => {
	const { sink, format, unit } = await read(file('point-time-1.4.laz'), { budget: 5000 })

	expect(format).toBe('laz')
	expect(sink.count).toBe(1065)
	expect(sink.origin).toEqual([493994.87, 4877429.62, 123.93])
	expect(unit).toBe('m')
	expect(Math.min(...Array.from(sink.positions.filter((_, i) => i % 3 === 0)))).toBeCloseTo(0, 3)
})

test('thins evenly to the budget', async () => {
	const { sink } = await read(file('simple.laz'), { budget: 266 })

	expect(sink.count).toBe(266)
	expect(sink.total).toBe(1065)
})

test('a cancelled read stops before decoding', async () => {
	const controller = new AbortController()
	controller.abort()

	await expect(read(file('simple.laz'), { budget: 10, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
})

test.each([4, 5, 9, 10])('LAZ point format %i is refused, saying which', async (format) => {
	const laz = lasFile({ version: [1, 4], format, compressed: true, points: [{ x: 0, y: 0, z: 0 }] })

	const reading = read(new Blob([laz]), { budget: 10 })

	await expect(reading).rejects.toBeInstanceOf(ScanError)
	await expect(reading).rejects.toThrow(`LAZ point format ${format} isn't supported`)
})

test('a compressed file without LASzip\'s record is refused', async () => {
	const laz = lasFile({ format: 1, compressed: true, points: [{ x: 0, y: 0, z: 0 }] })

	await expect(read(new Blob([laz]), { budget: 10 })).rejects.toThrow('LASzip')
})
