/**
 * @jest-environment jsdom
 *
 * Export-pipeline tests. Three.js exporter internals are mocked — Jest can't
 * load `three/examples/jsm/**` (ESM-only) without heavy config, and what we
 * actually want to cover here is the composable's wrapper contract (MIME
 * types, blob sizing, error guards, argument plumbing to the exporter).
 * Real exporter output is exercised by the Playwright smoke suite in a
 * browser where Three's ESM loads natively.
 */

// Fixed payloads returned by each mocked exporter. `mock*` names are the
// only identifiers Jest allows factories to reference (hoisting exception).
const mockStlBytes = new ArrayBuffer(84)
const mockObjText = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\nusemtl blue\nf 1 2 3\n'
const mockGlbBytes = new ArrayBuffer(128)

const mockStlParse = jest.fn(() => mockStlBytes)
const mockObjParse = jest.fn(() => mockObjText)
const mockGltfParse = jest.fn((object, onDone) => {
	Promise.resolve().then(() => onDone(mockGlbBytes))
})

jest.mock('three/examples/jsm/exporters/STLExporter.js', () => ({
	STLExporter: jest.fn().mockImplementation(() => ({ parse: mockStlParse })),
}), { virtual: true })

jest.mock('three/examples/jsm/exporters/OBJExporter.js', () => ({
	OBJExporter: jest.fn().mockImplementation(() => ({ parse: mockObjParse })),
}), { virtual: true })

jest.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
	GLTFExporter: jest.fn().mockImplementation(() => ({ parse: mockGltfParse })),
}), { virtual: true })

// Silence the logger so tests don't spew.
jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// Minimal Three.js stand-ins — avoids pulling the real `three` package
// (which is ESM under "type": "module" and would need additional Jest config).
function fakeMesh({ positions, index, material }) {
	const geometry = {
		attributes: { position: { count: positions.length / 3 } },
		index: index ? { count: index.length } : null,
		groups: [],
		addGroup(start, count, materialIndex) {
			this.groups.push({ start, count, materialIndex })
		},
	}
	return {
		isMesh: true,
		geometry,
		material,
		traverse(cb) { cb(this) },
	}
}

function fakeGroup(children) {
	return {
		isMesh: false,
		traverse(cb) {
			cb(this)
			for (const c of children) c.traverse(cb)
		},
	}
}

// Capture blobs handed to URL.createObjectURL.
const blobCapture = []
beforeEach(() => {
	blobCapture.length = 0
	global.URL.createObjectURL = jest.fn((blob) => {
		blobCapture.push(blob)
		return 'blob:mock'
	})
	global.URL.revokeObjectURL = jest.fn()
	mockStlParse.mockClear()
	mockObjParse.mockClear()
	mockGltfParse.mockClear()
})

// Tight loop that advances timers and flushes microtasks so the exporter's
// progress setTimeout stages don't actually block.
async function run(promise) {
	for (let i = 0; i < 40; i++) {
		await Promise.resolve()
		jest.useFakeTimers ? null : null
	}
	// Real timers are fine — the sleeps total ~1 second.
	return promise
}

const { useExport, getGeometryStats } = require('../../../src/composables/useExport.js')

describe('getGeometryStats', () => {
	it('counts vertices and triangles for an indexed mesh', () => {
		const mesh = fakeMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] })
		expect(getGeometryStats(mesh)).toEqual({ vertices: 3, triangles: 1 })
	})

	it('falls back to position count / 3 when geometry is non-indexed', () => {
		const mesh = fakeMesh({ positions: new Array(18).fill(0) /* 6 verts → 2 tris */ })
		expect(getGeometryStats(mesh)).toEqual({ vertices: 6, triangles: 2 })
	})

	it('sums stats across a group of meshes', () => {
		const m1 = fakeMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] })
		const m2 = fakeMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] })
		const stats = getGeometryStats(fakeGroup([m1, m2]))
		expect(stats.vertices).toBe(6)
		expect(stats.triangles).toBe(2)
	})

	it('skips descendants without geometry', () => {
		const mesh = fakeMesh({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], index: [0, 1, 2] })
		const orphan = { isMesh: false, traverse(cb) { cb(this) } }
		const stats = getGeometryStats(fakeGroup([mesh, orphan]))
		expect(stats.triangles).toBe(1)
	})
})

describe('useExport — blob creation', () => {
	it('exportAsSTL wraps binary output in a model/stl blob', async () => {
		const exp = useExport()
		const mesh = fakeMesh({ positions: [0, 0, 0], index: [0] })

		await run(exp.exportAsSTL(mesh, 'triangle'))

		expect(mockStlParse).toHaveBeenCalledTimes(1)
		expect(mockStlParse).toHaveBeenCalledWith(mesh, { binary: true })
		expect(blobCapture.length).toBe(1)
		const blob = blobCapture[0]
		expect(blob.type).toBe('model/stl')
		expect(blob.size).toBe(mockStlBytes.byteLength)
	})

	it('exportAsOBJ wraps text output in a model/obj blob', async () => {
		const exp = useExport()
		const mesh = fakeMesh({ positions: [0, 0, 0], index: [0] })

		await run(exp.exportAsOBJ(mesh, 'triangle'))

		expect(mockObjParse).toHaveBeenCalledTimes(1)
		expect(blobCapture.length).toBe(1)
		const blob = blobCapture[0]
		expect(blob.type).toBe('model/obj')
		expect(blob.size).toBe(mockObjText.length)
	})

	it('exportAsOBJ forwards a multi-material mesh without flattening it', async () => {
		const exp = useExport()
		const matA = { name: 'red' }
		const matB = { name: 'blue' }
		const mesh = fakeMesh({
			positions: new Array(18).fill(0),
			index: [0, 1, 2, 3, 4, 5],
			material: [matA, matB],
		})
		mesh.geometry.addGroup(0, 3, 0)
		mesh.geometry.addGroup(3, 3, 1)

		await run(exp.exportAsOBJ(mesh, 'multi'))

		// The composable must hand the mesh to OBJExporter untouched — the
		// material array and geometry groups are what OBJExporter relies on
		// to emit per-group `usemtl` directives.
		const [parsedObject] = mockObjParse.mock.calls[0]
		expect(parsedObject).toBe(mesh)
		expect(Array.isArray(parsedObject.material)).toBe(true)
		expect(parsedObject.material).toHaveLength(2)
		expect(parsedObject.geometry.groups).toHaveLength(2)
	})

	it('exportAsGLB wraps the callback result in a model/gltf-binary blob', async () => {
		const exp = useExport()
		const mesh = fakeMesh({ positions: [0, 0, 0], index: [0] })

		await run(exp.exportAsGLB(mesh, 'triangle'))

		expect(mockGltfParse).toHaveBeenCalledTimes(1)
		expect(blobCapture.length).toBe(1)
		const blob = blobCapture[0]
		expect(blob.type).toBe('model/gltf-binary')
		expect(blob.size).toBe(mockGlbBytes.byteLength)
	})

	it('rejects each export when no object is provided', async () => {
		const exp = useExport()
		await expect(exp.exportAsSTL(null, 'x')).rejects.toThrow(/No object/)
		await expect(exp.exportAsOBJ(null, 'x')).rejects.toThrow(/No object/)
		await expect(exp.exportAsGLB(null, 'x')).rejects.toThrow(/No object/)
	})
})
