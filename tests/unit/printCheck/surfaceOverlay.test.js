/**
 * Print check draws on top of a model with overlay meshes in the scene, never under the
 * model: exports read the model, thumbnails render the model in a scene of their own, and
 * render modes swap the model's materials, so none of them can see an overlay.
 */
import * as THREE from 'three'
import { createSurfaceOverlay, createOverlaySet } from '../../../src/printCheck/surfaceOverlay.js'

function model() {
	const root = new THREE.Group()
	const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
	const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial())
	b.position.x = 3
	const points = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)))
	root.add(a, b, points)
	const scene = new THREE.Scene()
	scene.add(root)
	return { scene, root, a, b }
}

test('overlay is not under the model root, follows its matrixWorld and leaves the source geometry usable after dispose', () => {
	const { scene, root, a } = model()
	const material = new THREE.MeshBasicMaterial()
	const overlay = createSurfaceOverlay(scene, a, material)

	expect(overlay.object.parent).toBe(scene)
	let underRoot = false
	root.traverse((child) => { if (child === overlay.object) underRoot = true })
	expect(underRoot).toBe(false)
	expect(overlay.object.userData.viewerOverlay).toBe(true)
	expect(overlay.object.geometry.attributes.position).toBe(a.geometry.attributes.position)
	expect(overlay.object.geometry.index).toBe(a.geometry.index)

	root.position.set(5, 6, 7)
	root.rotation.y = 1
	root.updateMatrixWorld(true)
	overlay.sync()
	expect(overlay.object.matrixWorld.equals(a.matrixWorld)).toBe(true)

	overlay.dispose()
	expect(overlay.object.parent).toBeNull()
	expect(a.geometry.attributes.position.array.length).toBeGreaterThan(0)
	expect(scene.children).toEqual([root])
})

test('extra attributes go on the overlay, not on the model', () => {
	const { scene, a } = model()
	const thickness = new THREE.Float32BufferAttribute(new Float32Array(a.geometry.attributes.position.count), 1)
	const overlay = createSurfaceOverlay(scene, a, new THREE.MeshBasicMaterial(), { thickness })
	expect(overlay.object.geometry.attributes.thickness).toBe(thickness)
	expect(a.geometry.attributes.thickness).toBeUndefined()
})

test('the overlay is hidden while its mesh is', () => {
	const { scene, root, a } = model()
	const overlay = createSurfaceOverlay(scene, a, new THREE.MeshBasicMaterial())
	root.visible = false
	overlay.sync()
	expect(overlay.object.visible).toBe(false)
	root.visible = true
	overlay.sync()
	expect(overlay.object.visible).toBe(true)
})

test('a set covers every mesh under the model and skips points and lines', () => {
	const { scene, root } = model()
	const makeMaterial = jest.fn(() => new THREE.MeshBasicMaterial())
	const set = createOverlaySet(scene, root, makeMaterial)
	expect(set.overlays).toHaveLength(2)
	expect(makeMaterial).toHaveBeenCalledTimes(2)
	set.dispose()
	expect(scene.children).toEqual([root])
})

test('overlay copies the source\'s clipping planes', () => {
	const { scene, a } = model()
	const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
	a.material.clippingPlanes = [plane]
	const material = new THREE.MeshBasicMaterial()
	createSurfaceOverlay(scene, a, material)
	expect(material.clippingPlanes).toEqual([plane])
})

test('dispose lets go of the model\'s buffers and frees only its own', () => {
	const { scene, a } = model()
	const thickness = new THREE.Float32BufferAttribute(new Float32Array(a.geometry.attributes.position.count), 1)
	const overlay = createSurfaceOverlay(scene, a, new THREE.MeshBasicMaterial(), { thickness })
	// The renderer frees the GPU buffer of every attribute still on a geometry when it is disposed
	let atDispose = null
	overlay.object.geometry.addEventListener('dispose', ({ target }) => {
		atDispose = { attributes: Object.values(target.attributes), index: target.index }
	})
	overlay.dispose()
	const shared = [a.geometry.attributes.position, a.geometry.attributes.normal]
	expect(atDispose.attributes.some((attribute) => shared.includes(attribute))).toBe(false)
	expect(atDispose.index).toBeNull()
	expect(atDispose.attributes).toContain(thickness)
})
