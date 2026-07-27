/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Steering maths for the circular navigation controller's ring.
 *
 * The ring is one continuous control rather than a set of buttons: direction comes from
 * the angle between the ring's centre and your pointer, and speed from how far out you
 * are. Keeping that here rather than in the component means the live wedge, the position
 * dot and the camera all read the same numbers.
 */

/** Inside this fraction of the radius nothing steers — it is where the cube sits. */
const DEAD_ZONE = 0.15

/** A click this far past the rim still counts, so edge clicks are not swallowed. */
const HIT_SLOP = 1.1

/**
 * Direction and magnitude for a pointer over the ring.
 *
 * @param {object} args - pointer and geometry
 * @param {number} args.pointerX - pointer clientX
 * @param {number} args.pointerY - pointer clientY
 * @param {{left: number, top: number, width: number, height: number}} args.rect
 *   bounding rect of the ring element
 * @return {{angle: number, strength: number, inRange: boolean}}
 *   angle in degrees clockwise from straight up, strength 0–1, and whether the pointer
 *   is close enough to the ring to count at all
 */
export function steerFromPointer({ pointerX, pointerY, rect }) {
	const radius = rect.width / 2
	const dx = pointerX - (rect.left + rect.width / 2)
	const dy = pointerY - (rect.top + rect.height / 2)
	const distance = Math.hypot(dx, dy) / radius

	return {
		// Screen y grows downward, so atan2 gives a clockwise angle once rotated a
		// quarter turn to put 0° at the top.
		angle: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
		strength: Math.max(0, Math.min(1, (distance - DEAD_ZONE) / (1 - DEAD_ZONE))),
		inRange: distance <= HIT_SLOP,
	}
}

/**
 * Where to draw the dot that tracks the pointer around the ring.
 *
 * It sits at the dead-zone edge when idle and travels to the rim at full strength, so
 * its distance from centre reads as the speed being applied.
 *
 * @param {object} args - steering state and ring size
 * @param {number} args.angle - degrees clockwise from up
 * @param {number} args.strength - 0–1
 * @param {number} args.diameter - ring diameter in px
 * @return {{x: number, y: number, scale: number}} offset from centre, and a scale factor
 */
export function dotOffset({ angle, strength, diameter }) {
	const radians = ((angle - 90) * Math.PI) / 180
	const reach = (diameter / 2) * (DEAD_ZONE + strength * (1 - DEAD_ZONE))

	return {
		x: Math.cos(radians) * reach,
		y: Math.sin(radians) * reach,
		scale: 0.7 + strength * 0.7,
	}
}

/**
 * Start angle for the conic-gradient that paints the steering wedge.
 *
 * `conic-gradient(from Xdeg, ...)` measures clockwise from twelve o'clock, which is the
 * same origin our bearings use — so the arc only has to shift back by half its own width
 * to end up centred on the angle being steered. No quarter-turn correction belongs here;
 * adding one paints six o'clock at three.
 *
 * @param {object} args - wedge geometry
 * @param {number} args.angle - bearing being steered, degrees clockwise from up
 * @param {number} [args.spread] - total arc width in degrees
 * @return {number} value for the gradient's `from`
 */
export function wedgeFromAngle({ angle, spread = 52 }) {
	return angle - spread / 2
}

/**
 * Numbers for the live readout under the controller.
 *
 * Returns values rather than a sentence so the component can translate it.
 *
 * @param {object} args - steering state
 * @param {number} args.angle - degrees clockwise from up, possibly negative
 * @param {number} args.strength - 0–1
 * @return {{degrees: number, strengthPercent: number, steering: boolean}}
 */
export function readoutValues({ angle, strength }) {
	return {
		// atan2 yields negatives for the left half; a bearing should read 0–359.
		degrees: Math.round(((angle % 360) + 360) % 360),
		strengthPercent: Math.round(strength * 100),
		steering: strength > 0.001,
	}
}
