/**
 * Which surfaces overhang: those facing down more steeply than the chosen angle from
 * vertical, measured per triangle from its own flat normal, leaving out what rests on the
 * bed.
 */
import * as THREE from 'three'
import { overhangAngleDeg, overhangShare, createOverhangMaterial } from '../../../src/printCheck/overhang.js'

const UP = new THREE.Vector3(0, 1, 0)

/** One mesh from triangles given as [[x,y,z] × 3]. */
function meshOf(triangles) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3))
	return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
}

/** Area of triangles given as [[x,y,z] × 3]. */
function areaOf(triangles) {
	return triangles.reduce((sum, [a, b, c]) => {
		const ab = new THREE.Vector3(...b).sub(new THREE.Vector3(...a))
		const ac = new THREE.Vector3(...c).sub(new THREE.Vector3(...a))
		return sum + ab.cross(ac).length() / 2
	}, 0)
}

/** A box from `min` to `max`, faces wound outward, as triangles. */
function boxTriangles([x0, y0, z0], [x1, y1, z1]) {
	const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
	const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
	return quads.flatMap(([a, b, d, e]) => [[c[a], c[b], c[d]], [c[a], c[d], c[e]]])
}

describe('overhangAngleDeg', () => {
	test('vertical wall is 0°, ceiling 90°, upward face null', () => {
		expect(overhangAngleDeg(new THREE.Vector3(1, 0, 0), UP)).toBeCloseTo(0, 9)
		expect(overhangAngleDeg(new THREE.Vector3(0, -1, 0), UP)).toBeCloseTo(90, 9)
		expect(overhangAngleDeg(new THREE.Vector3(0, 1, 0), UP)).toBeNull()
	})

	test('45° chamfer under the default threshold is not overhang, 50° is', () => {
		const tilt = (deg) => new THREE.Vector3(Math.cos(deg * Math.PI / 180), -Math.sin(deg * Math.PI / 180), 0)
		expect(overhangAngleDeg(tilt(45), UP)).toBeCloseTo(45, 9)
		expect(overhangAngleDeg(tilt(45), UP) > 45 + 1e-9).toBe(false)
		expect(overhangAngleDeg(tilt(50), UP)).toBeGreaterThan(45)
	})
})

describe('overhangShare', () => {
	test('cube on the bed has no overhang', () => {
		const triangles = boxTriangles([0, 0, 0], [10, 10, 10])
		const { overhangArea, totalArea } = overhangShare([meshOf(triangles)], UP, 45, 0, 0.05)
		expect(overhangArea).toBe(0)
		expect(totalArea).toBeCloseTo(600, 6)
	})

	test("a T shape's arm undersides are overhang", () => {
		// A stem 2 × 10 × 2 on the bed, and a bar 10 × 2 × 2 across its top
		const stem = boxTriangles([4, 0, 0], [6, 10, 2])
		const bar = boxTriangles([0, 10, 0], [10, 12, 2])
		const mesh = meshOf([...stem, ...bar])
		const { overhangArea, totalArea } = overhangShare([mesh], UP, 45, 0, 0.05)
		// The bar's whole underside faces down (two triangles, 10 × 2), the stem's bottom is on the bed
		const undersides = 10 * 2
		expect(overhangArea).toBeCloseTo(undersides, 9)
		expect(totalArea).toBeCloseTo(areaOf([...stem, ...bar]), 9)
	})

	test('a model floating above the bed has its bottom counted', () => {
		const triangles = boxTriangles([0, 5, 0], [10, 15, 10])
		const { overhangArea } = overhangShare([meshOf(triangles)], UP, 45, 0, 0.05)
		expect(overhangArea).toBeCloseTo(100, 9)
	})

	test('follows the mesh in the world: turned upside down, the top becomes the overhang', () => {
		const mesh = meshOf(boxTriangles([0, 0, 0], [10, 10, 10]))
		mesh.rotation.x = Math.PI
		mesh.updateMatrixWorld(true)
		// Bed at the new lowest point: y = -10
		const { overhangArea } = overhangShare([mesh], UP, 45, -10, 0.05)
		expect(overhangArea).toBe(0)
		const lifted = overhangShare([mesh], UP, 45, -20, 0.05)
		expect(lifted.overhangArea).toBeCloseTo(100, 6)
	})

	test('degenerate and NaN triangles are skipped', () => {
		const good = boxTriangles([0, 5, 0], [10, 15, 10])
		const bad = [
			[[0, 1, 0], [0, 1, 0], [0, 1, 0]],
			[[NaN, 0, 0], [1, 0, 0], [0, 0, 1]],
		]
		const { overhangArea, totalArea } = overhangShare([meshOf([...good, ...bad])], UP, 45, 0, 0.05)
		expect(Number.isFinite(overhangArea) && Number.isFinite(totalArea)).toBe(true)
		expect(totalArea).toBeCloseTo(600, 6)
		expect(overhangArea).toBeCloseTo(100, 6)
	})

	test('indexed geometry is read through its index', () => {
		const geometry = new THREE.BoxGeometry(10, 10, 10)
		geometry.translate(0, 10, 0)
		const { overhangArea, totalArea } = overhangShare([new THREE.Mesh(geometry)], UP, 45, 0, 0.05)
		expect(totalArea).toBeCloseTo(600, 6)
		expect(overhangArea).toBeCloseTo(100, 6)
	})
})

describe('createOverhangMaterial', () => {
	test('a shader with the threshold as a uniform, drawn over the model without writing depth', () => {
		const material = createOverhangMaterial({ up: UP, thresholdDeg: 45, bedHeight: 0, bedEpsilon: 0.05 })
		expect(material.isShaderMaterial).toBe(true)
		expect(material.uniforms.uCosLimit.value).toBeCloseTo(Math.cos((90 - 45) * Math.PI / 180), 9)
		expect(material.uniforms.uUp.value.equals(UP)).toBe(true)
		expect(material.uniforms.uBedHeight.value).toBe(0)
		expect(material.depthWrite).toBe(false)
		expect(material.polygonOffset).toBe(true)
		expect(material.fragmentShader).toMatch(/discard/)
		expect(material.fragmentShader).toMatch(/dFdx/)
	})

	test('copies clipping planes it is given', () => {
		const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0)
		const material = createOverhangMaterial({ up: UP, thresholdDeg: 45, bedHeight: 0, bedEpsilon: 0.05, clippingPlanes: [plane] })
		expect(material.clippingPlanes).toEqual([plane])
		expect(material.clipping).toBe(true)
	})

	test('is cut by the renderer\'s own clipping planes, which the cross-section uses', () => {
		const material = createOverhangMaterial({ up: UP, thresholdDeg: 45, bedHeight: 0, bedEpsilon: 0.05 })
		expect(material.clipping).toBe(true)
	})
})
