/**
 * The OBJ loader shrinks a model larger than 1000 units to 1000, for the camera. An OBJ
 * is read as millimetres, so a 5 m part measured, reported and exported as 1000 mm. The
 * loader now records the factor as userData.viewerScale, which utils/sourceUnits.js
 * divides back out, while the model is shown exactly as before.
 */
import * as THREE from 'three'
import ObjLoader from '../../../src/loaders/types/obj.js'
import { millimetresPerUnit, millimetresPerFileUnit } from '../../../src/utils/sourceUnits.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

function cubeObj(size) {
	const text = [
		`v 0 0 0`, `v ${size} 0 0`, `v ${size} ${size} 0`, `v 0 ${size} 0`,
		`v 0 0 ${size}`, `v ${size} 0 ${size}`, `v ${size} ${size} ${size}`, `v 0 ${size} ${size}`,
		'f 1 4 3 2', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8',
	].join('\n')
	const bytes = new TextEncoder().encode(text)
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

const load = async (size) => (await new ObjLoader().loadModel(cubeObj(size), { THREE, filename: 'part.obj', additionalFiles: [] })).object3D

const largest = (object) => {
	object.updateMatrixWorld(true)
	const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
	return Math.max(size.x, size.y, size.z)
}

describe('OBJ rescale', () => {
	it('reads a 5 m OBJ at 5000 mm, though it is shown 1000 units across', async () => {
		const object = await load(5000)
		expect(largest(object)).toBeCloseTo(1000, 6)
		expect(object.userData.viewerScale).toBeCloseTo(0.2, 9)
		expect(largest(object) * millimetresPerUnit('part.obj', object)).toBeCloseTo(5000, 3)
		expect(millimetresPerFileUnit('part.obj', object)).toBe(1)
	})

	it('leaves a model of 1000 units or less unscaled and unrecorded', async () => {
		const object = await load(800)
		expect(object.userData.viewerScale).toBeUndefined()
		expect(largest(object)).toBeCloseTo(800, 6)
		expect(millimetresPerUnit('part.obj', object)).toBe(1)
	})
})
