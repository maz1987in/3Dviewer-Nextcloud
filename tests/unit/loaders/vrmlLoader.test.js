/**
 * The VRML loader hands back the scene three's VRMLLoader.parse() returns. parse() is
 * synchronous and takes no callback; the loader used to wait for one, so every load ran
 * into its own 30 s timeout and failed.
 */
import VrmlLoader from '../../../src/loaders/types/vrml.js'

const TRIANGLE = `#VRML V2.0 utf8
Shape {
  appearance Appearance { material Material { diffuseColor 0.8 0.4 0.2 } }
  geometry IndexedFaceSet { solid FALSE coord Coordinate { point [ 0 0 0, 1 0 0, 0 1 0 ] } coordIndex [ 0, 1, 2, -1 ] }
}
`

function buffer(text) {
	return new TextEncoder().encode(text).buffer
}

describe('VRML loader', () => {
	it('resolves with the parsed scene, without waiting for a callback', async () => {
		const result = await new VrmlLoader().loadModel(buffer(TRIANGLE), {})

		expect(result.object3D.isObject3D).toBe(true)
		const meshes = []
		result.object3D.traverse((child) => {
			if (child.isMesh) {
				meshes.push(child)
			}
		})
		expect(meshes).toHaveLength(1)
		expect(meshes[0].geometry.getAttribute('position').count).toBe(3)
		expect(result.isEmpty).toBe(false)
	}, 5000)

	it('rejects a file whose syntax cannot be repaired', async () => {
		await expect(new VrmlLoader().loadModel(buffer('#VRML V2.0 utf8\nShape { geometry Box { size'), {}))
			.rejects.toThrow(/VRML/)
	}, 5000)
})
