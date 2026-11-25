/**
 * A large mesh stays fast to check and to repair: typed arrays and a spatial hash, no
 * object per vertex or triangle. The bound is generous, for a slow CI runner; what it
 * guards is a step that goes quadratic, which takes minutes, not seconds.
 */
import { analyzeMesh } from '../../../src/printCheck/meshAnalysis.js'
import { repairMesh } from '../../../src/printCheck/meshRepair.js'

const LIMIT_MS = 20000

/**
 * A sphere as an STL stores one: every triangle with its own three vertices. Some faces are
 * turned, some left out, some repeated, so there is something to find.
 *
 * @param {number} rings - Latitude bands
 * @param {number} segments - Faces round each band
 * @return {{positions: Float32Array, triangles: number, holes: number}} The soup
 */
function brokenSphere(rings, segments) {
	const point = (r, s) => {
		const theta = (r / rings) * Math.PI
		const phi = ((s % segments) / segments) * Math.PI * 2
		return [50 * Math.sin(theta) * Math.cos(phi), 50 * Math.cos(theta), 50 * Math.sin(theta) * Math.sin(phi)]
	}
	const triangles = []
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segments; s++) {
			const a = point(r, s)
			const b = point(r + 1, s)
			const c = point(r + 1, s + 1)
			const d = point(r, s + 1)
			// The poles' faces would collapse to a line
			if (r > 0) { triangles.push([a, c, d]) }
			if (r < rings - 1) { triangles.push([a, b, c]) }
		}
	}
	let holes = 0
	const kept = []
	triangles.forEach((triangle, i) => {
		// A hole every 40,000 faces: a quad's worth of two neighbours left out
		if (i % 40000 === 1000 || i % 40000 === 1001) {
			if (i % 40000 === 1000) { holes++ }
			return
		}
		// Every 7,001st face turned, every 9,001st doubled
		kept.push(i % 7001 === 0 ? [triangle[0], triangle[2], triangle[1]] : triangle)
		if (i % 9001 === 0) { kept.push(triangle) }
	})
	return { positions: Float32Array.from(kept.flat(2)), triangles: kept.length, holes }
}

test('a mesh of 400,000 faces is checked and repaired in seconds', () => {
	const { positions, triangles, holes } = brokenSphere(500, 400)
	expect(triangles).toBeGreaterThan(390000)

	const started = performance.now()
	const before = analyzeMesh({ positions, index: null })
	const analysed = performance.now() - started
	expect(before.holes.count).toBeGreaterThanOrEqual(holes)
	expect(before.flippedFaces).toBeGreaterThan(0)
	expect(before.duplicateFaces).toBeGreaterThan(0)

	const repairStarted = performance.now()
	const result = repairMesh({ positions, index: null })
	const repaired = performance.now() - repairStarted
	expect(result.summary.filledHoles).toBeGreaterThanOrEqual(holes)
	expect(result.after).toMatchObject({ closed: true, flippedFaces: 0, duplicateFaces: 0, insideOutParts: 0 })
	// Its volume is that of the sphere, a little under 4/3 pi r^3
	expect(result.after.volume).toBeGreaterThan(0.99 * (4 / 3) * Math.PI * 50 ** 3 * 0.98)

	expect(analysed).toBeLessThan(LIMIT_MS)
	expect(repaired).toBeLessThan(LIMIT_MS)
}, 60000)
