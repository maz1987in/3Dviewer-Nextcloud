/**
 * What the Files sidebar's "3D" tab stores of a model, measured off the loaded model.
 */
import {
	BoxGeometry,
	BufferAttribute,
	BufferGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshStandardMaterial,
	Points,
	PointsMaterial,
	Texture,
} from 'three'
import { extractModelStats, STATS_VERSION } from '../../../src/stats/extractStats.js'
import { MOVED_BY, rememberOwnTransform } from '../../../src/utils/viewerTransforms.js'

/** A box of the given size, as a mesh of 12 triangles. */
function box(w = 2, h = 3, d = 4, material = new MeshStandardMaterial()) {
	return new Mesh(new BoxGeometry(w, h, d), material)
}

/** A closed tetrahedron with shared vertices, which the closed-mesh check can see is closed. */
function tetrahedron() {
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), 3))
	geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3])
	return new Mesh(geometry, new MeshStandardMaterial())
}

/** A single triangle, which is open: it has no inside. */
function triangle() {
	const geometry = new BufferGeometry()
	geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3))
	return new Mesh(geometry, new MeshStandardMaterial())
}

describe('extractModelStats of a mesh', () => {
	it('reads the size along X, Y and Z, and counts what the model is made of', () => {
		const root = new Group()
		root.add(box(2, 3, 4))

		const stats = extractModelStats(root, { filename: 'part.stl' })

		expect(stats).toMatchObject({
			v: STATS_VERSION,
			kind: 'mesh',
			triangles: 12,
			parts: 1,
			materials: 1,
			textures: 0,
			points: 0,
			splats: 0,
			layers: null,
			printSeconds: null,
			up: null,
		})
		expect(stats.size.map((n) => Number(n.toFixed(6)))).toEqual([2, 3, 4])
		expect(stats.vertices).toBeGreaterThan(0)
	})

	it('counts a material and a texture shared by two parts once', () => {
		const material = new MeshStandardMaterial({ map: new Texture({ width: 8, height: 8 }) })
		const root = new Group()
		root.add(box(1, 1, 1, material))
		root.add(box(1, 1, 1, material))
		root.add(box(1, 1, 1))

		const stats = extractModelStats(root, { filename: 'part.glb' })

		expect(stats).toMatchObject({ parts: 3, materials: 2, textures: 1, triangles: 36 })
	})

	it('measures the area and the volume of a mesh that is closed', () => {
		const root = new Group()
		root.add(tetrahedron())

		const stats = extractModelStats(root, { filename: 'tetra.stl' })

		expect(stats.area).toBeCloseTo(1.5 + Math.sqrt(3) / 2, 6)
		expect(stats.volume).toBeCloseTo(1 / 6, 6)
		expect(stats.watertight).toBe(true)
	})

	it('measures the volume of a mesh that cannot be checked, as the viewer does, and says it was not checked', () => {
		// An STL has no shared vertices to check edges with
		const root = new Group()
		root.add(new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), new MeshStandardMaterial()))

		const stats = extractModelStats(root, { filename: 'cube.stl' })

		expect(stats.area).toBeCloseTo(6, 6)
		expect(stats.volume).toBeCloseTo(1, 6)
		expect(stats.watertight).toBeNull()
	})

	it('has no volume to speak of for a single triangle', () => {
		const root = new Group()
		root.add(triangle())

		const stats = extractModelStats(root, { filename: 'sheet.stl' })

		expect(stats.area).toBeCloseTo(0.5, 6)
		expect(stats.volume).toBeNull()
		expect(stats.watertight).toBeNull()
	})

	it('has no volume for a mesh found to be open, and says so', () => {
		const open = tetrahedron()
		open.geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2])
		const root = new Group()
		root.add(open)

		const stats = extractModelStats(root, { filename: 'open.stl' })

		expect(stats.volume).toBeNull()
		expect(stats.watertight).toBe(false)
	})

	it('has no volume when any one part is found open', () => {
		const open = tetrahedron()
		open.geometry.setIndex([0, 2, 1, 0, 1, 3, 0, 3, 2])
		const root = new Group()
		root.add(tetrahedron())
		root.add(open)

		expect(extractModelStats(root, { filename: 'mixed.stl' }).volume).toBeNull()
	})

	it('follows the scale of the parent: the size is that of the model in the scene', () => {
		const root = new Group()
		const child = box(1, 1, 1)
		child.scale.set(2, 2, 2)
		root.add(child)

		const stats = extractModelStats(root, { filename: 'a.stl' })

		expect(stats.size.map((n) => Number(n.toFixed(6)))).toEqual([2, 2, 2])
		expect(stats.area).toBeCloseTo(24, 6)
	})

	it('divides out the scale the viewer applied to fit the lighting, to give the file\'s own numbers', () => {
		const root = new Group()
		root.add(new Mesh(new BoxGeometry(5, 5, 5).toNonIndexed(), new MeshStandardMaterial()))
		root.userData.viewerScale = 0.5
		root.userData.unitScaleFactor = 1

		const stats = extractModelStats(root, { filename: 'big.fbx' })

		expect(stats.size.map((n) => Number(n.toFixed(6)))).toEqual([10, 10, 10])
		expect(stats.area).toBeCloseTo(600, 4)
		expect(stats.volume).toBeCloseTo(1000, 4)
	})

	it('does not report what rounding left of a flat model as its height', () => {
		const root = new Group()
		const sheet = triangle()
		sheet.rotation.x = -Math.PI / 2
		root.add(sheet)

		const stats = extractModelStats(root, { filename: 'sheet.stl' })

		expect(stats.size[1]).toBe(0)
		expect(stats.size[0]).toBeCloseTo(1, 6)
		expect(stats.size[2]).toBeCloseTo(1, 6)
	})

	it('leaves out area and volume past the triangle limit', () => {
		const root = new Group()
		const big = new Mesh(new BufferGeometry(), new MeshStandardMaterial())
		// 2,000,001 triangles, laid out as one position per corner of a flat strip
		const corners = new Float32Array(2_000_001 * 9)
		big.geometry.setAttribute('position', new BufferAttribute(corners, 3))
		root.add(big)
		big.geometry.boundingBox = null
		root.add(box(1, 1, 1))

		const stats = extractModelStats(root, { filename: 'huge.stl' })

		expect(stats.triangles).toBeGreaterThan(2_000_000)
		expect(stats.area).toBeNull()
		expect(stats.volume).toBeNull()
	})
})

describe('extractModelStats and the file\'s unit', () => {
	it('names the unit the format uses and whether it is a guess', () => {
		const stl = new Group()
		stl.add(box())
		const glb = new Group()
		glb.add(box())

		expect(extractModelStats(stl, { filename: 'a.stl' }).unit).toEqual({ mm: 1, changeable: true })
		expect(extractModelStats(glb, { filename: 'a.glb' }).unit).toEqual({ mm: 1000, changeable: false })
	})

	it('reads the unit a file records, from the model', () => {
		const root = new Group()
		root.add(box())
		root.userData.unitScaleFactor = 2.54

		const stats = extractModelStats(root, { filename: 'a.fbx' })

		expect(stats.unit.mm).toBeCloseTo(25.4, 6)
		expect(stats.unit.changeable).toBe(false)
	})

	it('does not take a unit chosen for the file: that is read when it is shown', () => {
		const root = new Group()
		root.add(box())

		expect(extractModelStats(root, { filename: 'a.stl' }).unit.mm).toBe(1)
	})
})

describe('extractModelStats of other kinds of model', () => {
	it('counts the points of a scan, all of them, and records which way is up', () => {
		const positions = new Float32Array([0, 0, 0, 4, 0, 0, 0, 5, 0, 0, 0, 6])
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(positions, 3))
		const cloud = new Points(geometry, new PointsMaterial())
		const root = new Group()
		root.add(cloud)
		root.userData.tdvPointCloud = { total: 1_000_000, up: '+z', attributes: {} }

		const stats = extractModelStats(root, { filename: 'scan.las' })

		expect(stats).toMatchObject({ kind: 'points', points: 1_000_000, triangles: 0, up: '+z' })
		expect(stats.size.map((n) => Number(n.toFixed(6)))).toEqual([4, 5, 6])
		expect(stats.area).toBeNull()
	})

	it('counts the splats of a capture', () => {
		const root = new Group()
		root.add(box(2, 2, 2))
		root.userData.tdvSplat = { total: 500_000, count: 200_000, up: '+y' }

		const stats = extractModelStats(root, { filename: 'room.splat' })

		expect(stats).toMatchObject({ kind: 'splats', splats: 500_000, up: '+y', triangles: 0 })
	})

	it('counts the layers of a toolpath and reads the print time the slicer wrote', () => {
		const root = new Group()
		root.userData.slicerSummary = { slicer: 'PrusaSlicer', printSeconds: 3725.4, filamentMm: 1, filamentGrams: 2 }
		for (let i = 0; i < 3; i++) {
			const geometry = new BufferGeometry()
			geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, i, 0, 10, i, 0]), 3))
			const layer = new LineSegments(geometry, new LineBasicMaterial())
			layer.userData.gcodeLayerZ = i * 0.2
			root.add(layer)
		}

		const stats = extractModelStats(root, { filename: 'benchy.gcode' })

		expect(stats).toMatchObject({ kind: 'toolpath', layers: 3, printSeconds: 3725, triangles: 0 })
	})

	it('has no print time for a toolpath whose slicer wrote none', () => {
		const root = new Group()
		root.userData.slicerSummary = { slicer: null, printSeconds: null, filamentMm: null, filamentGrams: null }
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 10, 0, 0]), 3))
		const layer = new LineSegments(geometry, new LineBasicMaterial())
		layer.userData.gcodeLayerZ = 0
		root.add(layer)

		expect(extractModelStats(root, { filename: 'a.gcode' })).toMatchObject({ kind: 'toolpath', layers: 1, printSeconds: null })
	})
})

describe('extractModelStats as the model is, whatever a viewer tool shows of it', () => {
	it('measures the parts together when Exploded view has spread them', () => {
		const root = new Group()
		const a = box(1, 1, 1)
		const b = box(1, 1, 1)
		root.add(a)
		root.add(b)
		rememberOwnTransform(b, MOVED_BY.exploded)
		b.position.set(10, 0, 0)

		expect(extractModelStats(root, { filename: 'a.stl' }).size.map((n) => Number(n.toFixed(6)))).toEqual([1, 1, 1])
	})

	it('measures a model the transform gizmo has stretched as the file has it', () => {
		const root = new Group()
		root.add(box(1, 1, 1))
		rememberOwnTransform(root, MOVED_BY.gizmo)
		root.scale.set(5, 5, 5)

		expect(extractModelStats(root, { filename: 'a.stl' }).size.map((n) => Number(n.toFixed(6)))).toEqual([1, 1, 1])
	})

	it('leaves the model as the viewer had it', () => {
		const root = new Group()
		const b = box(1, 1, 1)
		root.add(b)
		rememberOwnTransform(b, MOVED_BY.exploded)
		b.position.set(10, 0, 0)

		extractModelStats(root, { filename: 'a.stl' })

		expect(b.position.x).toBe(10)
	})

	it('counts the model\'s own materials, not a render mode\'s stand-ins', () => {
		const own = new MeshStandardMaterial()
		const root = new Group()
		const mesh = box(1, 1, 1, own)
		root.add(mesh)
		const standIn = new MeshStandardMaterial()
		mesh.userData.tdvOwnMaterial = own
		mesh.material = standIn

		const stats = extractModelStats(root, { filename: 'a.stl' })

		expect(stats.materials).toBe(1)
	})
})

describe('extractModelStats never throws', () => {
	it.each([[null], [undefined], [{}], ['model'], [42]])('returns null for %p', (input) => {
		expect(extractModelStats(input, { filename: 'a.stl' })).toBeNull()
	})

	it('returns null for a model with nothing in it', () => {
		expect(extractModelStats(new Group(), { filename: 'a.stl' })).toBeNull()
	})

	it('returns null when the model cannot be read', () => {
		const root = new Group()
		root.add(box())
		root.traverse = () => {
			throw new Error('broken scene graph')
		}

		expect(extractModelStats(root, { filename: 'a.stl' })).toBeNull()
	})

	it('measures a model whose file name is missing, by the formats\' default unit', () => {
		const root = new Group()
		root.add(box())

		expect(extractModelStats(root, { filename: undefined })).not.toBeNull()
	})
})
