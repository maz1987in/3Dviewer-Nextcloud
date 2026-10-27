/**
 * The registry of objects viewer tools move. It keeps each object's own transform from
 * before the first move, and withOwnTransforms puts it back for one call only.
 */
import * as THREE from 'three'
import { MOVED_BY, ownTransformOf, rememberOwnTransform, withOwnTransforms, withPartsTogether } from '../../../src/utils/viewerTransforms.js'

describe('rememberOwnTransform', () => {
	it('keeps the first transform, not one taken after a tool moved the object', () => {
		const object = new THREE.Object3D()
		object.position.set(1, 2, 3)
		rememberOwnTransform(object, MOVED_BY.exploded)
		object.position.set(9, 9, 9)
		rememberOwnTransform(object, MOVED_BY.animation)
		expect(ownTransformOf(object).position.toArray()).toEqual([1, 2, 3])
	})

	it('knows nothing of an object no tool moved', () => {
		expect(ownTransformOf(new THREE.Object3D())).toBeNull()
	})
})

describe('withOwnTransforms', () => {
	function moved() {
		const root = new THREE.Group()
		const part = new THREE.Mesh(new THREE.BoxGeometry())
		part.morphTargetInfluences = [0.25]
		root.add(part)
		rememberOwnTransform(root, MOVED_BY.gizmo)
		rememberOwnTransform(part, MOVED_BY.exploded)
		root.rotation.set(0, 1, 0)
		root.scale.set(2, 2, 2)
		part.position.set(5, 0, 0)
		part.morphTargetInfluences[0] = 1
		root.updateMatrixWorld(true)
		return { root, part }
	}

	it('puts every recorded object back for the call, matrices and morph weights included', () => {
		const { root, part } = moved()
		const seen = withOwnTransforms(root, () => ({
			rootRotation: root.rotation.y,
			partPosition: part.position.toArray(),
			partWorld: new THREE.Vector3().setFromMatrixPosition(part.matrixWorld).toArray(),
			weight: part.morphTargetInfluences[0],
		}))
		expect(seen).toEqual({ rootRotation: 0, partPosition: [0, 0, 0], partWorld: [0, 0, 0], weight: 0.25 })
		expect(root.rotation.y).toBeCloseTo(1, 9)
		expect(part.position.toArray()).toEqual([5, 0, 0])
		expect(part.morphTargetInfluences[0]).toBe(1)
	})

	it('can undo only what some tools moved', () => {
		const { root, part } = moved()
		const seen = withOwnTransforms(root, () => [root.scale.x, part.position.x], { movedBy: [MOVED_BY.exploded] })
		expect(seen).toEqual([2, 0])
		expect(withPartsTogether(root, () => [root.scale.x, part.position.x])).toEqual([2, 0])
	})

	it('undoes an object any of the named tools recorded', () => {
		const { root, part } = moved()
		rememberOwnTransform(part, MOVED_BY.animation)
		expect(withOwnTransforms(root, () => part.position.x, { movedBy: [MOVED_BY.animation] })).toBe(0)
		expect(withOwnTransforms(root, () => part.position.x, { movedBy: [MOVED_BY.gizmo] })).toBe(5)
	})

	it('gives the viewer\'s transforms back when the call throws', () => {
		const { root, part } = moved()
		expect(() => withOwnTransforms(root, () => { throw new Error('boom') })).toThrow('boom')
		expect(part.position.toArray()).toEqual([5, 0, 0])
		expect(new THREE.Vector3().setFromMatrixPosition(part.matrixWorld).x).toBeCloseTo(5 * 2 * Math.cos(1), 9)
	})
})
