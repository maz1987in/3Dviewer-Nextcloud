/**
 * A thumbnail made while Print check is open shows the model, not Print check's colours or
 * build box: they are objects in the viewer's scene beside the model, and the thumbnail
 * draws the model in a scene of its own.
 */
import * as THREE from 'three'
import { renderThumbnail } from '../../../src/thumbnails/renderThumbnail.js'
import { createOverlaySet } from '../../../src/printCheck/surfaceOverlay.js'
import { createOverhangMaterial } from '../../../src/printCheck/overhang.js'

const rendered = []

jest.mock('three', () => {
	const actual = jest.requireActual('three')
	return {
		...actual,
		WebGLRenderer: jest.fn().mockImplementation(() => ({
			setClearColor: jest.fn(),
			setPixelRatio: jest.fn(),
			setSize: jest.fn(),
			// Everything in the scene at the moment of the render
			render: jest.fn((scene) => {
				const seen = []
				scene.traverse((child) => seen.push(child))
				rendered.push(seen)
			}),
			dispose: jest.fn(),
			forceContextLoss: jest.fn(),
		})),
	}
})

const canvas = () => ({ toBlob: (cb) => cb({ type: 'image/png' }) })

test('a thumbnail made with overhang shading and the build box showing contains neither', async () => {
	const scene = new THREE.Scene()
	const root = new THREE.Group()
	root.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial()))
	scene.add(root)
	const shading = createOverlaySet(scene, root, () => createOverhangMaterial({ up: new THREE.Vector3(0, 1, 0), thresholdDeg: 45, bedHeight: 0, bedEpsilon: 0.05 }))
	const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(250, 210, 220)), new THREE.LineBasicMaterial())
	box.userData.viewerOverlay = true
	scene.add(box)

	await renderThumbnail(root, { canvas: canvas() })

	const [seen] = rendered
	expect(seen.length).toBeGreaterThan(0)
	expect(seen.some((object) => object.userData?.viewerOverlay)).toBe(false)
	// And the viewer still has them, beside its model
	expect(scene.children).toContain(box)
	expect(shading.overlays.every(({ object }) => object.parent === scene)).toBe(true)
})
