/**
 * Exploded view keeps its state from one model to the next, as the panel shows it: a
 * view left exploded explodes the next model by the same amount, and a model with
 * nothing to take apart turns the tool off.
 */
import * as THREE from 'three'
import { useExplodedView } from '../../../src/composables/useExplodedView.js'
import { useModelStats } from '../../../src/composables/useModelStats.js'

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

describe('the model statistics of a model opened in Exploded view', () => {
	it('measure the parts together, as for a model opened without it', () => {
		const plain = useModelStats().analyzeModel(parts(3), 'parts.obj', 0)

		const exploded = useExplodedView()
		exploded.init(parts(3))
		exploded.toggle()
		const next = parts(3)
		exploded.init(next) // opens exploded
		expect(xs(next)).not.toEqual([0, 2, 4])
		const apart = xs(next)

		const stats = useModelStats().analyzeModel(next, 'parts.obj', 0)

		expect(stats.boundingBox).toEqual(plain.boundingBox)
		expect(stats.center).toEqual(plain.center)
		// and the view stays exploded
		expect(xs(next)).toEqual(apart)
	})
})
