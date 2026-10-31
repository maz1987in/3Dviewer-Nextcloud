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

// How long a viewer load waits for the status before it downloads without it. The wait
// is one small request; this only bounds a server that never answers.
const STATUS_WAIT_MS = 10000
const TIMED_OUT = Symbol('timed out')

/**
 * Ask the server for a file's thumbnail status. Most callers want
 * `awaitStatusBeforeDownload`, which also waits for the answer: the etag it returns is
 * the version the upload is stored under, so it must not be newer than the bytes the
 * render was made from, and only a status that has arrived before the download starts
 * guarantees that. A request merely sent first does not, since the server may read the
 * file for the download before it reads it for the status.
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
 * Fetch a file's thumbnail status and wait for it, so the model download that follows
 * is never older than the version the status names. Await this before starting the
 * download, and hand the result to `scheduleCapture` for the same load.
 *
 * The model load must not depend on it: a failed request resolves null, which skips the
 * capture, and so does a request with no answer within `timeoutMs` (a late answer could
 * describe a newer version than the bytes about to be downloaded).
 *
 * @param {object} options - Options
 * @param {number|string} options.fileId - Nextcloud file id
 * @param {string} options.extension - File extension, without the dot
 * @param {number} [options.timeoutMs] - Longest wait before the load goes on without it
 * @return {Promise<?Map<number, ThumbnailStatus>>} Never rejects. The status, or null
 *   when there is nothing to capture (see `startStatusFetch`), the request failed or no
 *   answer came in time
 */
export async function awaitStatusBeforeDownload({ fileId, extension, timeoutMs = STATUS_WAIT_MS }) {
	const pending = startStatusFetch({ fileId, extension })
	if (!pending) {
		return null
	}

	let timer
	const timedOut = new Promise((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
	})
	try {
		const answer = await Promise.race([pending, timedOut])
		if (answer === TIMED_OUT) {
			logger.warn('captureFromViewer', 'No thumbnail status in time; this open makes no thumbnail', { fileId })
			return null
		}
		return answer
	} catch (error) {
		logger.warn('captureFromViewer', 'Could not read the thumbnail status; this open makes no thumbnail', error)
		return null
	} finally {
		clearTimeout(timer)
	}
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
 * @param {Map<number, ThumbnailStatus>|Promise<Map<number, ThumbnailStatus>>} options.statuses
 *   - The status that arrived before the model was downloaded (see
 *   `awaitStatusBeforeDownload`), or a promise of it; never fetched again here, so a
 *   model edited since the download is not stored under its newer version
 * @return {Promise<'stored'|'exists'|'skipped'>} What happened
 */
export async function captureForCurrentVersion({ fileId, extension, object3D, statuses }) {
	// A splat's render waits for Spark's sort, with the open viewer's model lent to it all
	// the while; the background thumbnailer, which has a model of its own, makes it instead
	if (!isThumbnailFormat(extension) || object3D?.userData?.tdvSplat) {
		return 'skipped'
	}

	let status
	try {
		status = (await statuses)?.get(fileId)
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
 * Whether any of a load's files came out of the dependency cache, which is keyed by file
 * id and name, not version: a cached material or texture may be older than the file on
 * the server, and a thumbnail made with it would be kept for good.
 *
 * @param {?File[]} files - The files a load used
 * @return {boolean} True when one of them was served from the cache
 */
export function usedCachedFiles(files) {
	return Array.isArray(files) && files.some((file) => file?._fromCache === true)
}

/**
 * Capture after a short delay that lets the viewer finish its own first frames. Everything
 * the capture needs is passed in by the load that produced the model, so two loads running
 * in one viewer can never pair one load's model with the other's file id or status.
 *
 * A load that used a cached companion is not captured (see `usedCachedFiles`); the next
 * open, or the Files page, makes the thumbnail from fresh files.
 *
 * @param {object} options - Options
 * @param {number} options.fileId - Nextcloud file id the load started with
 * @param {string} options.extension - File extension, without the dot
 * @param {THREE.Object3D} options.object3D - The model this load produced
 * @param {?Map<number, ThumbnailStatus>} options.statuses - From `awaitStatusBeforeDownload`
 *   at the start of the same load; null means nothing to capture
 * @param {?File[]} [options.sourceFiles] - The files the load used, to check for cached ones
 * @param {() => boolean} options.isCurrent - Asked when the delay is over: false when the
 *   load was cancelled or another load or model has replaced this one, which skips the capture
 * @param {number} [options.delayMs] - Delay before capturing
 */
export function scheduleCapture({ fileId, extension, object3D, statuses, isCurrent, sourceFiles = null, delayMs = 500 }) {
	if (!statuses || !object3D) {
		return
	}
	if (usedCachedFiles(sourceFiles)) {
		logger.info('captureFromViewer', 'A companion came from the cache; no thumbnail this time', { fileId })
		return
	}
	setTimeout(() => {
		if (!isCurrent()) {
			return
		}
		captureForCurrentVersion({ fileId, extension, object3D, statuses })
	}, delayMs)
}
