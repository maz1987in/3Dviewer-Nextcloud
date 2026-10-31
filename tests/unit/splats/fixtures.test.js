/**
 * @jest-environment node
 */
/**
 * The splat fixtures (scripts/make-splat-fixtures.mjs) hold what they say: the same grid
 * of 1000 splats, read back here without Spark, so a Spark test that fails is Spark's.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { plyHeader } from '../../../src/pointclouds/readers/plyPoints.js'
import { isSplatPly } from '../../../src/splats/splatPly.js'

const DIR = path.join(__dirname, '../../fixtures/splats')
const bytes = (name) => new Uint8Array(fs.readFileSync(path.join(DIR, name)))

test('grid.splat is 1000 splats of 32 bytes, the first at the grid\'s corner', () => {
	const file = bytes('grid.splat')
	const view = new DataView(file.buffer, file.byteOffset, file.byteLength)

	expect(file.byteLength).toBe(32_000)
	expect([0, 4, 8].map((at) => view.getFloat32(at, true))).toEqual([-1, 0, -0.25])
	// Scale 0.02, opacity 0.9, rotation identity
	expect(view.getFloat32(12, true)).toBeCloseTo(0.02, 6)
	expect(file[27]).toBe(230)
	expect(file[28]).toBe(255)
})

test('grid.ply is a 3DGS PLY of 1000 splats', () => {
	const header = plyHeader(bytes('grid.ply').subarray(0, 4096))
	const vertex = header.elements.find((e) => e.name === 'vertex')

	expect(header.format).toBe('binary_little_endian')
	expect(vertex.count).toBe(1000)
	expect(isSplatPly(header)).toBe(true)
	expect(vertex.properties.map((p) => p.name)).not.toContain('f_rest_0')
})

test('grid-sh3.ply carries the 45 higher-order coefficients', () => {
	const header = plyHeader(bytes('grid-sh3.ply').subarray(0, 8192))
	const names = header.elements.find((e) => e.name === 'vertex').properties.map((p) => p.name)

	expect(names).toContain('f_rest_0')
	expect(names).toContain('f_rest_44')
	expect(names).not.toContain('f_rest_45')
})

test('grid.spz is a gzipped SPZ version 2 of 1000 splats, degree 0', () => {
	const raw = zlib.gunzipSync(bytes('grid.spz'))
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)

	expect(view.getUint32(0, true)).toBe(0x5053474e)
	expect(view.getUint32(4, true)).toBe(2)
	expect(view.getUint32(8, true)).toBe(1000)
	expect(raw[12]).toBe(0)
	// Header, then positions (9), alphas (1), colours (3), scales (3), rotations (3) a splat
	expect(raw.byteLength).toBe(16 + 1000 * 19)
})
