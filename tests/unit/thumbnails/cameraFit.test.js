import * as THREE from 'three'
import { computeCameraFit } from '../../../src/thumbnails/cameraFit.js'

describe('computeCameraFit', () => {
	it('frames a unit cube at the origin with the viewer maths', () => {
		const box = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
		const d = 1 / Math.sin(37.5 * Math.PI / 180) * 0.75

		const fit = computeCameraFit(box, 75)

		expect(fit.target).toEqual([0, 0, 0])
		expect(fit.position[0]).toBeCloseTo(0.5 * d, 6)
		expect(fit.position[1]).toBeCloseTo(0.5 * d, 6)
		expect(fit.position[2]).toBeCloseTo(d, 6)
	})

	it('targets the centre of an off-origin box', () => {
		const box = new THREE.Box3(new THREE.Vector3(1, 1, 1), new THREE.Vector3(3, 3, 3))

		const fit = computeCameraFit(box, 75)

		expect(fit.target).toEqual([2, 2, 2])
		const d = 2 / Math.sin(37.5 * Math.PI / 180) * 0.75
		expect(fit.position[2]).toBeCloseTo(2 + d, 6)
	})

	it('uses the largest dimension and the given field of view', () => {
		const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 4, 2))
		const d = 4 / Math.sin(30 * Math.PI / 180) * 0.75

		const fit = computeCameraFit(box, 60)

		expect(fit.position[2]).toBeCloseTo(1 + d, 6)
	})

	it('returns null for an empty box', () => {
		expect(computeCameraFit(new THREE.Box3(), 75)).toBeNull()
	})

	it('returns null for non-finite results', () => {
		const infinite = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(Infinity, 1, 1))
		expect(computeCameraFit(infinite, 75)).toBeNull()

		const unit = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
		expect(computeCameraFit(unit, NaN)).toBeNull()
	})
})
