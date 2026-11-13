/**
 * @jest-environment node
 *
 * The USDZ file View in AR opens in Quick Look: written by three's real exporter, read
 * back, and checked for the size it will have in the room. (The node environment, because
 * fflate cannot read a jsdom Uint8Array as file contents.)
 */
import * as THREE from 'three'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { buildUsdz, hasSurfaces } from '../../../src/utils/usdz.js'
import { buildQuickLookFile, quickLookHref, USDZ_MIME_TYPE } from '../../../src/ar/quickLook.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** A cube `size` units across, standing on the floor. */
function cube(size) {
	const root = new THREE.Group()
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial())
	mesh.position.y = size / 2
	root.add(mesh)
	new THREE.Scene().add(root)
	root.updateMatrixWorld(true)
	return root
}

/** The USD layers of a USDZ file, as text: the scene, and a file of geometry for each mesh. */
const usda = (bytes) => Object.values(unzipSync(bytes)).map((file) => strFromU8(file)).join('\n')

/**
 * The size of the model's bounding box in the USD file, in metres: the extent of each
 * mesh under the scale the file puts on it.
 */
function sizeInMetres(layer) {
	// Every transform in the file is a uniform scale and a move: the product of their
	// scales is what a vertex in the mesh is multiplied by
	const scales = [...layer.matchAll(/matrix4d xformOp:transform = \(\s*\(([-\d.e]+),/g)].map((m) => Number(m[1]))
	const points = layer.match(/point3f\[\] points = \[(.*)\]/)[1]
	const xs = [...points.matchAll(/\(([-\d.e]+),/g)].map((m) => Number(m[1]))
	return (Math.max(...xs) - Math.min(...xs)) * scales.reduce((a, b) => a * b, 1)
}

it('declares a unit as a metre, as AR Quick Look reads it', async () => {
	expect(usda(await buildUsdz(cube(1), { millimetresPerUnit: 1000 }))).toMatch(/metersPerUnit = 1\b/)
})

it('writes a model in millimetres a thousandth the size: a 10 mm cube is a centimetre', async () => {
	const layer = usda(await buildUsdz(cube(10), { millimetresPerUnit: 1 }))
	expect(sizeInMetres(layer)).toBeCloseTo(0.01, 9)
})

it('writes a model in metres as it is: a 2 m cube is 2 m', async () => {
	const layer = usda(await buildUsdz(cube(2), { millimetresPerUnit: 1000 }))
	expect(sizeInMetres(layer)).toBeCloseTo(2, 9)
})

it('follows the unit the person chose for the file: a 10-unit cube in centimetres is 10 cm', async () => {
	const layer = usda(await buildUsdz(cube(10), { millimetresPerUnit: 10 }))
	expect(sizeInMetres(layer)).toBeCloseTo(0.1, 9)
})

it('leaves the model where it is in the viewer\'s scene', async () => {
	const model = cube(10)
	const parent = model.parent
	await buildUsdz(model, { millimetresPerUnit: 1 })
	expect(model.parent).toBe(parent)
	expect(model.scale.x).toBe(1)
})

it('has nothing to write for a model with no surfaces, and says so before making a file', async () => {
	const lines = new THREE.Group()
	lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])))
	expect(hasSurfaces(lines)).toBe(false)
	await expect(buildUsdz(lines)).rejects.toMatchObject({ name: 'NothingToExportError', format: 'USDZ' })
})

it('does not count a mesh the viewer hides', () => {
	const model = cube(10)
	model.children[0].visible = false
	expect(hasSurfaces(model)).toBe(false)
})

describe('the file Quick Look opens', () => {
	it('is a USDZ blob of the right type', async () => {
		const file = await buildQuickLookFile(cube(10), { millimetresPerUnit: 1 })
		expect(file.type).toBe(USDZ_MIME_TYPE)
		expect(file.type).toBe('model/vnd.usdz+zip')
		expect(file.size).toBeGreaterThan(100)
		const bytes = new Uint8Array(await file.arrayBuffer())
		expect(sizeInMetres(usda(bytes))).toBeCloseTo(0.01, 9)
	})

	it('is opened at the size it is: pinching it bigger is switched off', () => {
		expect(quickLookHref('blob:https://cloud.example/abc')).toBe('blob:https://cloud.example/abc#allowsContentScaling=0')
	})
})
