/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Measures a model in the browser when nothing was measured yet, for the Files sidebar's
 * "3D" tab: the same loader and the same worker as a background thumbnail, within the same
 * per-user limits (largest file, time for one file, download allowance), and without
 * drawing it, so a browser with no WebGL measures too.
 *
 * Every dependency is injected, so this holds only the rules and runs without a DOM.
 */

import { logger } from '../utils/logger.js'
import {
	ThumbnailBudgetError,
	ThumbnailTimeoutError,
	ThumbnailTooLargeError,
} from '../thumbnails/errors.js'

const BYTES_PER_MB = 1048576

/**
 * What a measurement ended in.
 *
 * @typedef {object} MeasureResult
 * @property {'measured'|'too-large'|'failed'|'aborted'} status - `too-large` is a limit of the
 *   user's settings (size, time, download allowance) or of what the browser can parse in a
 *   worker; `failed` is a file or a browser that did not work out; `aborted` is the caller
 *   leaving
 * @property {?object} [stats] - With `measured`: the measurement, or null when the model
 *   loaded and has nothing to measure
 * @property {boolean} [complete] - With `measured`: every companion the model declares was
 *   there, so the numbers are the model's and may be stored; false when the model went
 *   without a texture or material, which would make a stored count permanently wrong
 */

/**
 * @param {string} name - File name
 * @return {string} Its extension, lower case, without the dot
 */
function extensionOf(name) {
	const dot = String(name ?? '').lastIndexOf('.')
	return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Measure one model, within the user's thumbnail limits.
 *
 * @param {object} file - The model
 * @param {number} file.fileId - Nextcloud file id
 * @param {string} file.name - File name
 * @param {string} file.dir - The folder it is in, relative to the user's home
 * @param {number} file.size - Its size in bytes, which the server reported
 * @param {object} deps - What the measurement talks to
 * @param {() => Promise<import('../thumbnails/thumbnailSettings.js').ThumbnailSettings>} deps.loadSettings
 * @param {Function} deps.load - Downloads a model and what it declares, as
 *   `loadModelForBackground` (thumbnails/backgroundLoad.js) does
 * @param {(job: object, options: {timeoutMs: number, signal: AbortSignal}) => Promise<?object>} deps.measure
 *   - Measures in a worker, as `measureInWorker` (thumbnails/workerRenderer.js) does
 * @param {AbortSignal} [signal] - Stops the work when the tab is left
 * @return {Promise<MeasureResult>} Never rejects
 */
export async function measureModel({ fileId, name, dir, size }, deps, signal) {
	const extension = extensionOf(name)
	let settings
	try {
		settings = await deps.loadSettings()
	} catch (error) {
		logger.warn('measureModel', 'Could not read the limits', error)
		return { status: 'failed' }
	}
	const timeoutMs = settings.timeoutSeconds * 1000
	const budget = settings.folderBudgetMB * BYTES_PER_MB

	// Nothing is downloaded for a file the user's limits rule out
	if (!(size <= settings.maxFileSizeMB * BYTES_PER_MB) || size > budget) {
		return { status: 'too-large' }
	}
	if (signal?.aborted) {
		return { status: 'aborted' }
	}

	const job = new AbortController()
	const leave = () => job.abort()
	signal?.addEventListener('abort', leave, { once: true })
	let timedOut = false
	const startedAt = Date.now()
	const timer = setTimeout(() => {
		timedOut = true
		job.abort()
	}, timeoutMs)

	try {
		const loaded = await deps.load(fileId, name, extension, dir, {
			signal: job.signal,
			budgetBytes: budget,
			onBytes: () => {},
		})
		if (loaded.budgetReached) {
			return { status: 'too-large' }
		}
		const remaining = timeoutMs - (Date.now() - startedAt)
		if (remaining <= 0) {
			return { status: 'too-large' }
		}

		const stats = await deps.measure(
			{
				extension,
				buffer: await loaded.mainFile.arrayBuffer(),
				additionalFiles: loaded.dependencies ?? [],
				name,
			},
			{ timeoutMs: remaining, signal: job.signal },
		)
		return { status: 'measured', stats, complete: (loaded.missingFiles ?? []).length === 0 }
	} catch (error) {
		if (signal?.aborted) {
			return { status: 'aborted' }
		}
		if (timedOut || error instanceof ThumbnailTimeoutError || error instanceof ThumbnailTooLargeError || error instanceof ThumbnailBudgetError) {
			return { status: 'too-large' }
		}
		logger.info('measureModel', 'Could not measure the model', { fileId, error })
		return { status: 'failed' }
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener('abort', leave)
	}
}
