/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Thumbnail capture for the open viewer: once per file version, with the fixed look,
 * and only when the user can store the result.
 */

import { isPublicShare } from '../composables/usePublicShare.js'
import { logger } from '../utils/logger.js'
import { EmptyModelError } from './errors.js'
import { isThumbnailFormat } from './formats.js'
import { renderThumbnail } from './renderThumbnail.js'
import { fetchStatus, uploadThumbnail } from './thumbnailApi.js'

/**
 * Ask the server for a file's thumbnail status. Call this when the model load begins,
 * before its bytes are downloaded: the etag it returns is the version the upload is
 * stored under, so it must not be newer than the bytes the render was made from.
 *
 * Returns null, without a request, when the viewer never captures this file: not a model
 * format, not a real file id, or a public share.
 *
 * A rejection never goes unhandled, even if the load fails and no capture ever runs;
 * the returned promise still rejects for `captureForCurrentVersion` to see.
 *
 * @param {object} options - Options
 * @param {number|string} options.fileId - Nextcloud file id (synthetic ids such as 'comparison' are ignored)
 * @param {string} options.extension - File extension, without the dot
 * @return {Promise<Map<number, ThumbnailStatus>>|null} The pending status, or null when
 *   there is nothing to capture
 */
export function startStatusFetch({ fileId, extension }) {
	const id = Number(fileId)
	if (!Number.isInteger(id) || id <= 0 || !isThumbnailFormat(extension) || isPublicShare()) {
		return null
	}

	const pending = fetchStatus([id])
	// Marks the rejection handled for the case where nobody ever awaits it
	pending.catch(() => {})
	return pending
}

/**
 * Render the loaded model and store it as the thumbnail for the version the status
 * describes, unless this version already has one or the user cannot store it.
 *
 * Never throws: a failed thumbnail must not disturb the viewer.
 *
 * @param {object} options - Options
 * @param {number} options.fileId - Nextcloud file id
 * @param {string} options.extension - File extension, without the dot
 * @param {THREE.Object3D} options.object3D - The loaded model; it is put back under its parent
 * @param {Promise<Map<number, ThumbnailStatus>>} options.statusPromise - The status fetched
 *   before the model was downloaded (see `startStatusFetch`); never fetched again here, so
 *   a model edited since the download is not stored under its newer version
 * @return {Promise<'stored'|'exists'|'skipped'>} What happened
 */
export async function captureForCurrentVersion({ fileId, extension, object3D, statusPromise }) {
	if (!isThumbnailFormat(extension)) {
		return 'skipped'
	}

	let status
	try {
		status = (await statusPromise)?.get(fileId)
	} catch (error) {
		logger.warn('captureFromViewer', 'Could not read the thumbnail status', error)
		return 'skipped'
	}

	if (!status || !status.canEdit || status.hasThumbnail) {
		return 'skipped'
	}

	try {
		const blob = await renderThumbnail(object3D, { canvas: document.createElement('canvas') })
		const outcome = await uploadThumbnail(fileId, status.etag, blob)

		if (outcome === 'stored' || outcome === 'exists') {
			return outcome
		}
		// 'stale': the file changed since the status; the next open renders the new one
		logger.info('captureFromViewer', 'Thumbnail not stored', { fileId, outcome })
		return 'skipped'
	} catch (error) {
		if (error instanceof EmptyModelError) {
			logger.info('captureFromViewer', 'Model has no geometry to render', { fileId })
		} else {
			logger.warn('captureFromViewer', 'Thumbnail capture failed', error)
		}
		return 'skipped'
	}
}

/**
 * Capture after a short delay that lets the viewer finish its own first frames. Everything
 * the capture needs is passed in by the load that produced the model, so two loads running
 * in one viewer can never pair one load's model with the other's file id or status.
 *
 * @param {object} options - Options
 * @param {number} options.fileId - Nextcloud file id the load started with
 * @param {string} options.extension - File extension, without the dot
 * @param {THREE.Object3D} options.object3D - The model this load produced
 * @param {?Promise<Map<number, ThumbnailStatus>>} options.statusPromise - From `startStatusFetch`
 *   at the start of the same load; null means nothing to capture
 * @param {() => boolean} options.isCurrent - Asked when the delay is over: false when the
 *   load was cancelled or another load or model has replaced this one, which skips the capture
 * @param {number} [options.delayMs] - Delay before capturing
 */
export function scheduleCapture({ fileId, extension, object3D, statusPromise, isCurrent, delayMs = 500 }) {
	if (!statusPromise || !object3D) {
		return
	}
	setTimeout(() => {
		if (!isCurrent()) {
			return
		}
		captureForCurrentVersion({ fileId, extension, object3D, statusPromise })
	}, delayMs)
}
