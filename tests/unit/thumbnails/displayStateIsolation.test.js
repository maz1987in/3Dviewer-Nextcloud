/**
 * A thumbnail is stored once per file version and shown to everyone who can see the
 * file, so one user's view of the model must never become it. The viewer captures from
 * the live model half a second after it opens; each tool that changes that model is
 * checked here: the render sees the model's own state, the viewer has its state back
 * afterwards, and a render that throws still gives it back.
 */
import * as THREE from 'three'
import { renderThumbnail } from '../../../src/thumbnails/renderThumbnail.js'
import { setViewerWireframe } from '../../../src/utils/viewerMaterialProps.js'
import { useClippingPlane } from '../../../src/composables/useClippingPlane.js'
import { applyGcodeColorScheme } from '../../../src/utils/gcodeColorScheme.js'
import GCodeLoader from '../../../src/loaders/types/gcode.js'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'
import { useTransformGizmo } from '../../../src/composables/useTransformGizmo.js'

// What each render saw, read at the moment it happened
const rendered = []
// Set to make the next render throw, as a lost context does
const mockState = { fail: false }

jest.mock('three', () => {
	const actual = jest.requireActual('three')
	return {
		...actual,
		WebGLRenderer: jest.fn().mockImplementation(() => ({
			setClearColor: jest.fn(),
			setPixelRatio: jest.fn(),
			setSize: jest.fn(),
			render: jest.fn((scene, camera) => {
				if (mockState.fail) {
					mockState.fail = false
					throw new Error('context lost')
				}
				const objects = new Map()
				scene.traverse((child) => {
					if (!child.material) return
					const materials = Array.isArray(child.material) ? child.material : [child.material]
					objects.set(child, {
						wireframe: materials.map((m) => m.wireframe),
						side: materials.map((m) => m.side),
						color: materials.map((m) => m.color?.getHex()),
						vertexColors: materials.map((m) => m.vertexColors),
						world: child.matrixWorld.clone(),
					})
				})
				rendered.push({ objects, camera: camera.position.clone() })
			}),
			dispose: jest.fn(),
			forceContextLoss: jest.fn(),
		})),
	}
})

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

const canvas = () => ({ toBlob: (cb) => cb({ type: 'image/png' }) })

/**
 * Render a thumbnail of a model and return what the render saw.
 *
 * @param {THREE.Object3D} root - The model
 * @return {Promise<object>} The parts' materials and world matrices, and the camera
 */
async function capture(root) {
	await renderThumbnail(root, { canvas: canvas() })
	return rendered[rendered.length - 1]
}

const positions = (root) => root.children.map((child) => child.position.toArray())

/**
 * A model of three boxes in a scene, the first two sharing a material and the third
 * with two materials, one of them the shared one.
 *
 * @return {object} The scene, the model and its parts
 */
function model() {
	const shared = new THREE.MeshStandardMaterial()
	const other = new THREE.MeshPhongMaterial()
	const a = new THREE.Mesh(new THREE.BoxGeometry(), shared)
	const b = new THREE.Mesh(new THREE.BoxGeometry(), shared)
	b.position.x = 2
	const multi = new THREE.Mesh(new THREE.BoxGeometry(), [shared, other])
	multi.position.x = 4
	const root = new THREE.Group()
	root.add(a, b, multi)
	const scene = new THREE.Scene()
	scene.add(root)
	root.updateMatrixWorld(true)
	return { scene, root, a, b, multi, shared, other }
}

beforeEach(() => {
	rendered.length = 0
	mockState.fail = false
})

describe('Wireframe', () => {
	it('is off in the thumbnail, for shared and multi-material meshes alike', async () => {
		const { root, a, b, multi } = model()
		setViewerWireframe(root, true)

		await renderThumbnail(root, { canvas: canvas() })

		const { objects } = rendered[0]
		expect(objects.get(a).wireframe).toEqual([false])
		expect(objects.get(b).wireframe).toEqual([false])
		expect(objects.get(multi).wireframe).toEqual([false, false])
	})

	it('is still on in the viewer afterwards', async () => {
		const { scene, root, shared, other } = model()
		setViewerWireframe(root, true)

		await renderThumbnail(root, { canvas: canvas() })

		expect(shared.wireframe).toBe(true)
		expect(other.wireframe).toBe(true)
		expect(root.parent).toBe(scene)
	})

	it('is still on in the viewer when the render throws', async () => {
		const { root, shared } = model()
		setViewerWireframe(root, true)
		mockState.fail = true

		await expect(renderThumbnail(root, { canvas: canvas() })).rejects.toThrow('context lost')

		expect(shared.wireframe).toBe(true)
	})

	it('leaves a material the file made wireframe as a wireframe', async () => {
		const { root, a, b, shared, other } = model()
		other.wireframe = true // as the file has it
		setViewerWireframe(root, true)

		await renderThumbnail(root, { canvas: canvas() })

		expect(rendered[0].objects.get(a).wireframe).toEqual([false])
		const multi = root.children[2]
		expect(rendered[0].objects.get(multi).wireframe).toEqual([false, true])
		expect(b.material).toBe(shared)
	})
})

describe('the clipping plane', () => {
	/**
	 * Open the cut on a model, as the viewer does: the viewer's renderer clips, and the
	 * materials are made double-sided so the inside shows at the cut.
	 *
	 * @param {THREE.Scene} scene - The viewer's scene
	 * @return {object} The clipping composable, open
	 */
	function openCut(scene) {
		const clipping = useClippingPlane()
		clipping.init({}, scene)
		clipping.toggle()
		return clipping
	}

	it('leaves each material its own side in the thumbnail', async () => {
		const { scene, root, a, multi, other } = model()
		other.side = THREE.BackSide // as the file has it
		openCut(scene)
		expect(a.material.side).toBe(THREE.DoubleSide)

		await renderThumbnail(root, { canvas: canvas() })

		expect(rendered[0].objects.get(a).side).toEqual([THREE.FrontSide])
		expect(rendered[0].objects.get(multi).side).toEqual([THREE.FrontSide, THREE.BackSide])
	})

	it('keeps the viewer double-sided afterwards, and the cut still closes cleanly', async () => {
		const { scene, root, shared, other } = model()
		other.side = THREE.BackSide
		const clipping = openCut(scene)
		mockState.fail = true

		await expect(renderThumbnail(root, { canvas: canvas() })).rejects.toThrow('context lost')
		expect(shared.side).toBe(THREE.DoubleSide)
		await renderThumbnail(root, { canvas: canvas() })
		expect(other.side).toBe(THREE.DoubleSide)

		clipping.toggle()
		expect(shared.side).toBe(THREE.FrontSide)
		expect(other.side).toBe(THREE.BackSide)
	})
})

describe('the G-code colour setting', () => {
	const GCODE = ['G1 Z0.2 F600', 'G1 X0 Y0 E0', 'G1 X10 Y0 E1', 'G1 Z0.4', 'G1 X10 Y10 E2', 'G1 X0 Y10 E3'].join('\n')

	/**
	 * Load a toolpath the way the viewer does: in its own gradient.
	 *
	 * @return {Promise<THREE.Object3D>} The toolpath, in a scene
	 */
	async function toolpath() {
		const { object3D } = await new GCodeLoader().loadModel(new TextEncoder().encode(GCODE).buffer, { gcodeOptions: { colorMode: 'gradient' } })
		new THREE.Scene().add(object3D)
		return object3D
	}

	it('draws the toolpath\'s own gradient while the viewer shows one colour', async () => {
		const group = await toolpath()
		const [layer] = group.children
		expect(layer.geometry.attributes.color).toBeDefined()
		applyGcodeColorScheme(group, 'single', '#ff5722')
		expect(layer.material.vertexColors).toBe(false)

		await renderThumbnail(group, { canvas: canvas() })

		for (const child of group.children) {
			const seen = rendered[0].objects.get(child)
			expect(seen.vertexColors).toEqual([true])
			expect(seen.color).toEqual([0xffffff])
			// The viewer keeps its colour
			expect(child.material.vertexColors).toBe(false)
			expect(child.material.color.getHex()).toBe(0xff5722)
		}
	})

	it('gives the gradient back untinted when the viewer goes back to it', async () => {
		const group = await toolpath()
		applyGcodeColorScheme(group, 'single', '#00ff00')
		applyGcodeColorScheme(group, 'single', '#ff5722')
		applyGcodeColorScheme(group, 'gradient')
		for (const child of group.children) {
			expect(child.material.vertexColors).toBe(true)
			expect(child.material.color.getHex()).toBe(0xffffff)
		}
	})
})

describe('Exploded view', () => {
	it('draws the parts together, framed as a plain capture frames them', async () => {
		const plain = await capture(model().root)
		const { root, a, b, multi } = model()
		const exploded = useExplodedView()
		exploded.init(root)
		exploded.toggle()
		expect(a.position.length()).toBeGreaterThan(0)

		const seen = await capture(root)

		for (const [part, index] of [[a, 0], [b, 1], [multi, 2]]) {
			const together = [...plain.objects.values()][index].world
			expect(seen.objects.get(part).world.equals(together)).toBe(true)
		}
		expect(seen.camera.distanceTo(plain.camera)).toBeLessThan(1e-9)
	})

	it('leaves the viewer exploded afterwards, by the same amount', async () => {
		const { scene, root } = model()
		const exploded = useExplodedView()
		exploded.init(root)
		exploded.setFactor(0.8)
		const apart = positions(root)

		await capture(root)

		expect(positions(root)).toEqual(apart)
		expect(root.parent).toBe(scene)
		// and the slider carries on from there
		exploded.setFactor(0)
		expect(positions(root)).toEqual([[0, 0, 0], [2, 0, 0], [4, 0, 0]])
	})

	it('leaves the viewer exploded when the render throws', async () => {
		const { root } = model()
		const exploded = useExplodedView()
		exploded.init(root)
		exploded.toggle()
		const apart = positions(root)
		mockState.fail = true

		await expect(renderThumbnail(root, { canvas: canvas() })).rejects.toThrow('context lost')

		expect(positions(root)).toEqual(apart)
		// World matrices follow, so the viewer's next frame and its picking agree
		root.children.forEach((child) => {
			expect(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray()).toEqual(child.position.toArray())
		})
	})
})

describe('the transform gizmo', () => {
	/**
	 * Load a model the way the viewer does, with a transform of its own, and turn, move
	 * and stretch it with the gizmo.
	 *
	 * @param {object} parts - From `model()`
	 * @return {Promise<object>} The gizmo, attached
	 */
	async function moveWithGizmo({ root, scene }) {
		const gizmo = useTransformGizmo()
		await gizmo.init(scene, new THREE.PerspectiveCamera(), { domElement: document.createElement('canvas') }, null)
		gizmo.rememberTransform(root)
		gizmo.toggle(root)
		root.position.set(3, -2, 7)
		root.rotation.set(0.3, 1.1, -0.4)
		root.scale.set(2, 0.5, 3)
		root.updateMatrixWorld(true)
		return gizmo
	}

	/**
	 * A model with a loader's own turn on its root, as a 3MF has.
	 *
	 * @return {object} From `model()`
	 */
	function turnedModel() {
		const parts = model()
		parts.root.rotation.x = -Math.PI / 2
		parts.root.position.set(1, 0, -1) // the viewer's centring
		parts.root.updateMatrixWorld(true)
		return parts
	}

	it('draws the model at its loaded transform, framed as a plain capture frames it', async () => {
		const plain = await capture(turnedModel().root)
		const parts = turnedModel()
		await moveWithGizmo(parts)

		const seen = await capture(parts.root)

		;[parts.a, parts.b, parts.multi].forEach((part, index) => {
			const loaded = [...plain.objects.values()][index].world
			expect(seen.objects.get(part).world.equals(loaded)).toBe(true)
		})
		expect(seen.camera.distanceTo(plain.camera)).toBeLessThan(1e-9)
	})

	it('leaves the model where the gizmo put it, also when the render throws, and Reset still works', async () => {
		const parts = turnedModel()
		const gizmo = await moveWithGizmo(parts)
		const { root } = parts
		const moved = root.matrix.clone()

		await capture(root)
		expect(root.matrix.equals(moved)).toBe(true)
		mockState.fail = true
		await expect(renderThumbnail(root, { canvas: canvas() })).rejects.toThrow('context lost')
		expect(root.matrix.equals(moved)).toBe(true)
		expect(root.parent).toBe(parts.scene)

		gizmo.resetTransform()
		expect(root.rotation.x).toBeCloseTo(-Math.PI / 2, 9)
		expect(root.position.toArray()).toEqual([1, 0, -1])
	})
})
