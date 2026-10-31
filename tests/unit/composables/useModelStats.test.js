/**
 * What the statistics panel says about a scan: its points, the share of them shown, and
 * which attributes the file has; never triangles it doesn't have.
 */
import * as THREE from 'three'
import { useModelStats } from '../../../src/composables/useModelStats.js'

function scan({ count = 3, total = count, attributes = { color: true, intensity: false, classification: true } } = {}) {
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(count * 3).fill(0).map((_, i) => i), 3))
	const points = new THREE.Points(geometry, new THREE.PointsMaterial())
	points.userData.tdvPointCloud = { format: 'xyz', count, total, attributes }
	return points
}

test('a scan reports its points and attributes, and no triangles', () => {
	const stats = useModelStats().analyzeModel(scan({ count: 3, total: 12 }), 'site.xyz', 100)

	expect(stats.isPointCloud).toBe(true)
	expect(stats.pointCount).toBe(3)
	expect(stats.pointTotal).toBe(12)
	expect(stats.pointAttributes).toEqual(['color', 'classification'])
	expect(stats.faces).toBe(0)
	expect(stats.meshes).toBe(0)
	expect(stats.boundingBox.x).toBeGreaterThan(0)
})

test('a mesh is not a scan', () => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())

	const stats = useModelStats().analyzeModel(mesh, 'box.stl', 100)

	expect(stats.isPointCloud).toBe(false)
	expect(stats.pointCount).toBe(0)
	expect(stats.faces).toBe(12)
})

test('a splat reports its splats and its extent, and not the box that measures it', () => {
	const root = new THREE.Group()
	const proxy = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.5), new THREE.MeshBasicMaterial({ visible: false }))
	proxy.userData.tdvBoundsProxy = true
	root.add(new THREE.Object3D(), proxy)
	root.userData.tdvSplat = { format: 'spz', count: 1000, total: 4000, unit: 'm', defaultUp: '+y', up: '+y' }

	const stats = useModelStats().analyzeModel(root, 'room.spz', 100)

	expect(stats.isSplat).toBe(true)
	expect(stats.splatCount).toBe(1000)
	expect(stats.splatTotal).toBe(4000)
	expect(stats.isPointCloud).toBe(false)
	expect(stats.vertices).toBe(0)
	expect(stats.faces).toBe(0)
	expect(stats.meshes).toBe(0)
	expect(stats.materialCount).toBe(0)
	expect(stats.boundingBox.x).toBeCloseTo(2)
	expect(stats.boundingBox.y).toBeCloseTo(1)
})
