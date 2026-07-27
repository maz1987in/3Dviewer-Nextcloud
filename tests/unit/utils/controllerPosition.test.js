/**
 * The circular navigation controller was positioned against the viewport, so its
 * default spot (20px from the left) landed underneath Nextcloud's app navigation —
 * which is frosted glass, so the controller showed through it washed out rather than
 * sitting on the 3D scene.
 *
 * Anchoring it to the viewer container instead means every pointer coordinate has to
 * be translated out of viewport space, and clamped against the container rather than
 * the window. Both the mouse and touch drag paths carried their own copy of that
 * arithmetic; this is the one they now share.
 */

import { clampToContainer, clampWithinContainer } from '../../../src/utils/controllerPosition.js'

/** A 300px-wide sidebar, then the viewer filling the rest of a 1024x900 window. */
const VIEWER = { left: 300, top: 50, width: 724, height: 850 }
const SIZE = { width: 210, height: 150 }

describe('clampToContainer', () => {
	it('translates a viewport pointer into container-relative coordinates', () => {
		// Pointer at the very left edge of the viewer, grabbed at the controller's corner.
		const pos = clampToContainer({
			pointerX: 300, pointerY: 50, offsetX: 0, offsetY: 0, container: VIEWER, size: SIZE,
		})

		// Not 300/50: those would place it a sidebar's width into the scene.
		expect(pos).toEqual({ x: 0, y: 0 })
	})

	it('keeps the grab point under the pointer', () => {
		const pos = clampToContainer({
			pointerX: 500, pointerY: 300, offsetX: 40, offsetY: 25, container: VIEWER, size: SIZE,
		})

		expect(pos).toEqual({ x: 500 - 40 - 300, y: 300 - 25 - 50 })
	})

	it('stops the controller at the container edges rather than the window edges', () => {
		const pos = clampToContainer({
			pointerX: 5000, pointerY: 5000, offsetX: 0, offsetY: 0, container: VIEWER, size: SIZE,
		})

		expect(pos).toEqual({ x: VIEWER.width - SIZE.width, y: VIEWER.height - SIZE.height })
	})

	it('does not let the controller drift back under the sidebar', () => {
		// Dragging left past the viewer's own edge — the bug this whole change is about.
		// x pins to the container edge; y is genuinely 10px inside and stays there.
		const pos = clampToContainer({
			pointerX: 10, pointerY: 60, offsetX: 0, offsetY: 0, container: VIEWER, size: SIZE,
		})

		expect(pos).toEqual({ x: 0, y: 10 })
	})

	it('collapses to the origin when the container is smaller than the controller', () => {
		const tiny = { left: 0, top: 0, width: 120, height: 100 }

		expect(clampToContainer({
			pointerX: 60, pointerY: 50, offsetX: 0, offsetY: 0, container: tiny, size: SIZE,
		})).toEqual({ x: 0, y: 0 })
	})

	it('survives a missing container by leaving the position at the origin', () => {
		// getBoundingClientRect on a not-yet-mounted parent, rather than throwing
		// mid-drag.
		expect(clampToContainer({
			pointerX: 400, pointerY: 400, offsetX: 0, offsetY: 0, container: null, size: SIZE,
		})).toEqual({ x: 0, y: 0 })
	})
})

describe('clampWithinContainer', () => {
	it('leaves a position that already fits alone', () => {
		expect(clampWithinContainer({ x: 40, y: 60, container: VIEWER, size: SIZE }))
			.toEqual({ x: 40, y: 60 })
	})

	/**
	 * Positions were persisted as viewport offsets before the controller moved to
	 * container-relative placement, so a saved value can sit far outside a container
	 * that no longer starts at the window's edge — or simply outlive the window size
	 * it was saved at.
	 */
	it('pulls a stale saved position back inside the container', () => {
		expect(clampWithinContainer({ x: 5000, y: 5000, container: VIEWER, size: SIZE }))
			.toEqual({ x: VIEWER.width - SIZE.width, y: VIEWER.height - SIZE.height })
	})

	it('rejects a negative saved position', () => {
		expect(clampWithinContainer({ x: -80, y: -10, container: VIEWER, size: SIZE }))
			.toEqual({ x: 0, y: 0 })
	})

	it('leaves the position untouched when the container is not measurable yet', () => {
		expect(clampWithinContainer({ x: 20, y: 80, container: null, size: SIZE }))
			.toEqual({ x: 20, y: 80 })
	})
})
