/**
 * @jest-environment node
 *
 * The worker's measurements give what the page measured before they moved there, to the
 * last bit: the extent (modelExtentMm), the overhangs (overhangShare) and the volume and
 * area (modelVolumeAndArea), on the copy of the model the worker is sent.
 */
import * as THREE from 'three'
import { bedAxes, modelExtentMm } from '../../../src/printCheck/buildVolume.js'
import { overhangShare } from '../../../src/printCheck/overhang.js'
import { modelVolumeAndArea } from '../../../src/printCheck/filament.js'
import { measuredObjects, surfacePart, measureSurface, extentAlong } from '../../../src/printCheck/surfaceMeasures.js'

/** A UV sphere, not indexed, as an STL loads: one triangle per three vertices. */
function sphere(rings, segments, radius = 20) {
	const point = (r, s) => {
		const theta = (r / rings) * Math.PI
		const phi = (s / segments) * Math.PI * 2
		return [radius * Math.sin(theta) * Math.cos(phi), radius * Math.cos(theta), radius * Math.sin(theta) * Math.sin(phi)]
	}
	const positions = []
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segments; s++) {
			const [a, b, c, d] = [point(r, s), point(r + 1, s), point(r + 1, s + 1), point(r, s + 1)]
			positions.push(...a, ...b, ...c, ...a, ...c, ...d)
		}
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
	return geometry
}

/** A T: a stem with a bar across its top, whose undersides overhang. */
function tee() {
	const stem = new THREE.BoxGeometry(2, 10, 2)
	stem.translate(0, 5, 0)
	const bar = new THREE.BoxGeometry(10, 2, 2)
	bar.translate(0, 11, 0)
	return [stem, bar]
}

/** The same box with its positions quantised to normalised int16, as glTF's KHR_mesh_quantization stores them. */
function quantisedBox() {
	const box = new THREE.BoxGeometry(1.5, 0.75, 1)
	const source = box.attributes.position
	const quantised = new Int16Array(source.count * 3)
	for (let i = 0; i < source.array.length; i++) {
		quantised[i] = Math.round(source.array[i] * 32767)
	}
	box.setAttribute('position', new THREE.BufferAttribute(quantised, 3, true))
	return box
}

/** A box whose positions sit in an interleaved buffer with its normals. */
function interleavedBox() {
	const box = new THREE.BoxGeometry(3, 1, 2).toNonIndexed()
	const { position, normal } = box.attributes
	const data = new Float32Array(position.count * 6)
	for (let i = 0; i < position.count; i++) {
		data.set([position.getX(i), position.getY(i), position.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i)], i * 6)
	}
	const buffer = new THREE.InterleavedBuffer(data, 6)
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0))
	geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3))
	return geometry
}

/** Triangles that measure as nothing: one with no area, one with a NaN corner. */
function brokenTriangles() {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([
		0, 0, 0, 1, 1, 1, 2, 2, 2,
		0, 0, 0, Number.NaN, 0, 0, 0, 0, 1,
		0, 3, 0, 1, 3, 0, 0, 3, 1,
	], 3))
	return geometry
}

const MATERIAL = new THREE.MeshBasicMaterial()

const FIXTURES = {
	'an STL sphere, turned Z-up to Y-up': () => {
		const root = new THREE.Group()
		const mesh = new THREE.Mesh(sphere(40, 30), MATERIAL)
		mesh.rotation.x = -Math.PI / 2
		root.add(mesh)
		return root
	},
	'a T in two indexed parts, scaled, turned and moved': () => {
		const root = new THREE.Group()
		const [stem, bar] = tee()
		const a = new THREE.Mesh(stem, MATERIAL)
		const b = new THREE.Mesh(bar, MATERIAL)
		b.position.set(0.3, 0.2, -0.1)
		b.rotation.set(0.2, 0.7, -0.4)
		root.add(a, b)
		root.scale.set(1.5, 0.8, 2.25)
		root.rotation.set(0.1, 1.1, 0.05)
		root.position.set(-4, 7.5, 3)
		return root
	},
	'quantised, interleaved and broken geometry beside a line and points': () => {
		const root = new THREE.Group()
		const quantised = new THREE.Mesh(quantisedBox(), MATERIAL)
		quantised.scale.setScalar(12.5)
		const interleaved = new THREE.Mesh(interleavedBox(), MATERIAL)
		interleaved.position.set(5, -2, 1)
		const broken = new THREE.Mesh(brokenTriangles(), MATERIAL)
		const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9, -9, -9), new THREE.Vector3(1, 1, 1)]))
		const points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([30, 1, 1, 2, 40, 2], 3)))
		root.add(quantised, interleaved, broken, line, points)
		return root
	},
	'a matrix with a perspective row': () => {
		const root = new THREE.Group()
		const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(5, 1.5, 64, 12), MATERIAL)
		mesh.matrixAutoUpdate = false
		mesh.matrix.set(
			1, 0.1, 0, 2,
			0, 1, 0.2, 1,
			0.05, 0, 1, 0,
			0.001, 0.002, 0, 1,
		)
		root.add(mesh)
		return root
	},
}

/** What the page measured before: the three.js versions, as usePrintCheck called them. */
function onThePage(root, up, thresholdDeg, mmPerUnit, bedEpsilonMm) {
	const axes = bedAxes(up)
	const extent = modelExtentMm(root, axes, mmPerUnit)
	root.updateMatrixWorld(true)
	const meshes = measuredObjects(root).filter((object) => object.isMesh)
	const { overhangArea, totalArea } = overhangShare(meshes, axes.up, thresholdDeg, extent.min.y, bedEpsilonMm / mmPerUnit)
	const { volumeMm3, areaMm2 } = modelVolumeAndArea(meshes, mmPerUnit)
	return { extent, overhangArea, totalArea, volumeMm3, areaMm2 }
}

/** The same, measured as the worker does, on the copy it is sent. */
function inTheWorker(root, up, thresholdDeg, mmPerUnit, bedEpsilonMm) {
	root.updateMatrixWorld(true)
	const objects = measuredObjects(root)
	// What postMessage delivers: a structured clone
	const parts = structuredClone(objects.map(surfacePart))
	const axes = bedAxes(up)
	const result = measureSurface(parts, {
		matrices: objects.map((object) => Float64Array.from(object.matrixWorld.elements)),
		axes: { up: axes.up.toArray(), width: axes.width.toArray(), depth: axes.depth.toArray() },
		thresholdDeg,
		bedEpsilon: bedEpsilonMm / mmPerUnit,
	})
	const min = result.extent ? result.extent.min : [0, 0, 0]
	const max = result.extent ? result.extent.max : [0, 0, 0]
	return {
		extent: { width: (max[0] - min[0]) * mmPerUnit, depth: (max[2] - min[2]) * mmPerUnit, height: (max[1] - min[1]) * mmPerUnit, min, max },
		overhangArea: result.overhangArea,
		totalArea: result.totalArea,
		volumeMm3: result.volume * mmPerUnit ** 3,
		areaMm2: result.area * mmPerUnit ** 2,
	}
}

describe.each(Object.keys(FIXTURES))('%s', (name) => {
	test.each([
		['y', 45, 1, 0.05],
		['z', 45, 1, 0.05],
		['y', 20, 25.4, 0.05],
		['z', 72, 0.1, 0.05],
	])('up %s, %d°, %d mm per unit: identical to the page', (up, angle, mmPerUnit, epsilon) => {
		const before = onThePage(FIXTURES[name](), up, angle, mmPerUnit, epsilon)
		const after = inTheWorker(FIXTURES[name](), up, angle, mmPerUnit, epsilon)

		expect(after.extent.width).toBe(before.extent.width)
		expect(after.extent.depth).toBe(before.extent.depth)
		expect(after.extent.height).toBe(before.extent.height)
		expect(after.extent.min).toEqual(before.extent.min.toArray())
		expect(after.extent.max).toEqual(before.extent.max.toArray())
		expect(after.overhangArea).toBe(before.overhangArea)
		expect(after.totalArea).toBe(before.totalArea)
		expect(after.volumeMm3).toBe(before.volumeMm3)
		expect(after.areaMm2).toBe(before.areaMm2)
		// Not a pair of zeros agreeing: each fixture has a surface, and at 45° or less something overhangs
		expect(after.totalArea).toBeGreaterThan(0)
		if (angle <= 45) {
			expect(after.overhangArea).toBeGreaterThan(0)
		}
	})
})

test('a T overhangs under its bar, and only there', () => {
	const root = new THREE.Group()
	tee().forEach((geometry) => root.add(new THREE.Mesh(geometry, MATERIAL)))
	const { overhangArea, totalArea } = inTheWorker(root, 'y', 45, 1, 0.05)
	// The bar's underside, 10 × 2; the stem's bottom rests on the bed. Each box has 88 of surface
	expect(overhangArea).toBeCloseTo(20, 9)
	expect(totalArea).toBeCloseTo(176, 9)
})

test('a model with no finite vertex measures as nothing, as on the page', () => {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([Number.NaN, 0, 0, 0, Number.NaN, 0, 0, 0, Number.NaN], 3))
	const root = new THREE.Group()
	root.add(new THREE.Mesh(geometry, MATERIAL))
	root.updateMatrixWorld(true)
	const parts = measuredObjects(root).map(surfacePart)
	expect(extentAlong(parts, [new THREE.Matrix4().elements], { up: [0, 1, 0], width: [1, 0, 0], depth: [0, 0, 1] })).toBeNull()
	const before = onThePage(root, 'y', 45, 1, 0.05)
	const after = inTheWorker(root, 'y', 45, 1, 0.05)
	expect(after.extent.width).toBe(before.extent.width)
	expect(after.totalArea).toBe(before.totalArea)
})

test('the copy for the worker leaves the model\'s own buffers alone', () => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MATERIAL)
	const part = surfacePart(mesh)
	expect(part.positions).not.toBe(mesh.geometry.attributes.position.array)
	expect(part.positions.buffer).not.toBe(mesh.geometry.attributes.position.array.buffer)
	expect(part.index).not.toBe(mesh.geometry.index.array)
	expect([...part.index]).toEqual([...mesh.geometry.index.array])
	expect(part.surface).toBe(true)

	const points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([1, 2, 3], 3)))
	expect(surfacePart(points)).toEqual({ positions: new Float32Array([1, 2, 3]), index: null, surface: false })
})

test('measuredObjects leaves Print check\'s own overlays out', () => {
	const root = new THREE.Group()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MATERIAL)
	const overlay = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MATERIAL)
	overlay.userData.viewerOverlay = true
	root.add(mesh, overlay, new THREE.Group())
	expect(measuredObjects(root)).toEqual([mesh])
})
