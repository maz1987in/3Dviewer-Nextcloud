#!/usr/bin/env node
/**
 * Writes the splat fixtures in tests/fixtures/splats/, deterministically, so they can be
 * checked in and remade: the same grid of 1000 splats as .splat, .ply (degree 0 and 3)
 * and .spz. See tests/fixtures/splats/SOURCES.md.
 *
 * Usage: node scripts/make-splat-fixtures.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { splatFile, splatPly, spzFile } from './splatFixtureWriters.mjs'

const OUT = path.resolve('tests/fixtures/splats')
fs.mkdirSync(OUT, { recursive: true })

/**
 * A 10 × 10 × 10 grid, 2 m wide, 1 m tall and 0.5 m deep, so turning it changes its
 * height. Each splat is coloured by where it is.
 *
 * @return {object[]} The splats
 */
function grid() {
	const splats = []
	for (let i = 0; i < 10; i++) {
		for (let j = 0; j < 10; j++) {
			for (let k = 0; k < 10; k++) {
				splats.push({
					position: [-1 + 2 * i / 9, j / 9, -0.25 + 0.5 * k / 9],
					colour: [i / 9, j / 9, k / 9],
					opacity: 0.9,
					scale: 0.02,
					rotation: [1, 0, 0, 0],
				})
			}
		}
	}
	return splats
}

const splats = grid()
fs.writeFileSync(path.join(OUT, 'grid.splat'), splatFile(splats))
fs.writeFileSync(path.join(OUT, 'grid.ply'), splatPly(splats))
fs.writeFileSync(path.join(OUT, 'grid-sh3.ply'), splatPly(splats, { sh: 3 }))
fs.writeFileSync(path.join(OUT, 'grid.spz'), spzFile(splats))
