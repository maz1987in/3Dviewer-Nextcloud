/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Camera framing shared by the viewer and the thumbnail renderer, so a thumbnail
 * shows the model the way the viewer first opens it.
 */

import { Vector3 } from 'three'

/**
 * Compute where to place a perspective camera so a bounding box fills the view.
 *
 * The camera sits on the (0.5, 0.5, 1) diagonal from the box centre, at a distance
 * of `|maxDim / sin(fov / 2)| * 0.75`, and looks at the centre.
 *
 * @param {THREE.Box3} box - World-space bounding box of the model
 * @param {number} fovDegrees - Camera vertical field of view in degrees
 * @return {{position: number[], target: number[]}|null} Camera position and look-at
 *   target as [x, y, z], or null when the box is empty or the result is not finite
 */
export function computeCameraFit(box, fovDegrees) {
	if (!box || box.isEmpty()) {
		return null
	}

	const size = box.getSize(new Vector3())
	const center = box.getCenter(new Vector3())
	const maxDim = Math.max(size.x, size.y, size.z)

	const fov = fovDegrees * (Math.PI / 180)
	const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.75

	if (![distance, center.x, center.y, center.z].every(Number.isFinite)) {
		return null
	}

	return {
		position: [
			center.x + distance * 0.5,
			center.y + distance * 0.5,
			center.z + distance,
		],
		target: [center.x, center.y, center.z],
	}
}
