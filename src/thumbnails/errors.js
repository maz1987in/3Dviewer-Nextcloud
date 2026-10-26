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

/**
 * Thrown when the browser, the worker or the network failed rather than the file: the
 * worker would not start or crashed, a message could not be read, a download hit a
 * network error or a 5xx. Retrying on a later visit may work, so the file is never
 * marked skipped for it.
 */
export class ThumbnailEnvironmentError extends Error {

	/**
	 * @param {string} message - What failed
	 * @param {{cause?: unknown}} [options] - The underlying error
	 */
	constructor(message, options) {
		super(message, options)
		this.name = 'ThumbnailEnvironmentError'
	}

}

/**
 * Thrown when a background download would go past what is left of the folder-visit
 * budget. The visit stops there; the file is not skipped.
 */
export class ThumbnailBudgetError extends Error {

	/**
	 * @param {number} budgetBytes - What was left of the budget, in bytes
	 */
	constructor(budgetBytes) {
		super(`Download would exceed the ${budgetBytes} bytes left of the folder budget`)
		this.name = 'ThumbnailBudgetError'
		this.budgetBytes = budgetBytes
	}

}
