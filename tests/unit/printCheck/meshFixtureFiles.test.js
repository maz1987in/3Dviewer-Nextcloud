/**
 * The broken models in tests/fixtures, read from their files as the viewer's STL loader
 * reads them: what the analysis finds in each and what a repair makes of it. The same files
 * are opened in the browser by tests/playwright/print-repair.spec.ts.
 */
import fs from 'fs'
import path from 'path'
import { analyzeMesh } from '../../../src/printCheck/meshAnalysis.js'
import { repairMesh } from '../../../src/printCheck/meshRepair.js'
import { signedVolume, trianglesOf } from './meshFixtures.js'

/** An ASCII STL's vertices, three per triangle. */
function readAsciiStl(name) {
	const text = fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', name), 'utf8')
	const numbers = [...text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((match) => [Number(match[1]), Number(match[2]), Number(match[3])])
	return { positions: Float32Array.from(numbers), index: null }
}

test('open-cube.stl has one hole of four edges, which a repair fills', () => {
	const mesh = readAsciiStl('open-cube.stl')
	expect(analyzeMesh(mesh)).toMatchObject({ triangles: 10, openEdges: 4, holes: { count: 1, fillable: 1 }, closed: false, fixable: true })
	const repaired = repairMesh(mesh)
	expect(repaired.summary).toMatchObject({ filledHoles: 1, addedFaces: 2 })
	expect(repaired.after.closed).toBe(true)
	expect(signedVolume(trianglesOf(repaired))).toBeCloseTo(1000, 3)
})

test('inside-out-cube.stl is closed and inside out, and a repair turns it', () => {
	const mesh = readAsciiStl('inside-out-cube.stl')
	expect(analyzeMesh(mesh)).toMatchObject({ closed: true, insideOutParts: 1, flippedFaces: 0, fixable: true })
	const repaired = repairMesh(mesh)
	expect(repaired.summary.turnedParts).toBe(1)
	expect(signedVolume(trianglesOf(repaired))).toBeCloseTo(1000, 3)
})

test('broken-cube.stl has a hole, three turned faces, a repeated face and a face with no area', () => {
	const mesh = readAsciiStl('broken-cube.stl')
	expect(analyzeMesh(mesh)).toMatchObject({
		triangles: 12,
		openEdges: 4,
		holes: { count: 1, fillable: 1 },
		flippedFaces: 3,
		insideOutParts: 0,
		duplicateFaces: 1,
		degenerateFaces: 1,
		nonManifoldEdges: 0,
		fixable: true,
	})
	const repaired = repairMesh(mesh)
	expect(repaired.summary).toMatchObject({ filledHoles: 1, turnedFaces: 3, removedDuplicateFaces: 1, removedDegenerateFaces: 1 })
	expect(repaired.after).toMatchObject({ closed: true, flippedFaces: 0, duplicateFaces: 0, degenerateFaces: 0, holes: { count: 0 } })
	expect(repaired.index.length / 3).toBe(12)
	expect(signedVolume(trianglesOf(repaired))).toBeCloseTo(1000, 3)
})
