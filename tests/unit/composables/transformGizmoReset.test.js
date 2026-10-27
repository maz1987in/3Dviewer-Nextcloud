/**
 * The transform gizmo's Reset returns the model to where it was loaded, not to identity.
 * Identity undid the loader's own transform: the FBX (and OBJ) shrink to fit, whose factor
 * the readings still divide out, so an FBX measured 1/viewerScale too large after a
 * reset; and the 3MF turn from Z-up to Y-up, so a 3MF fell on its back.
 */
import * as THREE from 'three'
import { useTransformGizmo } from '../../../src/composables/useTransformGizmo.js'
import FbxLoader from '../../../src/loaders/types/fbx.js'
import { ThreeMfLoader } from '../../../src/loaders/types/threeMF.js'
import { millimetresPerUnit } from '../../../src/utils/sourceUnits.js'
import { asciiFbx, threeMF } from '../loaders/fixtures/unitFixtures.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))
jest.mock('@nextcloud/router', () => ({
	generateFilePath: (app, type, file) => `/custom_apps/${app}/${type}/${file}`,
	imagePath: (app, p) => `/custom_apps/${app}/img/${p}`,
}))
jest.mock('three/examples/jsm/controls/TransformControls.js', () => {
	const { Object3D } = jest.requireActual('three')
	return {
		TransformControls: class {
			setMode() {}
			setSize() {}
			getHelper() { return new Object3D() }
			addEventListener() {}
			attach() {}
			detach() {}
			dispose() {}
		},
	}
})

async function gizmo() {
	const g = useTransformGizmo()
	await g.init(new THREE.Scene(), new THREE.PerspectiveCamera(), { domElement: document.createElement('canvas') }, null)
	return g
}

const largest = (object) => {
	object.updateMatrixWorld(true)
	const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
	return Math.max(size.x, size.y, size.z)
}

// What a user does with the gizmo before pressing Reset
const fiddle = (object) => {
	object.position.set(3, -2, 7)
	object.rotation.set(0.3, 1.1, -0.4)
	object.scale.set(2, 0.5, 3)
}

describe('transform gizmo reset', () => {
	it('keeps a rescaled FBX at its true size', async () => {
		const loaded = await new FbxLoader().loadModel(asciiFbx(180, 1), { THREE, filename: 'model.fbx' })
		const root = loaded.object3D
		const trueSize = () => largest(root) * millimetresPerUnit('model.fbx', root)
		expect(trueSize()).toBeCloseTo(1800, 3)

		const g = await gizmo()
		g.rememberTransform(root)
		g.toggle(root)
		fiddle(root)
		g.resetTransform()

		expect(root.scale.x).toBeCloseTo(root.userData.viewerScale, 9)
		expect(trueSize()).toBeCloseTo(1800, 3)
	})

	it('keeps a 3MF standing the right way up, where it was placed', async () => {
		const bytes = threeMF('millimeter')
		const loaded = await new ThreeMfLoader().loadModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { filename: 'part.3mf' })
		const root = loaded.object3D
		root.position.set(1, 0, -1) // the viewer's centring
		const placed = { position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() }
		expect(root.rotation.x).toBeCloseTo(-Math.PI / 2, 9)

		const g = await gizmo()
		g.rememberTransform(root)
		g.toggle(root)
		fiddle(root)
		g.resetTransform()

		expect(root.position.equals(placed.position)).toBe(true)
		expect(root.quaternion.angleTo(placed.quaternion)).toBeCloseTo(0, 9)
		expect(root.scale.equals(placed.scale)).toBe(true)
		expect(root.rotation.x).toBeCloseTo(-Math.PI / 2, 9)
	})

	it('returns an object it was not told about to where it was first attached', async () => {
		const root = new THREE.Group()
		root.scale.setScalar(0.25)
		root.rotation.x = 1
		const g = await gizmo()
		g.toggle(root)
		fiddle(root)
		g.toggle(root) // detach
		g.toggle(root) // and attach again: still the first transform
		g.resetTransform()
		expect(root.scale.x).toBeCloseTo(0.25, 9)
		expect(root.rotation.x).toBeCloseTo(1, 9)
	})
})
