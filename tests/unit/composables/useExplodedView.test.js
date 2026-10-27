/**
 * Exploded view keeps its state from one model to the next, as the panel shows it: a
 * view left exploded explodes the next model by the same amount, and a model with
 * nothing to take apart turns the tool off.
 */
import * as THREE from 'three'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

function parts(count) {
	const root = new THREE.Group()
	for (let i = 0; i < count; i++) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
		mesh.position.x = i * 2
		root.add(mesh)
	}
	root.updateMatrixWorld(true)
	return root
}

const xs = (root) => root.children.map((child) => child.position.x)

describe('useExplodedView', () => {
	it('explodes the next model by the amount the view was left at', () => {
		const exploded = useExplodedView()
		exploded.init(parts(3))
		exploded.toggle()
		exploded.setFactor(0.7)

		const next = parts(2)
		exploded.init(next)

		expect(exploded.isActive.value).toBe(true)
		expect(exploded.factor.value).toBe(0.7)
		expect(xs(next)).not.toEqual([0, 2])
		exploded.toggle()
		expect(xs(next)).toEqual([0, 2])
	})

	it('leaves the next model together when the view was not exploded', () => {
		const exploded = useExplodedView()
		exploded.init(parts(3))
		const next = parts(2)
		exploded.init(next)
		expect(exploded.isActive.value).toBe(false)
		expect(xs(next)).toEqual([0, 2])
	})

	it('turns off for a model with nothing to take apart', () => {
		const exploded = useExplodedView()
		exploded.init(parts(3))
		exploded.toggle()
		exploded.init(parts(1))
		expect(exploded.isActive.value).toBe(false)
		expect(exploded.factor.value).toBe(0)
		expect(exploded.hasMeshes.value).toBe(false)
	})
})
