/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Errors a thumbnail render can end in. Kept apart from the renderer so the host side
 * of the background worker can tell them apart without loading three.js on the page.
 */

/**
 * Thrown when the model has no geometry to frame, so a caller can tell "nothing to
 * render" apart from a real failure.
 */
export class EmptyModelError extends Error {

	constructor(message = 'Model has no renderable geometry') {
		super(message)
		this.name = 'EmptyModelError'
	}

}

/**
 * Thrown when a background render runs past its time limit and its worker is stopped.
 */
export class ThumbnailTimeoutError extends Error {

	/**
	 * @param {number} timeoutMs - The limit that was exceeded, in milliseconds
	 */
	constructor(timeoutMs) {
		super(`Thumbnail render exceeded ${timeoutMs} ms`)
		this.name = 'ThumbnailTimeoutError'
		this.timeoutMs = timeoutMs
	}

}
