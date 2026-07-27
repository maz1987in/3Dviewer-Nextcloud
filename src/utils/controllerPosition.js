/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Placement maths for the draggable circular navigation controller.
 */

/**
 * Where the controller should sit inside its container, given a pointer.
 *
 * The controller is positioned against the viewer container, not the viewport, so a
 * pointer coordinate has to be translated out of viewport space before it means
 * anything — and clamped against the container, so it cannot be dragged back under
 * Nextcloud's app navigation or off the bottom of the scene.
 *
 * @param {object} args - placement inputs
 * @param {number} args.pointerX - pointer clientX
 * @param {number} args.pointerY - pointer clientY
 * @param {number} args.offsetX - where inside the controller the drag started
 * @param {number} args.offsetY - where inside the controller the drag started
 * @param {{left: number, top: number, width: number, height: number}|null} args.container
 *   bounding rect of the viewer container, or null before it is mounted
 * @param {number} args.size - controller width/height in px
 * @return {{x: number, y: number}} container-relative offsets for `left`/`top`
 */
export function clampToContainer({ pointerX, pointerY, offsetX, offsetY, container, size }) {
	if (!container) {
		return { x: 0, y: 0 }
	}

	return clampWithinContainer({
		x: pointerX - offsetX - container.left,
		y: pointerY - offsetY - container.top,
		container,
		size,
	})
}

/**
 * Pull a container-relative position inside the container's bounds.
 *
 * Used on restore as well as on drag: positions were persisted as viewport offsets
 * before the controller became container-relative, so a stored value can sit well
 * outside a container that no longer starts at the window's edge — or simply outlive
 * the window size it was saved at.
 *
 * @param {object} args - placement inputs
 * @param {number} args.x - container-relative left offset
 * @param {number} args.y - container-relative top offset
 * @param {{width: number, height: number}|null} args.container - container bounds, or
 *   null when it cannot be measured yet, in which case the position is left alone
 * @param {number} args.size - controller width/height in px
 * @return {{x: number, y: number}} clamped offsets
 */
export function clampWithinContainer({ x, y, container, size }) {
	if (!container) {
		return { x, y }
	}

	// Math.max last, so a container smaller than the controller pins it to the origin
	// instead of pushing it out through the top-left.
	return {
		x: Math.max(0, Math.min(container.width - size, x)),
		y: Math.max(0, Math.min(container.height - size, y)),
	}
}
