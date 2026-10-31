/**
 * @jest-environment node
 */
/**
 * A splat's memory is Spark's, not a geometry's: the viewers free it when the splat goes.
 */
import * as THREE from 'three'
import { disposeSplat } from '../../../src/splats/disposeSplat.js'

/** Spark's SplatMesh, as far as freeing it goes: an Object3D with no geometry. */
class SplatMesh extends THREE.Object3D {

	constructor() {
		super()
		this.packedSplats = { numSplats: 10 }
		this.disposed = 0
	}

	dispose() {
		this.disposed++
		this.packedSplats = undefined
	}

}

const splatRoot = () => {
	const root = new THREE.Group()
	root.userData.tdvSplat = { count: 10 }
	const mesh = new SplatMesh()
	const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
	box.userData.tdvBoundsProxy = true
	root.add(mesh, box)
	return { root, mesh, box }
}

test('frees the splats and the bounds box', () => {
	const { root, mesh, box } = splatRoot()
	const geometry = jest.spyOn(box.geometry, 'dispose')
	const material = jest.spyOn(box.material, 'dispose')

	disposeSplat(root)

	expect(mesh.disposed).toBe(1)
	expect(mesh.packedSplats).toBeUndefined()
	expect(geometry).toHaveBeenCalled()
	expect(material).toHaveBeenCalled()
})

test('leaves anything that is not a splat alone, and takes nothing', () => {
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
	const geometry = jest.spyOn(mesh.geometry, 'dispose')

	disposeSplat(mesh)
	disposeSplat(null)

	expect(geometry).not.toHaveBeenCalled()
})
