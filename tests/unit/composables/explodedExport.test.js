/**
 * An export is a file of the model, not of the view: a model exported while Exploded
 * view had its parts apart must come out with them together. STL, OBJ and PLY (and Send
 * to Slicer's copies of them) are written in one synchronous call inside
 * withOwnDisplayState; GLB, USDZ and 3MF are written asynchronously, so the viewer
 * puts the parts together for the export with `suspend`. Either way, the transform the
 * gizmo gave the model is exported, as the user placed it.
 */
import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'
import { useTransformGizmo } from '../../../src/composables/useTransformGizmo.js'
import { withOwnDisplayState } from '../../../src/utils/ownDisplayState.js'
import { build3MFModelXml } from '../../../src/utils/threeMFWriter.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
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

// The way useExport and SlicerModal call it
const OWN_STATE = { keepRootTransform: true }

function model() {
	const root = new THREE.Group()
	for (let i = 0; i < 3; i++) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ name: `part${i}` }))
		mesh.position.x = i * 2
		root.add(mesh)
	}
	new THREE.Scene().add(root)
	root.updateMatrixWorld(true)
	return root
}

function exploded() {
	const root = model()
	const view = useExplodedView()
	view.init(root)
	view.toggle()
	view.setFactor(1)
	root.updateMatrixWorld(true)
	return { root, view }
}

describe.each([
	['STL', (root) => new STLExporter().parse(root)],
	['OBJ', (root) => new OBJExporter().parse(root)],
])('an %s of an exploded model', (format, write) => {
	it('has its parts together, as an export of the assembled model does', () => {
		const together = write(model())
		const { root } = exploded()
		expect(write(root)).not.toBe(together)

		expect(withOwnDisplayState(root, () => write(root), OWN_STATE)).toBe(together)
	})

	it('leaves the viewer exploded', () => {
		const { root } = exploded()
		const apart = root.children.map((child) => child.position.x)
		withOwnDisplayState(root, () => write(root), OWN_STATE)
		expect(root.children.map((child) => child.position.x)).toEqual(apart)
	})

	it('keeps the transform the gizmo gave the model', async () => {
		const placed = model()
		placed.scale.set(2, 2, 2)
		placed.updateMatrixWorld(true)
		const expected = write(placed)

		const { root } = exploded()
		const gizmo = useTransformGizmo()
		await gizmo.init(new THREE.Scene(), new THREE.PerspectiveCamera(), { domElement: document.createElement('canvas') }, null)
		gizmo.rememberTransform(root)
		gizmo.toggle(root)
		root.scale.set(2, 2, 2)
		root.updateMatrixWorld(true)

		expect(withOwnDisplayState(root, () => write(root), OWN_STATE)).toBe(expected)
	})
})

describe('a 3MF of an exploded model, written while the view is suspended', () => {
	it('has its parts together, and the view explodes again after', () => {
		const xml = (root) => build3MFModelXml(root).xml
		const together = xml(model())
		const { root, view } = exploded()
		const apart = root.children.map((child) => child.position.x)
		expect(xml(root)).not.toBe(together)

		view.suspend()
		expect(xml(root)).toBe(together)
		view.resume()

		expect(root.children.map((child) => child.position.x)).toEqual(apart)
	})
})

describe('suspending Exploded view', () => {
	it('waits for every export to finish, and resumes at the amount set meanwhile', () => {
		const { root, view } = exploded()
		const xs = () => root.children.map((child) => child.position.x)
		view.suspend()
		view.suspend()
		view.setFactor(0.5)
		expect(xs()).toEqual([0, 2, 4])
		view.resume()
		expect(xs()).toEqual([0, 2, 4])
		view.resume()
		view.resume() // one too many does nothing
		expect(xs()).not.toEqual([0, 2, 4])
		expect(view.factor.value).toBe(0.5)
		expect(view.isActive.value).toBe(true)
	})
})
