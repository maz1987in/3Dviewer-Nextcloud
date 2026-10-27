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

const canvas = () => ({ toBlob: (cb) => cb({ type: 'image/png' }) })

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
