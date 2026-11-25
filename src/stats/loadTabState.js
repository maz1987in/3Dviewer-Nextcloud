/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * What the Files sidebar's "3D" tab shows for a model, and how it gets there: the stored
 * numbers when this version of the file has them, otherwise a measurement in the browser
 * within the user's thumbnail limits, stored for the next person to open the tab.
 *
 * Every dependency is injected, so this holds only the rules and runs without a DOM.
 */

import { canRenderInBackground } from '../thumbnails/formats.js'
import { logger } from '../utils/logger.js'

/**
 * What the tab is to show.
 *
 * @typedef {object} TabState
 * @property {'ready'|'idle'|'too-large'|'failed'|'unavailable'|'aborted'} phase - `ready`:
 *   there are numbers; `idle`: a model that is not measured on its own (see `autoMeasure`)
 *   waits for the user to ask; `too-large`: the user's limits (or the browser's) rule out
 *   measuring it here; `failed`: it could not be measured; `unavailable`: the server does
 *   not know the file; `aborted`: the caller left
 * @property {?import('./statsApi.js').ModelInfo} info - What the server said of the model
 * @property {?object} stats - The numbers, with `ready`
 * @property {'stored'|'measured'} [source] - Where they came from, with `ready`
 * @property {boolean} [incomplete] - With `ready`: measured here, from a model that went
 *   without something it declares, so the numbers are shown and not stored
 */

/**
 * Whether opening the tab measures the model on its own. A `.nc` or `.g` file is a CNC
 * program as often as it is NetCDF or something else, and the app never downloads one of
 * those unasked: opening a tab is not the user saying that the file is a model.
 *
 * @param {string} name - File name
 * @return {boolean} False for an ambiguous extension
 */
export function autoMeasure(name) {
	const dot = String(name ?? '').lastIndexOf('.')
	return dot !== -1 && canRenderInBackground(name.slice(dot + 1))
}

/**
 * Find out what to show for a model.
 *
 * @param {object} file - The model
 * @param {number} file.fileId - Nextcloud file id
 * @param {string} file.name - File name, which names the format
 * @param {string} file.dir - The folder it is in, relative to the user's home
 * @param {object} deps - What the tab talks to
 * @param {(fileId: number) => Promise<import('./statsApi.js').ModelInfo>} deps.fetchModelInfo
 * @param {(fileId: number, etag: string, stats: object) => Promise<string>} deps.uploadModelStats
 * @param {(file: object, signal?: AbortSignal) => Promise<import('./measureModel.js').MeasureResult>} deps.measure
 *   - `measureModel` with its own dependencies bound
 * @param {object} [options] - What to do
 * @param {boolean} [options.force] - Measure a model that `autoMeasure` leaves alone
 * @param {AbortSignal} [options.signal] - Stops the work when the tab is left
 * @param {() => void} [options.onMeasuring] - Called when the model has no numbers yet and
 *   the browser starts to measure it, which takes a while the tab says so for
 * @return {Promise<TabState>} Never rejects
 */
export async function loadTabState({ fileId, name, dir }, deps, { force = false, signal, onMeasuring } = {}) {
	// A file that changed while it was measured is measured again, once
	for (let attempt = 0; attempt < 2; attempt++) {
		let info
		try {
			info = await deps.fetchModelInfo(fileId)
		} catch (error) {
			// Not a model, not readable by this user, or the server is down: the tab says so
			logger.info('loadTabState', 'No statistics for the file', { fileId, error })
			return { phase: 'unavailable', info: null, stats: null }
		}
		if (signal?.aborted) {
			return { phase: 'aborted', info, stats: null }
		}
		if (info.stats) {
			return { phase: 'ready', info, stats: info.stats, source: 'stored' }
		}
		if (!force && !autoMeasure(name)) {
			return { phase: 'idle', info, stats: null }
		}

		onMeasuring?.()
		const result = await deps.measure({ fileId, name, dir, size: info.size }, signal)
		if (result.status === 'aborted') {
			return { phase: 'aborted', info, stats: null }
		}
		if (result.status === 'too-large' || result.status === 'failed') {
			return { phase: result.status, info, stats: null }
		}
		if (!result.stats) {
			// Loaded, and nothing in it to measure
			return { phase: 'failed', info, stats: null }
		}
		if (!result.complete) {
			return { phase: 'ready', info, stats: result.stats, source: 'measured', incomplete: true }
		}

		const outcome = await deps.uploadModelStats(fileId, info.etag, result.stats)
		if (outcome !== 'stale') {
			return { phase: 'ready', info, stats: result.stats, source: 'measured' }
		}
		// The file changed since `info`: these numbers are of a version that is gone
	}
	return { phase: 'failed', info: null, stats: null }
}
