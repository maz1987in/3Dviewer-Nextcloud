/**
 * Where a splat is: the box the camera frames and the statistics measure, from a sample of
 * its centres, without the few strays a capture leaves far from its subject.
 */
import * as THREE from 'three'
import { evenIndices, splatBounds } from '../../../src/splats/splatBounds.js'

/** Packed splats as Spark gives them, enough for splatBounds. */
const packed = (centres) => ({
	numSplats: centres.length,
	getSplat: (i) => ({ center: new THREE.Vector3(...centres[i]) }),
})

test('evenly spaced indices', () => {
	expect(Array.from(evenIndices(10, 4))).toEqual([0, 2, 5, 7])
	expect(Array.from(evenIndices(3, 10))).toEqual([0, 1, 2])
	expect(evenIndices(5, 2)).toBeInstanceOf(Uint32Array)
})

test('ignores the outer 0.5 % on each axis', () => {
	const centres = []
	for (let i = 0; i < 10_000; i++) {
		centres.push([(i % 100) / 99, Math.floor(i / 100) / 99, ((i * 7) % 100) / 99])
	}
	for (let i = 0; i < 10; i++) {
		centres.push([1000, 0.5, 0.5])
	}

	const box = splatBounds(packed(centres))

	expect(box.max.x).toBeLessThan(2)
	expect(box.min.x).toBeCloseTo(0, 1)
	expect(box.max.y).toBeCloseTo(1, 1)
})

test('a single splat is a box of no size at its centre', () => {
	const box = splatBounds(packed([[1, 2, 3]]))

	expect(box.min.toArray()).toEqual([1, 2, 3])
	expect(box.max.toArray()).toEqual([1, 2, 3])
})

test('the grid the fixtures hold keeps its full size', () => {
	const centres = []
	for (let i = 0; i < 10; i++) {
		for (let j = 0; j < 10; j++) {
			for (let k = 0; k < 10; k++) {
				centres.push([-1 + 2 * i / 9, j / 9, -0.25 + 0.5 * k / 9])
			}
		}
	}

	const box = splatBounds(packed(centres))

	expect(box.min.toArray()).toEqual([-1, 0, -0.25])
	expect(box.max.x).toBeCloseTo(1, 6)
	expect(box.max.y).toBeCloseTo(1, 6)
	expect(box.max.z).toBeCloseTo(0.25, 6)
})
