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
