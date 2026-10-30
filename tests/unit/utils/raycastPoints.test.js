/**
 * Picking on a scan: a click lands on one of its points, exactly, as measurement and
 * annotations need; picking on a mesh is unchanged.
 */
import * as THREE from 'three'
import { raycastIntersection } from '../../../src/utils/modelScaleUtils.js'

/** A click in the middle of a 100 × 100 canvas. */
const click = { clientX: 50, clientY: 50, target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } }

function camera() {
	const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
	cam.position.set(0, 0, 10)
	cam.lookAt(0, 0, 0)
	cam.updateMatrixWorld(true)
	return cam
}

function sceneWith(object) {
	const scene = new THREE.Scene()
	scene.add(object)
	scene.updateMatrixWorld(true)
	return scene
}

function points(coords) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(coords.flat(), 3))
	geometry.computeBoundingBox()
	geometry.computeBoundingSphere()
	return new THREE.Points(geometry, new THREE.PointsMaterial())
}

const filter = (child) => (child.isMesh || child.isPoints) && child.visible

test('a click near a point lands on that point exactly, not on the ray', () => {
	const cloud = points([[0.01, 0.02, 0], [5, 5, 0], [0, 0, -3]])

	const hit = raycastIntersection(click, camera(), sceneWith(cloud), { filterMesh: filter, useCache: false })

	expect(hit.toArray().map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0.01, 0.02, 0])
})

test('the point is in world space, wherever the cloud was moved', () => {
	const cloud = points([[0.01, 0.02, 0], [5, 5, 0]])
	cloud.position.set(0, 0, 2)

	const hit = raycastIntersection(click, camera(), sceneWith(cloud), { filterMesh: filter, useCache: false })

	expect(hit.z).toBeCloseTo(2)
})

test('a click a few pixels off a point still lands on it, at any scan size', () => {
	// A click 4 px right of centre on a 100 px canvas; the point sits on the centre line
	const near = { ...click, clientX: 54 }
	for (const scale of [0.01, 1, 1000]) {
		const cloud = points([[0, 0, 0], [5 * scale, 5 * scale, 0]])
		const cam = camera()
		cam.position.set(0, 0, 10 * scale)
		cam.far = 100000
		cam.updateProjectionMatrix()
		cam.updateMatrixWorld(true)

		const hit = raycastIntersection(near, cam, sceneWith(cloud), { filterMesh: filter, useCache: false, maxDistance: 100000 })

		expect(hit?.toArray()).toEqual([0, 0, 0])
	}
})

test('a click far from every point finds nothing', () => {
	const cloud = points([[4, 4, 0], [5, 5, 0]])

	expect(raycastIntersection(click, camera(), sceneWith(cloud), { filterMesh: filter, useCache: false })).toBeNull()
})

test('a mesh is still picked where the ray meets its surface', () => {
	const box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())

	const hit = raycastIntersection(click, camera(), sceneWith(box), { filterMesh: filter, useCache: false })

	expect(hit.z).toBeCloseTo(1)
})
