import * as THREE from 'three'
import { sceneToModel, modelToScene, pointToScene, toPlain } from '../../../src/utils/noteSpace.js'

function placedRoot() {
	// The same kind of placement the viewer applies on load: moved so the model sits
	// centred on the grid, plus a scale, so a missing inverse would show.
	const root = new THREE.Group()
	root.position.set(-4, 1.5, 2)
	root.scale.set(2, 2, 2)
	return root
}

test('a point survives scene → model → scene', () => {
	const root = placedRoot()
	const scene = new THREE.Vector3(3, -2, 7)

	const back = modelToScene(sceneToModel(scene, root), root)

	expect(back.x).toBeCloseTo(3)
	expect(back.y).toBeCloseTo(-2)
	expect(back.z).toBeCloseTo(7)
})

test('model space is independent of where the model was placed', () => {
	const root = placedRoot()
	const local = sceneToModel(new THREE.Vector3(-4, 1.5, 2), root)

	expect(local).toEqual({ x: 0, y: 0, z: 0 })
})

test('scene-space points and a missing root pass through unchanged', () => {
	const p = { x: 1, y: 2, z: 3 }

	expect(toPlain(pointToScene(p, 'scene', placedRoot()))).toEqual(p)
	expect(toPlain(pointToScene(p, 'model', null))).toEqual(p)
})
