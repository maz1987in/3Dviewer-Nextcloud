#!/usr/bin/env node
/**
 * Writes the small point-cloud fixtures in tests/fixtures/pointclouds/, deterministically,
 * so they can be checked in and remade. Real LAZ and E57 files come from elsewhere; see
 * tests/fixtures/pointclouds/SOURCES.md.
 *
 * Usage: node scripts/make-point-fixtures.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('tests/fixtures/pointclouds')
fs.mkdirSync(OUT, { recursive: true })

/** A 10 × 10 × 10 grid of points, side 10. */
function cube() {
	const points = []
	for (let x = 0; x < 10; x++) {
		for (let y = 0; y < 10; y++) {
			for (let z = 0; z < 10; z++) {
				points.push([x * 10 / 9, y * 10 / 9, z * 10 / 9])
			}
		}
	}
	return points
}

const round = (v) => Math.round(v * 1e6) / 1e6
const rgb = ([x, y, z]) => [x, y, z].map((v) => Math.round((v / 10) * 255))

const write = (name, text) => {
	fs.writeFileSync(path.join(OUT, name), text)
	console.log(`wrote ${name}`)
}

write('cube.xyz', cube().map((p) => p.map(round).join(' ')).join('\n') + '\n')
write('cube-rgb.xyz', cube().map((p) => [...p.map(round), ...rgb(p)].join(' ')).join('\n') + '\n')
// Not a scan: a water molecule, as chemistry tools write .xyz
write('molecule.xyz', '3\nwater\nO 0.000 0.000 0.117\nH 0.000 0.757 -0.467\nH 0.000 -0.757 -0.467\n')

/**
 * A PLY of the cube's points and no faces.
 *
 * @param {'ascii'|'binary_little_endian'|'binary_big_endian'} format - How the vertices are written
 * @param {boolean} [colours] - With red, green, blue (uchar) and a float intensity
 * @return {Buffer} The file
 */
function ply(format, colours = false) {
	const points = cube()
	const props = ['property float x', 'property float y', 'property float z']
	if (colours) {
		props.push('property uchar red', 'property uchar green', 'property uchar blue', 'property float scalar_intensity')
	}
	const header = ['ply', `format ${format} 1.0`, 'comment made by make-point-fixtures', `element vertex ${points.length}`, ...props, 'end_header', ''].join('\n')
	if (format === 'ascii') {
		const lines = points.map((p, i) => [...p.map(round), ...(colours ? [...rgb(p), i] : [])].join(' '))
		return Buffer.from(header + lines.join('\n') + '\n')
	}
	const little = format === 'binary_little_endian'
	const record = 12 + (colours ? 7 : 0)
	const body = Buffer.alloc(points.length * record)
	points.forEach((p, i) => {
		let o = i * record
		for (const v of p) {
			little ? body.writeFloatLE(v, o) : body.writeFloatBE(v, o)
			o += 4
		}
		if (colours) {
			for (const c of rgb(p)) body.writeUInt8(c, o++)
			little ? body.writeFloatLE(i, o) : body.writeFloatBE(i, o)
		}
	})
	return Buffer.concat([Buffer.from(header), body])
}

write('points-ascii.ply', ply('ascii'))
write('points-binary-le.ply', ply('binary_little_endian'))
write('points-binary-be.ply', ply('binary_big_endian'))
write('points-rgb.ply', ply('binary_little_endian', true))

/**
 * LZF, as PCD's binary_compressed uses it: literal runs, and back-references to repeats of
 * three bytes or more within the last 8 KiB, so a reader is tested on both.
 *
 * @param {Uint8Array} input - The bytes
 * @return {Uint8Array} Them compressed
 */
function lzf(input) {
	const out = []
	const seen = new Map()
	let literal = []
	const flush = () => {
		for (let i = 0; i < literal.length; i += 32) {
			const run = literal.slice(i, i + 32)
			out.push(run.length - 1, ...run)
		}
		literal = []
	}
	let i = 0
	while (i < input.length) {
		const key = input[i] | (input[i + 1] << 8) | (input[i + 2] << 16)
		const at = i + 2 < input.length ? seen.get(key) : undefined
		if (i + 2 < input.length) seen.set(key, i)
		if (at !== undefined && i - at - 1 < 8192) {
			let len = 3
			while (len < 264 && i + len < input.length && input[at + len] === input[i + len]) len++
			flush()
			const off = i - at - 1
			const l = len - 2
			if (l < 7) {
				out.push((l << 5) | (off >> 8), off & 255)
			} else {
				out.push((7 << 5) | (off >> 8), l - 7, off & 255)
			}
			i += len
		} else {
			literal.push(input[i++])
		}
	}
	flush()
	return Uint8Array.from(out)
}

/** The cube as a PCD: x y z, then rgb packed into a float, then a label. */
function pcd(data) {
	const points = cube()
	const header = ['# .PCD v0.7 - Point Cloud Data file format', 'VERSION 0.7', 'FIELDS x y z rgb label', 'SIZE 4 4 4 4 4', 'TYPE F F F F U', 'COUNT 1 1 1 1 1',
		`WIDTH ${points.length}`, 'HEIGHT 1', 'VIEWPOINT 0 0 0 1 0 0 0', `POINTS ${points.length}`, `DATA ${data}`, ''].join('\n')
	const packed = (p) => {
		const [r, g, b] = rgb(p)
		const view = new DataView(new ArrayBuffer(4))
		view.setUint32(0, (r << 16) | (g << 8) | b, true)
		return view.getFloat32(0, true)
	}
	const label = (p) => (p[2] < 1 ? 2 : 6)
	if (data === 'ascii') {
		return Buffer.from(header + points.map((p) => [...p.map(round), packed(p), label(p)].join(' ')).join('\n') + '\n')
	}
	const n = points.length
	const body = Buffer.alloc(n * 20)
	if (data === 'binary') {
		points.forEach((p, i) => {
			const o = i * 20
			p.forEach((v, a) => body.writeFloatLE(v, o + a * 4))
			body.writeFloatLE(packed(p), o + 12)
			body.writeUInt32LE(label(p), o + 16)
		})
		return Buffer.concat([Buffer.from(header), body])
	}
	// binary_compressed: each field's values together, then LZF, after its two sizes
	points.forEach((p, i) => {
		p.forEach((v, a) => body.writeFloatLE(v, a * n * 4 + i * 4))
		body.writeFloatLE(packed(p), 3 * n * 4 + i * 4)
		body.writeUInt32LE(label(p), 4 * n * 4 + i * 4)
	})
	const compressed = lzf(body)
	const sizes = Buffer.alloc(8)
	sizes.writeUInt32LE(compressed.length, 0)
	sizes.writeUInt32LE(body.length, 4)
	return Buffer.concat([Buffer.from(header), sizes, Buffer.from(compressed)])
}

write('cube-ascii.pcd', pcd('ascii'))
write('cube-binary.pcd', pcd('binary'))
write('cube-compressed.pcd', pcd('binary_compressed'))
