/**
 * @jest-environment node
 *
 * USDZ writes each object's `matrix`, read as the export starts. The viewer starts it
 * right after putting the exploded parts together, with only microtasks in between, so
 * no frame of the viewer refreshes the matrices first: suspending the explosion must
 * bring them up to date itself. (The node environment, because fflate cannot read a
 * jsdom Uint8Array as file contents.)
 */
import * as THREE from 'three'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { strFromU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

function model() {
	const root = new THREE.Group()
	for (let i = 0; i < 3; i++) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())
		mesh.position.x = i * 2
		root.add(mesh)
	}
	new THREE.Scene().add(root)
	root.updateMatrixWorld(true)
	return root
}

// The transform of every object the USD layer writes, in order (names carry ids, which
// differ from one model to the next)
async function usda(root) {
	const files = unzipSync(await new USDZExporter().parseAsync(root))
	return strFromU8(files['model.usda']).match(/matrix4d xformOp:transform = .*/g)
}

it('writes the parts together, and the matrices follow them back out', async () => {
	const together = await usda(model())
	const root = model()
	const view = useExplodedView()
	view.init(root)
	view.toggle()
	view.setFactor(1)
	// A frame of the viewer has drawn the parts apart
	root.updateMatrixWorld(true)
	expect(await usda(root)).not.toEqual(together)

	const token = view.suspend()
	const written = await usda(root)
	view.resume(token)

	expect(written).toEqual(together)
	root.children.forEach((child) => {
		expect(child.matrix.elements[12]).toBeCloseTo(child.position.x, 9)
	})
})
