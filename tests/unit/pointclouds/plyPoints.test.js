/**
 * @jest-environment node
 */
/**
 * A PLY of points and no faces, as scanners and phone apps write them: ASCII or binary
 * either way round, with or without colours and an intensity.
 */
import fs from 'node:fs'
import path from 'node:path'
import { plyHeader, read } from '../../../src/pointclouds/readers/plyPoints.js'
import { ScanError } from '../../../src/pointclouds/scanFormats.js'

const fixture = (name) => new Blob([fs.readFileSync(path.join(__dirname, '../../fixtures/pointclouds', name))])
const text = (s) => new Blob([s])

test.each(['points-ascii.ply', 'points-binary-le.ply', 'points-binary-be.ply'])('%s: every point, re-centred on the first', async (name) => {
	const { sink, format, unit } = await read(fixture(name), { budget: 5000 })

	expect(format).toBe('ply')
	expect(unit).toBeNull()
	expect(sink.count).toBe(1000)
	expect(sink.total).toBe(1000)
	expect(sink.origin).toEqual([0, 0, 0])
	// The last point is the cube's far corner
	expect(Array.from(sink.positions.slice(-3)).map((v) => Math.round(v * 1000) / 1000)).toEqual([10, 10, 10])
	expect(sink.colors).toBeUndefined()
})

test('colours and an intensity', async () => {
	const { sink } = await read(fixture('points-rgb.ply'), { budget: 5000 })

	expect(Array.from(sink.colors.slice(-3))).toEqual([255, 255, 255])
	expect(Array.from(sink.colors.slice(0, 3))).toEqual([0, 0, 0])
	expect(sink.intensity[999]).toBe(999)
})

test('thins evenly to the budget', async () => {
	const { sink } = await read(fixture('points-binary-le.ply'), { budget: 250 })

	expect(sink.count).toBe(250)
	expect(sink.total).toBe(1000)
})

test('the header', () => {
	const bytes = new TextEncoder().encode('ply\r\nformat ascii 1.0\r\nelement vertex 2\r\nproperty float x\r\nproperty float y\r\nproperty float z\r\nelement face 0\r\nproperty list uchar int vertex_indices\r\nend_header\r\n0 0 0\r\n')

	const header = plyHeader(bytes)

	expect(header.format).toBe('ascii')
	expect(header.elements.map((e) => [e.name, e.count])).toEqual([['vertex', 2], ['face', 0]])
	expect(header.elements[0].properties.map((p) => [p.name, p.type])).toEqual([['x', 'float'], ['y', 'float'], ['z', 'float']])
	expect(header.elements[1].properties[0]).toMatchObject({ name: 'vertex_indices', list: true })
	expect(new TextDecoder().decode(bytes.slice(header.headerLength))).toBe('0 0 0\r\n')
})

test('a file that isn\'t a PLY, or has no positions, is refused', async () => {
	await expect(read(text('hello'), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
	await expect(read(text('ply\nformat ascii 1.0\nelement vertex 1\nproperty float nx\nend_header\n1\n'), { budget: 10 })).rejects.toThrow('x, y and z')
})

test('vertices that come after another element are refused, not misread', async () => {
	const file = 'ply\nformat ascii 1.0\nelement camera 1\nproperty float k\nelement vertex 1\nproperty float x\nproperty float y\nproperty float z\nend_header\n5\n1 2 3\n'

	await expect(read(text(file), { budget: 10 })).rejects.toBeInstanceOf(ScanError)
})
