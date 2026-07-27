/**
 * The Split console redesign replaces eight aria-hidden arrows with a live wedge that
 * paints the vector you are actually sending. That only works if direction and strength
 * are computed the same way the camera consumes them, so the maths comes out of the
 * component and into here where it can be pinned down.
 *
 * The contract is carried over unchanged from the previous controller: a 15% dead zone
 * around the centre (where the cube sits), strength ramping linearly from there to the
 * rim, and 110%-of-radius hit slop so a click on the very edge still counts.
 */

import { dotOffset, readoutValues, steerFromPointer } from '../../../src/utils/controllerSteering.js'

/** A 150px gizmo at the origin — centre is (75, 75), radius 75. */
const RING = { left: 0, top: 0, width: 150, height: 150 }
const CENTRE = 75

/** Pointer at a given fraction of the radius, in a given direction. */
const at = (fractionOfRadius, dirX, dirY) => ({
	pointerX: CENTRE + dirX * fractionOfRadius * CENTRE,
	pointerY: CENTRE + dirY * fractionOfRadius * CENTRE,
	rect: RING,
})

describe('steerFromPointer', () => {
	it('reports no strength at the dead centre', () => {
		const s = steerFromPointer(at(0, 0, 0))

		expect(s.strength).toBe(0)
		expect(s.inRange).toBe(true)
	})

	it('stays at zero strength inside the dead zone', () => {
		// The cube lives here; nudging it must not steer the camera.
		expect(steerFromPointer(at(0.1, 1, 0)).strength).toBe(0)
		expect(steerFromPointer(at(0.149, 0, 1)).strength).toBe(0)
	})

	it('reaches full strength at the rim', () => {
		expect(steerFromPointer(at(1, 1, 0)).strength).toBeCloseTo(1, 5)
	})

	it('ramps linearly between the dead zone and the rim', () => {
		// Halfway along the live band (0.15 -> 1.0) is 0.575 of the radius.
		expect(steerFromPointer(at(0.575, 1, 0)).strength).toBeCloseTo(0.5, 3)
	})

	it('accepts a click just past the rim, but not far past', () => {
		// Slop exists so an edge click is not silently swallowed.
		expect(steerFromPointer(at(1.09, 1, 0)).inRange).toBe(true)
		expect(steerFromPointer(at(1.2, 1, 0)).inRange).toBe(false)
	})

	it('clamps strength to 1 inside the slop band', () => {
		expect(steerFromPointer(at(1.09, 1, 0)).strength).toBe(1)
	})

	it('measures the angle clockwise from straight up', () => {
		// Screen coordinates: y grows downward.
		expect(steerFromPointer(at(1, 0, -1)).angle).toBeCloseTo(0, 5) // up
		expect(steerFromPointer(at(1, 1, 0)).angle).toBeCloseTo(90, 5) // right
		expect(steerFromPointer(at(1, 0, 1)).angle).toBeCloseTo(180, 5) // down
		expect(steerFromPointer(at(1, -1, 0)).angle).toBeCloseTo(270, 5) // left
	})

	it('can return a negative angle in the upper-left quadrant', () => {
		// atan2 wraps there, which is why the readout normalises before displaying.
		expect(steerFromPointer(at(1, -1, -1)).angle).toBeCloseTo(-45, 5)
	})
})

describe('dotOffset', () => {
	it('parks the dot at the dead-zone edge when there is no strength', () => {
		const d = dotOffset({ angle: 0, strength: 0, diameter: 150 })

		expect(d.y).toBeCloseTo(-75 * 0.15, 3)
		expect(d.x).toBeCloseTo(0, 5)
	})

	it('pushes the dot to the rim at full strength', () => {
		const d = dotOffset({ angle: 0, strength: 1, diameter: 150 })

		expect(d.y).toBeCloseTo(-75, 3)
	})

	it('follows the steering angle', () => {
		const right = dotOffset({ angle: 90, strength: 1, diameter: 150 })

		expect(right.x).toBeCloseTo(75, 3)
		expect(right.y).toBeCloseTo(0, 5)
	})

	it('grows with strength so the dot reads as a magnitude', () => {
		const weak = dotOffset({ angle: 0, strength: 0, diameter: 150 })
		const strong = dotOffset({ angle: 0, strength: 1, diameter: 150 })

		expect(strong.scale).toBeGreaterThan(weak.scale)
	})
})

describe('readoutValues', () => {
	it('reports the direction as a compass bearing', () => {
		expect(readoutValues({ angle: 132.4, strength: 0.47 }).degrees).toBe(132)
	})

	it('normalises a negative angle into 0-359', () => {
		// atan2 gives -90 for "left"; a readout saying -90° is not a bearing.
		expect(readoutValues({ angle: -90, strength: 0.5 }).degrees).toBe(270)
	})

	it('reports strength as a whole percentage', () => {
		expect(readoutValues({ angle: 0, strength: 0.474 }).strengthPercent).toBe(47)
	})

	it('says it is not steering when the ring is idle', () => {
		expect(readoutValues({ angle: 0, strength: 0 }).steering).toBe(false)
		expect(readoutValues({ angle: 0, strength: 0.4 }).steering).toBe(true)
	})
})
