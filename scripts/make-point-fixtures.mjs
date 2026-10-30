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
