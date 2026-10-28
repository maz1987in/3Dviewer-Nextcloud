/**
 * Whether a part is closed: every edge shared by exactly two triangles. An STL has no
 * shared vertices, every triangle its own three, so vertices at the same place are welded
 * before edges are counted; without that every STL would read as open.
 */
import * as THREE from 'three'
import { edgeReport, modelClosed } from '../../../src/printCheck/closedMesh.js'

/** A cube's triangles as an STL stores them: 36 vertices, no index. */
function soupCube(size = 10, drift = 0) {
	const geometry = new THREE.BoxGeometry(size, size, size).toNonIndexed()
	const positions = geometry.attributes.position.array.slice()
	if (drift) {
		for (let i = 0; i < positions.length; i++) positions[i] += (i % 2 ? drift : -drift)
	}
	return positions
}

test('a non-indexed cube is closed', () => {
	expect(edgeReport({ positions: soupCube(), index: null })).toEqual({ boundaryEdges: 0, nonManifoldEdges: 0, closed: true })
})

test('an indexed tetrahedron is closed', () => {
	const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
	const index = new Uint16Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2])
	expect(edgeReport({ positions, index }).closed).toBe(true)
})

test('a cube missing one triangle has 3 boundary edges and is open', () => {
	const report = edgeReport({ positions: soupCube().slice(9), index: null })
	expect(report.boundaryEdges).toBe(3)
	expect(report.closed).toBe(false)
})

test('two cubes sharing one edge are non-manifold', () => {
	const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
	const b = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()
	b.translate(1, 1, 0)
	const positions = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array])
	const report = edgeReport({ positions, index: null })
	expect(report.nonManifoldEdges).toBeGreaterThan(0)
	expect(report.closed).toBe(false)
})

test('float drift of 1e-7 still welds', () => {
	expect(edgeReport({ positions: soupCube(10, 1e-7), index: null }).closed).toBe(true)
})

test('degenerate and NaN triangles are skipped', () => {
	const extra = [5, 5, 5, 5, 5, 5, 5, 5, 5, NaN, 0, 0, 1, 0, 0, 0, 1, 0]
	const positions = new Float32Array([...soupCube(), ...extra])
	expect(edgeReport({ positions, index: null }).closed).toBe(true)
})

test('modelClosed counts open parts', () => {
	const closed = { boundaryEdges: 0, nonManifoldEdges: 0, closed: true }
	const open = { boundaryEdges: 3, nonManifoldEdges: 0, closed: false }
	expect(modelClosed([closed, closed])).toEqual({ closed: true, openParts: 0 })
	expect(modelClosed([closed, open, open])).toEqual({ closed: false, openParts: 2 })
	expect(modelClosed([])).toEqual({ closed: false, openParts: 0 })
})
