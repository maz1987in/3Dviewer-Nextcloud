/**
 * An export is a file of the model, not of the view: a model exported while Exploded
 * view had its parts apart must come out with them together. STL, OBJ and PLY (and Send
 * to Slicer's copies of them) are written in one synchronous call inside
 * withExportState; GLB, USDZ and 3MF are written asynchronously, so the viewer puts
 * the parts together for the export with `suspend`. Either way, the transform the gizmo
 * gave the model and the pose its animation is in are exported, as the user has them;
 * a thumbnail, drawn inside withOwnDisplayState, undoes both.
 */
import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'
import { useTransformGizmo } from '../../../src/composables/useTransformGizmo.js'
import { useAnimation } from '../../../src/composables/useAnimation.js'
import { withExportState, withOwnDisplayState } from '../../../src/utils/ownDisplayState.js'
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

		expect(withExportState(root, () => write(root))).toBe(together)
	})

	it('leaves the viewer exploded', () => {
		const { root } = exploded()
		const apart = root.children.map((child) => child.position.x)
		withExportState(root, () => write(root))
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

		expect(withExportState(root, () => write(root))).toBe(expected)
	})

	it('writes the pose a paused animation holds, which a thumbnail does not draw', () => {
		const named = () => {
			const root = model()
			root.children[0].name = 'lift'
			return root
		}
		const posed = named()
		posed.children[0].position.y = 2.5
		posed.updateMatrixWorld(true)
		const expected = write(posed)

		const root = named()
		const animation = useAnimation()
		animation.initAnimations(root, [new THREE.AnimationClip('lift', 1, [
			new THREE.VectorKeyframeTrack('lift.position', [0, 1], [0, 0, 0, 0, 5, 0]),
		])])
		animation.update(0.5)
		animation.pause()
		root.updateMatrixWorld(true)

		expect(withExportState(root, () => write(root))).toBe(expected)
		expect(withOwnDisplayState(root, () => write(root))).toBe(write(named()))
		animation.dispose()
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

describe('an export written while an animation is paused', () => {
	it('leaves the paused pose alone when Exploded view is off', () => {
		const root = model()
		root.children[0].name = 'lift'
		const clip = new THREE.AnimationClip('lift', 1, [
			new THREE.VectorKeyframeTrack('lift.position', [0, 1], [0, 0, 0, 0, 5, 0]),
		])
		const view = useExplodedView()
		view.init(root)
		const animation = useAnimation()
		animation.initAnimations(root, [clip])
		animation.update(0.5)
		animation.pause()
		expect(root.children[0].position.y).toBeCloseTo(2.5, 6)

		// A GLB, USDZ or 3MF export
		view.suspend()
		expect(root.children[0].position.y).toBeCloseTo(2.5, 6)
		view.resume()

		// The mixer only re-poses while playing, so nothing would put the pose back
		animation.update(0.1)
		expect(root.children[0].position.y).toBeCloseTo(2.5, 6)
		animation.dispose()
	})

	it('still waits for every export before the slider moves the parts', () => {
		const root = model()
		const view = useExplodedView()
		view.init(root)
		view.suspend()
		view.toggle() // switched on during the export
		expect(root.children.map((child) => child.position.x)).toEqual([0, 2, 4])
		view.resume()
		expect(root.children.map((child) => child.position.x)).not.toEqual([0, 2, 4])
	})
})
