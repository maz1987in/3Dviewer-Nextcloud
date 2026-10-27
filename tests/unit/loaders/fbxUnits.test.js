/**
 * An FBX model's true size. FBX files say what their unit is, in GlobalSettings'
 * UnitScaleFactor (centimetres per unit, 1 by default), and three's FBXLoader records it
 * without applying it. The app's loader then shrinks any model larger than 50 units to 5,
 * for its lighting. Both are recorded on the model, so measurements and export divide
 * them back out, while the model is framed and shown exactly as before.
 */
import * as THREE from 'three'
import FbxLoader from '../../../src/loaders/types/fbx.js'
import { fbxUnit, millimetresPerFileUnit, millimetresPerUnit, viewerScale } from '../../../src/utils/sourceUnits.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/**
 * An ASCII FBX holding one tetrahedron, its legs `leg` file units long.
 * @param {number} leg - leg length, in file units
 * @param {?number} unitScaleFactor - centimetres per unit, or null to leave it out
 * @return {ArrayBuffer} the file
 */
function asciiFbx(leg, unitScaleFactor) {
	const unit = unitScaleFactor === null ? '' : `\t\tP: "UnitScaleFactor", "double", "Number", "",${unitScaleFactor}\n`
	const text = '; FBX 7.4.0 project file\n'
		+ 'FBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n}\n'
		+ 'GlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n'
		+ '\t\tP: "UpAxis", "int", "Integer", "",1\n'
		+ unit
		+ '\t}\n}\n'
		+ 'Objects:  {\n'
		+ '\tGeometry: 1000, "Geometry::tetra", "Mesh" {\n'
		+ `\t\tVertices: *12 {\n\t\t\ta: 0,0,0,${leg},0,0,0,${leg},0,0,0,${leg}\n\t\t}\n`
		+ '\t\tPolygonVertexIndex: *12 {\n\t\t\ta: 0,2,-2,0,1,-4,0,3,-3,1,2,-4\n\t\t}\n'
		+ '\t\tGeometryVersion: 124\n'
		+ '\t}\n'
		+ '\tModel: 2000, "Model::tetra", "Mesh" {\n\t\tVersion: 232\n\t}\n'
		+ '}\n'
		+ 'Connections:  {\n\tC: "OO",2000,0\n\tC: "OO",1000,2000\n}\n'
	const bytes = new TextEncoder().encode(text)
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

const load = async (buffer) => (await new FbxLoader().loadModel(buffer, { THREE, filename: 'model.fbx' })).object3D

const largest = (object) => {
	object.updateMatrixWorld(true)
	const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
	return Math.max(size.x, size.y, size.z)
}

describe('FBX units', () => {
	it('reads a large model in metres at its true size, though it is shown 5 units across', async () => {
		// 100 units of a metre (UnitScaleFactor 100 cm): 100 m
		const object = await load(asciiFbx(100, 100))
		expect(object.userData.unitScaleFactor).toBe(100)
		expect(largest(object)).toBeCloseTo(5, 6)
		expect(object.userData.viewerScale).toBeCloseTo(0.05, 9)
		expect(largest(object) * millimetresPerUnit('model.fbx', object)).toBeCloseTo(100000, 3)
		// The file's own unit, before the viewer's rescale, is a metre
		expect(millimetresPerFileUnit('model.fbx', object)).toBeCloseTo(1000, 9)
	})

	it('reads a large model in centimetres at its true size', async () => {
		// 180 cm tall
		const object = await load(asciiFbx(180, 1))
		expect(largest(object)).toBeCloseTo(5, 6)
		expect(largest(object) * millimetresPerUnit('model.fbx', object)).toBeCloseTo(1800, 3)
	})

	it('leaves a small model unscaled, and reads its unit', async () => {
		const object = await load(asciiFbx(10, 2.54))
		expect(object.userData.viewerScale).toBeUndefined()
		expect(largest(object)).toBeCloseTo(10, 6)
		expect(millimetresPerUnit('model.fbx', object)).toBeCloseTo(25.4, 9)
	})

	it('takes a file with no UnitScaleFactor as centimetres, FBX\'s default', async () => {
		const object = await load(asciiFbx(10, null))
		expect(object.userData.unitScaleFactor).toBeUndefined()
		expect(millimetresPerUnit('model.fbx', object)).toBe(10)
	})
})

describe('fbxUnit and viewerScale', () => {
	it('ignore what is not a positive number', () => {
		const root = new THREE.Group()
		expect(fbxUnit(root)).toBeNull()
		expect(viewerScale(root)).toBe(1)
		root.userData.unitScaleFactor = 0
		root.userData.viewerScale = -2
		expect(fbxUnit(root)).toBeNull()
		expect(viewerScale(root)).toBe(1)
		expect(millimetresPerUnit('model.fbx', root)).toBe(10)
	})

	it('divide the viewer\'s rescale out of the file\'s unit', () => {
		const root = new THREE.Group()
		root.userData.unitScaleFactor = 1
		root.userData.viewerScale = 0.5
		expect(millimetresPerFileUnit('model.fbx', root)).toBe(10)
		expect(millimetresPerUnit('model.fbx', root)).toBe(20)
	})
})
