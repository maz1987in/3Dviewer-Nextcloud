/**
 * Mending a mesh: what a repair does to each kind of broken cube, what it says it did, and
 * what it leaves and says so. Every result is checked again by the same analysis that found
 * the problem, and by its signed volume, which is only +1000 for a 10 mm cube whose faces
 * all point out.
 */
import { repairMesh, fillHole } from '../../../src/printCheck/meshRepair.js'
import { analyzeMesh } from '../../../src/printCheck/meshAnalysis.js'
import { MAX_HOLE_EDGES } from '../../../src/printCheck/meshReport.js'
import { buildEdges } from '../../../src/printCheck/meshTopology.js'
import { cube, soup, indexed, flipped, together, tube, signedVolume, trianglesOf } from './meshFixtures.js'

const repair = (triangles, extra = {}) => repairMesh({ positions: soup(triangles), index: null, ...extra })
const volumeOf = (result) => signedVolume(trianglesOf(result))

/** Every face of a repaired cube-like mesh points away from `centre`. */
function facesPointOut(result, centre) {
	return trianglesOf(result).every(([a, b, c]) => {
		const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
		const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
		const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
		const out = [a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]]
		return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] > 0
	})
}

test('a cube as an STL stores it comes out with its 36 corners joined into 8, and says so', () => {
	const result = repair(cube())
	expect(result.positions.length / 3).toBe(8)
	expect(result.index.length / 3).toBe(12)
	expect(result.summary.joinedVertices).toBe(28)
	expect(result.summary).toMatchObject({ removedDegenerateFaces: 0, removedDuplicateFaces: 0, turnedFaces: 0, turnedParts: 0, filledHoles: 0, addedFaces: 0 })
	expect(result.after.closed).toBe(true)
	// A cube an STL describes was never broken: joining its corners is not a change
	expect(result.changed).toBe(false)
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
})

test('a cube missing a face gets the face back, two faces facing out', () => {
	const result = repair(cube().filter((_, i) => i !== 2 && i !== 3))
	expect(result.summary.filledHoles).toBe(1)
	expect(result.summary.addedFaces).toBe(2)
	expect(result.patchStart).toBe(10)
	expect(result.index.length / 3).toBe(12)
	expect(result.after).toMatchObject({ closed: true, openEdges: 0, flippedFaces: 0, insideOutParts: 0 })
	expect(result.changed).toBe(true)
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
	expect(facesPointOut(result, [5, 5, 5])).toBe(true)
})

test('a cube missing a single triangle gets one triangle', () => {
	const result = repair(cube().filter((_, i) => i !== 5))
	expect(result.summary).toMatchObject({ filledHoles: 1, addedFaces: 1 })
	expect(result.after.closed).toBe(true)
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
})

test('a cube missing opposite faces gets both back', () => {
	const result = repair(cube().filter((_, i) => i > 3))
	expect(result.summary).toMatchObject({ filledHoles: 2, addedFaces: 4 })
	expect(result.after.closed).toBe(true)
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
})

test('a hole is filled whichever way its plane lies, and whichever corner the loop starts at', () => {
	// The same cube turned so its missing face is not on an axis
	const angle = 0.7
	const turn = ([x, y, z]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z]
	const tilt = ([x, y, z]) => [x, y * Math.cos(0.4) - z * Math.sin(0.4), y * Math.sin(0.4) + z * Math.cos(0.4)]
	for (const dropped of [[2, 3], [0, 1], [4, 5], [6, 7], [8, 9], [10, 11]]) {
		const triangles = cube().filter((_, i) => !dropped.includes(i)).map((triangle) => triangle.map((corner) => tilt(turn(corner))))
		const result = repair(triangles)
		expect(result.after.closed).toBe(true)
		expect(volumeOf(result)).toBeCloseTo(1000, 3)
	}
})

test('a round hole is filled with as many faces as its edge needs, none of them crossing', () => {
	// A tube has two holes of 60 edges; each takes 58 faces
	const result = repair(tube(60))
	expect(result.summary.filledHoles).toBe(2)
	expect(result.summary.addedFaces).toBe(116)
	expect(result.after.closed).toBe(true)
	// A closed tube of radius ~1 and height 1 holds a little under pi
	expect(volumeOf(result)).toBeGreaterThan(3.1)
	expect(volumeOf(result)).toBeLessThan(Math.PI)
})

test('a concave hole is cut into ears that stay inside it', () => {
	// A block with an L-shaped plan, 1 deep, its walls and bottom only: the open top is the hole
	const outline = [[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]
	const walls = outline.flatMap(([x0, y0], i) => {
		const [x1, y1] = outline[(i + 1) % outline.length]
		return [[[x0, y0, 0], [x0, y0, -1], [x1, y1, -1]], [[x0, y0, 0], [x1, y1, -1], [x1, y1, 0]]]
	})
	const bottom = [
		[[0, 0, -1], [1, 3, -1], [1, 1, -1]], [[0, 0, -1], [1, 1, -1], [3, 1, -1]], [[0, 0, -1], [3, 1, -1], [3, 0, -1]],
		[[0, 0, -1], [0, 3, -1], [1, 3, -1]],
	]
	const result = repair(together(walls, bottom))
	expect(result.summary.filledHoles).toBe(1)
	// Six corners take four faces
	expect(result.summary.addedFaces).toBe(4)
	expect(result.after.closed).toBe(true)
	// 5 square units of plan, 1 deep
	expect(volumeOf(result)).toBeCloseTo(5, 4)
})

test('faces turned the wrong way are turned back, and counted', () => {
	const triangles = cube()
	for (const i of [4, 9, 11]) {
		triangles[i] = flipped(triangles[i])
	}
	const result = repair(triangles)
	expect(result.summary.turnedFaces).toBe(3)
	expect(result.summary.turnedParts).toBe(0)
	expect(result.after).toMatchObject({ flippedFaces: 0, closed: true })
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
	expect(facesPointOut(result, [5, 5, 5])).toBe(true)
})

test('a cube whose faces all point in is turned out, as one part', () => {
	const result = repair(cube().map(flipped))
	expect(result.summary).toMatchObject({ turnedFaces: 0, turnedParts: 1 })
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
	expect(facesPointOut(result, [5, 5, 5])).toBe(true)
	expect(result.after.insideOutParts).toBe(0)
})

test('an inside-out cube with a stray face the right way is turned out as well', () => {
	const triangles = cube().map(flipped)
	triangles[4] = flipped(triangles[4])
	const result = repair(triangles)
	expect(result.summary.turnedFaces).toBe(1)
	expect(result.summary.turnedParts).toBe(1)
	expect(facesPointOut(result, [5, 5, 5])).toBe(true)
})

test('an open cube that is inside out is turned out, then closed with faces that point out', () => {
	const result = repair(cube().filter((_, i) => i !== 2 && i !== 3).map(flipped))
	expect(result.summary).toMatchObject({ turnedParts: 1, filledHoles: 1, addedFaces: 2 })
	expect(result.after.closed).toBe(true)
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
	expect(facesPointOut(result, [5, 5, 5])).toBe(true)
})

test('corners that miss by a hair are joined, and an unused vertex does not stay', () => {
	const triangles = cube()
	triangles[0] = triangles[0].map((corner, i) => (i === 0 ? corner.map((v) => v + 2e-5) : corner))
	const result = repair(triangles)
	expect(result.positions.length / 3).toBe(8)
	expect(result.after.closed).toBe(true)
	expect(result.after.nearVertices).toBe(0)
})

test('duplicate and zero-area faces are left out, and counted', () => {
	const triangles = cube()
	triangles.push(triangles[3], flipped(triangles[7]))
	triangles.push([[1, 1, 1], [1, 1, 1], [2, 2, 2]], [[0, 0, 0], [5, 5, 5], [10, 10, 10]])
	const result = repair(triangles)
	expect(result.summary).toMatchObject({ removedDuplicateFaces: 2, removedDegenerateFaces: 2 })
	expect(result.index.length / 3).toBe(12)
	expect(result.after).toMatchObject({ closed: true, duplicateFaces: 0, degenerateFaces: 0 })
	expect(volumeOf(result)).toBeCloseTo(1000, 4)
})

test('an indexed mesh keeps its shape, and a Float64 mesh stays Float64', () => {
	const { positions, index } = indexed(cube().filter((_, i) => i !== 2 && i !== 3))
	const result = repairMesh({ positions: Float64Array.from(positions), index })
	expect(result.positions).toBeInstanceOf(Float64Array)
	expect(result.index).toBeInstanceOf(Uint32Array)
	expect(result.after.closed).toBe(true)
})

test('edges shared by more than two faces are left, and reported', () => {
	const spine = [[0, 0, 0], [0, 0, 1]]
	const page = (x, y) => [spine[0], spine[1], [x, y, 0.5]]
	const result = repair([page(1, 0), page(-1, 1), page(-1, -1)])
	expect(result.after.nonManifoldEdges).toBe(1)
	expect(result.after.closed).toBe(false)
	expect(result.index.length / 3).toBe(3)
})

test('a hole too large to fill is left, and the repair says which', () => {
	const result = repair(tube(MAX_HOLE_EDGES + 100))
	expect(result.summary).toMatchObject({ filledHoles: 0, leftTooLarge: 2, leftComplex: 0, leftUnfillable: 0 })
	expect(result.after.closed).toBe(false)
	expect(result.after.holes.count).toBe(2)
})

test('the size limit is the caller\'s: a hole of 60 edges is too large for a limit of 50', () => {
	const result = repair(tube(60), { maxHoleEdges: 50 })
	expect(result.summary).toMatchObject({ filledHoles: 0, leftTooLarge: 2 })
})

test('holes that touch are left as one complex hole', () => {
	const result = repair(cube().filter((_, i) => i !== 2 && i !== 6))
	expect(result.summary.filledHoles).toBe(0)
	expect(result.summary.leftComplex).toBeGreaterThan(0)
	expect(result.after.closed).toBe(false)
})

test('each of several parts is mended on its own', () => {
	const open = cube(10).filter((_, i) => i !== 2 && i !== 3)
	const inside = cube(10, [20, 0, 0]).map(flipped)
	const result = repair(together(open, inside, cube(4, [40, 0, 0])))
	expect(result.summary).toMatchObject({ filledHoles: 1, turnedParts: 1 })
	expect(result.after).toMatchObject({ closed: true, parts: 3, insideOutParts: 0 })
	expect(volumeOf(result)).toBeCloseTo(2000 + 64, 3)
})

test('the wall of a cavity is not turned out', () => {
	const result = repair(together(cube(10), cube(2, [4, 4, 4]).map(flipped)))
	expect(result.summary.turnedParts).toBe(0)
	expect(volumeOf(result)).toBeCloseTo(1000 - 8, 4)
})

test('two vertices of a small millimetre part a micron apart are not collapsed', () => {
	// A 2 mm cube with one corner of one face moved 0.8 microns
	const triangles = cube(2)
	triangles[0] = triangles[0].map((corner, i) => (i === 0 ? [corner[0] + 0.0008, corner[1], corner[2]] : corner))
	const result = repair(triangles)
	// 8 corners, and the moved one stays its own vertex
	expect(result.positions.length / 3).toBeGreaterThanOrEqual(9)
	expect(result.after.nearVertices).toBe(0)
	// The same part in metres is just as careful when its unit is given
	const metres = triangles.map((triangle) => triangle.map((corner) => corner.map((v) => v / 1000)))
	const inMetres = repair(metres, { millimetresPerUnit: 1000 })
	expect(inMetres.positions.length / 3).toBeGreaterThanOrEqual(9)
})

test('the result keeps the size and place of the part, to the last bit of a float32', () => {
	const triangles = cube(37.5, [100, -20, 5000])
	const before = new Set(triangles.flat().map((c) => c.map(Math.fround).join()))
	const result = repair(triangles.filter((_, i) => i !== 2 && i !== 3))
	const after = new Set()
	for (let v = 0; v < result.positions.length; v += 3) {
		after.add([result.positions[v], result.positions[v + 1], result.positions[v + 2]].join())
	}
	// The filled face needs no corner the cube does not have
	expect([...after].every((corner) => before.has(corner))).toBe(true)
	expect(after.size).toBe(8)
})

test('progress goes from 0 to 1', () => {
	const seen = []
	repairMesh({ positions: soup(cube()), index: null }, { onProgress: (fraction) => seen.push(fraction) })
	expect(seen[0]).toBe(0)
	expect(seen[seen.length - 1]).toBe(1)
	expect(seen).toEqual([...seen].sort((a, b) => a - b))
})

describe('fillHole', () => {
	const square = Float64Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0])
	const none = buildEdges(new Int32Array(0))

	test('cuts a square into two faces that face the way the mesh\'s edges are not running', () => {
		// The mesh's edges run counter-clockwise about +z along this ring, so the patch faces -z
		const result = fillHole(Int32Array.from([0, 1, 2, 3]), square, none, 4)
		expect(result.centre).toBeNull()
		expect(result.triangles).toHaveLength(6)
		const normalZ = [0, 1].reduce((sum, t) => {
			const [a, b, c] = result.triangles.slice(t * 3, t * 3 + 3).map((v) => [square[v * 3], square[v * 3 + 1]])
			return sum + (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
		}, 0)
		expect(normalZ).toBeLessThan(0)
	})

	test('refuses a loop with no area', () => {
		const line = Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0])
		expect(fillHole(Int32Array.from([0, 1, 2]), line, none, 3)).toBeNull()
		expect(fillHole(Int32Array.from([0, 1]), line, none, 3)).toBeNull()
	})

	test('does not make an edge the mesh has already', () => {
		// A square whose one diagonal is an edge of the mesh: the other one is used
		const edges = buildEdges(Int32Array.from([0, 2, 1, 2, 0, 3]))
		const result = fillHole(Int32Array.from([0, 1, 2, 3]), square, edges, 4)
		const used = new Set()
		for (let t = 0; t < 2; t++) {
			const [a, b, c] = result.triangles.slice(t * 3, t * 3 + 3)
			;[[a, b], [b, c], [c, a]].forEach(([x, y]) => used.add([Math.min(x, y), Math.max(x, y)].join()))
		}
		expect(used.has('0,2')).toBe(false)
		expect(used.has('1,3')).toBe(true)
	})

	test('falls back to a fan from the centre when no ear can be cut, and only when that is safe', () => {
		// Every diagonal of this square already exists: no ear is allowed
		const edges = buildEdges(Int32Array.from([0, 2, 1, 1, 3, 0, 0, 2, 3]))
		expect(edges.find(0, 2)).not.toBe(-1)
		expect(edges.find(1, 3)).not.toBe(-1)
		const result = fillHole(Int32Array.from([0, 1, 2, 3]), square, edges, 4)
		expect(result.centre).toEqual([0.5, 0.5, 0])
		expect(result.triangles).toHaveLength(12)
		expect(result.triangles.filter((v) => v === 4)).toHaveLength(4)
	})

	test('does not fan a hole the centre cannot see all of', () => {
		// A thin U: its centre lies outside it, so a fan would cross the notch
		const u = Float64Array.from([0, 0, 0, 3, 0, 0, 3, 3, 0, 2, 3, 0, 2, 1, 0, 1, 1, 0, 1, 3, 0, 0, 3, 0])
		const everything = []
		for (let a = 0; a < 8; a++) {
			for (let b = a + 2; b < 8; b++) {
				everything.push(a, b, a)
			}
		}
		expect(fillHole(Int32Array.from([0, 1, 2, 3, 4, 5, 6, 7]), u, buildEdges(Int32Array.from(everything)), 8)).toBeNull()
	})
})

test('what repair makes is what analysis then reports', () => {
	const result = repair(cube().filter((_, i) => i !== 2 && i !== 3))
	expect(analyzeMesh({ positions: result.positions, index: result.index })).toEqual(result.after)
})

test('a mesh with nothing usable comes out empty without failing', () => {
	const result = repairMesh({ positions: Float32Array.from([NaN, 0, 0, 1, 0, 0, 0, 1, 0]), index: null })
	expect(result.index.length).toBe(0)
	expect(result.summary.removedDegenerateFaces).toBe(1)
	expect(result.after.closed).toBe(false)
})
