/**
 * What is wrong with a mesh, counted: open edges and holes, faces turned the wrong way,
 * parts inside out, unshared and near-miss vertices, zero-area and duplicate faces, and
 * edges shared by more than two faces. Each on a small mesh built for it.
 */
import { analyzeMesh } from '../../../src/printCheck/meshAnalysis.js'
import { combineReports, MAX_HOLE_EDGES } from '../../../src/printCheck/meshReport.js'
import { measureBounds, weldTolerance, weldVertices } from '../../../src/printCheck/meshWeld.js'
import { cube, soup, indexed, flipped, together, tube } from './meshFixtures.js'

const analyze = (triangles, extra = {}) => analyzeMesh({ positions: soup(triangles), index: null, ...extra })

test('a cube as an STL stores it is closed once its corners are joined, and needs nothing', () => {
	const report = analyze(cube())
	expect(report).toMatchObject({
		triangles: 12,
		vertices: 36,
		// 36 corners are 8 places: 28 repeats, all exact
		joinableVertices: 28,
		nearVertices: 0,
		degenerateFaces: 0,
		duplicateFaces: 0,
		openEdges: 0,
		nonManifoldEdges: 0,
		flippedFaces: 0,
		insideOutParts: 0,
		parts: 1,
		closed: true,
		fixable: false,
	})
	expect(report.holes).toEqual({ count: 0, fillable: 0, tooLarge: 0, complex: 0 })
	expect(report.volume).toBeCloseTo(1000, 6)
	expect(report.area).toBeCloseTo(600, 6)
})

test('an indexed cube reads the same', () => {
	const { positions, index } = indexed(cube())
	const report = analyzeMesh({ positions, index })
	expect(report).toMatchObject({ vertices: 8, joinableVertices: 0, openEdges: 0, closed: true, fixable: false })
})

test('a cube missing a face has four open edges bounding one hole a repair can fill', () => {
	const report = analyze(cube().filter((_, i) => i !== 2 && i !== 3))
	expect(report).toMatchObject({ openEdges: 4, closed: false, fixable: true })
	expect(report.holes).toEqual({ count: 1, fillable: 1, tooLarge: 0, complex: 0 })
})

test('a cube missing a single triangle has a three-edge hole', () => {
	const report = analyze(cube().filter((_, i) => i !== 5))
	expect(report.openEdges).toBe(3)
	expect(report.holes.count).toBe(1)
})

test('a cube missing opposite faces has two holes', () => {
	const report = analyze(cube().filter((_, i) => i > 3))
	expect(report.openEdges).toBe(8)
	expect(report.holes.count).toBe(2)
})

test('faces that point the wrong way against their neighbours are counted, and the cube stays closed', () => {
	const triangles = cube()
	triangles[4] = flipped(triangles[4])
	triangles[9] = flipped(triangles[9])
	triangles[11] = flipped(triangles[11])
	const report = analyze(triangles)
	expect(report.flippedFaces).toBe(3)
	expect(report.insideOutParts).toBe(0)
	expect(report.closed).toBe(true)
	expect(report.fixable).toBe(true)
})

test('a cube whose faces all point in is inside out, not a heap of flipped faces', () => {
	const report = analyze(cube().map(flipped))
	expect(report.flippedFaces).toBe(0)
	expect(report.insideOutParts).toBe(1)
	expect(report.closed).toBe(true)
	expect(report.fixable).toBe(true)
	// Counted as it will be once turned out
	expect(report.volume).toBeCloseTo(1000, 6)
})

test('an open cube that is inside out is found by which side its hole is on', () => {
	const report = analyze(cube().filter((_, i) => i !== 2 && i !== 3).map(flipped))
	expect(report.insideOutParts).toBe(1)
	expect(report.openEdges).toBe(4)
})

test('a vertex a hair off its neighbours is a crack, not a shared corner', () => {
	const triangles = cube()
	// One corner of one triangle misses by 20 nanometres on a 10 mm part
	triangles[0] = triangles[0].map((corner, i) => (i === 0 ? corner.map((v) => v + 2e-5) : corner))
	const report = analyze(triangles)
	expect(report.nearVertices).toBe(1)
	expect(report.closed).toBe(true)
	expect(report.fixable).toBe(true)
})

test('an exact repeat of a face is a duplicate and not an edge shared three ways', () => {
	const triangles = cube()
	triangles.push(triangles[3])
	const report = analyze(triangles)
	expect(report.duplicateFaces).toBe(1)
	expect(report.nonManifoldEdges).toBe(0)
	expect(report.closed).toBe(true)
	// The same face going the other way is the same three vertices too
	triangles.push(flipped(triangles[7]))
	expect(analyze(triangles).duplicateFaces).toBe(2)
})

test('zero-area faces are counted: a repeated vertex, three on a line, and a broken coordinate', () => {
	const triangles = cube()
	triangles.push([[1, 1, 1], [1, 1, 1], [2, 2, 2]])
	triangles.push([[0, 0, 0], [5, 5, 5], [10, 10, 10]])
	triangles.push([[NaN, 0, 0], [1, 0, 0], [0, 1, 0]])
	const report = analyze(triangles)
	expect(report.degenerateFaces).toBe(3)
	expect(report.closed).toBe(true)
	expect(report.fixable).toBe(true)
})

test('an edge three faces share is non-manifold, wherever the faces come from', () => {
	// Three pages of a book on one spine
	const spine = [[0, 0, 0], [0, 0, 1]]
	const page = (x, y) => [spine[0], spine[1], [x, y, 0.5]]
	const report = analyze([page(1, 0), page(-1, 1), page(-1, -1)])
	expect(report.nonManifoldEdges).toBe(1)
	expect(report.closed).toBe(false)
})

test('a T-junction, a vertex on another face\'s edge, leaves open edges rather than a closed shell', () => {
	// A square of two triangles, and a third triangle hung off the middle of one edge
	const square = [[[0, 0, 0], [2, 0, 0], [2, 2, 0]], [[0, 0, 0], [2, 2, 0], [0, 2, 0]]]
	const hung = [[2, 1, 0], [3, 1, 0], [3, 2, 0]]
	const report = analyze([...square, hung])
	expect(report.closed).toBe(false)
	expect(report.openEdges).toBeGreaterThan(0)
})

test('separate parts are counted, each closed', () => {
	const report = analyze(together(cube(10), cube(10, [20, 0, 0])))
	expect(report.parts).toBe(2)
	expect(report.closed).toBe(true)
	expect(report.fixable).toBe(false)
	expect(report.volume).toBeCloseTo(2000, 6)
})

test('one part inside out among others is reported alone', () => {
	const report = analyze(together(cube(10), cube(10, [20, 0, 0]).map(flipped)))
	expect(report.parts).toBe(2)
	expect(report.insideOutParts).toBe(1)
})

test('the wall of a cavity inside a solid is meant to face in, and is not inside out', () => {
	const cavity = cube(2, [4, 4, 4]).map(flipped)
	const report = analyze(together(cube(10), cavity))
	expect(report.parts).toBe(2)
	expect(report.insideOutParts).toBe(0)
	expect(report.fixable).toBe(false)
	// The solid, less its hollow
	expect(report.volume).toBeCloseTo(1000 - 8, 6)
})

test('many cavities in one solid are all left facing in', () => {
	const cavities = []
	for (let i = 0; i < 25; i++) {
		cavities.push(...cube(1, [1 + (i % 5) * 1.6, 1 + Math.floor(i / 5) * 1.6, 4]).map(flipped))
	}
	const report = analyze(together(cube(10), cavities))
	expect(report.parts).toBe(26)
	expect(report.insideOutParts).toBe(0)
	expect(report.volume).toBeCloseTo(1000 - 25, 3)
})

test('a part inside out that merely sits beside a solid is turned', () => {
	const report = analyze(together(cube(10), cube(2, [20, 4, 4]).map(flipped)))
	expect(report.insideOutParts).toBe(1)
})

test('a hole with a ring of more edges than the limit is too large to fill', () => {
	const report = analyze(tube(MAX_HOLE_EDGES + 100))
	expect(report.holes).toEqual({ count: 2, fillable: 0, tooLarge: 2, complex: 0 })
	expect(report.fixable).toBe(false)
	// Within it, a hole is fillable
	expect(analyze(tube(60)).holes).toEqual({ count: 2, fillable: 2, tooLarge: 0, complex: 0 })
	// The limit is the caller's to set
	expect(analyze(tube(60), { maxHoleEdges: 50 }).holes.tooLarge).toBe(2)
})

test('two holes that touch at a vertex are one complex hole, which is not filled', () => {
	// Take the top and right faces' triangles that meet only at corner 6 out of a cube
	const triangles = cube().filter((_, i) => i !== 2 && i !== 6)
	const report = analyze(triangles)
	expect(report.holes.complex).toBeGreaterThan(0)
	expect(report.holes.fillable).toBe(0)
	expect(report.fixable).toBe(false)
})

test('reports of parts add up', () => {
	const closed = analyze(cube())
	const open = analyze(cube().filter((_, i) => i !== 5))
	const total = combineReports([closed, open])
	expect(total).toMatchObject({ meshes: 2, triangles: 23, openEdges: 3, closed: false, fixable: true })
	expect(total.holes.count).toBe(1)
	expect(combineReports([closed]).closed).toBe(true)
	expect(combineReports([]).closed).toBe(false)
})

describe('how close vertices must be to be one', () => {
	const bounds = (extent, maxAbs = extent) => ({ extent, maxAbs })

	test('comes from the part\'s size: a 2 mm part joins to tens of nanometres, not a hundredth of a millimetre', () => {
		const tolerance = weldTolerance(bounds(2), 1)
		expect(tolerance).toBeLessThan(1e-4)
		expect(tolerance).toBeGreaterThan(0)
	})

	test('never reaches past a micron, on a part of any size', () => {
		expect(weldTolerance(bounds(1000), 1)).toBeCloseTo(1e-3, 9)
		// 10 m across, a decimetre from the origin
		expect(weldTolerance(bounds(10000, 100), 1)).toBeCloseTo(1e-3, 9)
	})

	test('is the same distance whether the part is written in millimetres or in metres', () => {
		const mm = weldTolerance(bounds(2), 1)
		const metres = weldTolerance(bounds(0.002), 1000)
		expect(metres * 1000).toBeCloseTo(mm, 9)
	})

	test('two distinct vertices of a small millimetre part are two vertices', () => {
		// A 2 mm part with two vertices 0.8 microns apart
		const positions = Float32Array.from([0, 0, 0, 0.0008, 0, 0, 2, 2, 2])
		const box = measureBounds(positions)
		const welded = weldVertices(positions, weldTolerance(box, 1), box)
		expect(welded.count).toBe(3)
		// The same part in metres
		const metres = Float32Array.from(positions, (v) => v / 1000)
		const boxMetres = measureBounds(metres)
		expect(weldVertices(metres, weldTolerance(boxMetres, 1000), boxMetres).count).toBe(3)
	})

	test('a vertex at the same place within float noise is joined', () => {
		const positions = Float32Array.from([0, 0, 0, 1e-7, 0, 0, 2, 2, 2])
		const box = measureBounds(positions)
		const welded = weldVertices(positions, weldTolerance(box, 1), box)
		expect(welded.count).toBe(2)
		expect(welded.nearPlaces).toBe(1)
	})

	test('a part far from the origin is joined by what its coordinates can tell apart', () => {
		// float32 holds about 0.06 at 1e6
		const positions = Float32Array.from([1e6, 0, 0, 1e6 + 0.0625, 0, 0, 1e6 + 10, 10, 10])
		const box = measureBounds(positions)
		expect(weldVertices(positions, weldTolerance(box, 1), box).count).toBe(3)
	})

	test('vertices across a cell boundary are still joined', () => {
		const tolerance = 0.01
		const positions = new Float64Array([0.0199999, 0, 0, 0.0200001, 0, 0, 5, 5, 5])
		const box = measureBounds(positions)
		expect(weldVertices(positions, tolerance, box).count).toBe(2)
	})

	test('a chain of near neighbours does not collapse into one vertex', () => {
		const tolerance = 0.01
		// Each is 0.008 from the next, but the ends are 0.032 apart
		const positions = new Float64Array([0, 0, 0, 0.008, 0, 0, 0.016, 0, 0, 0.024, 0, 0, 0.032, 0, 0, 1, 1, 1])
		const box = measureBounds(positions)
		const { count } = weldVertices(positions, tolerance, box)
		expect(count).toBeGreaterThan(2)
		expect(count).toBeLessThan(6)
	})

	test('a vertex with a coordinate that is not a number is none of them', () => {
		const positions = Float32Array.from([0, 0, 0, NaN, 0, 0, Infinity, 1, 1])
		const box = measureBounds(positions)
		const welded = weldVertices(positions, 1e-3, box)
		expect([...welded.ids]).toEqual([0, -1, -1])
		expect(measureBounds(Float32Array.from([NaN, NaN, NaN])).finite).toBe(0)
	})
})
