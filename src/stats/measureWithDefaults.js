/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * `measureModel` wired to the real loader, the real worker and the user's settings. On its
 * own so the Files sidebar's tab loads it only when a model has to be measured: it pulls in
 * the background loader and the worker's client, which a model with stored numbers never needs.
 */

import { loadModelForBackground } from '../thumbnails/backgroundLoad.js'
import { loadThumbnailSettings } from '../thumbnails/thumbnailSettings.js'
import { measureInWorker } from '../thumbnails/workerRenderer.js'
import { measureModel } from './measureModel.js'

/**
 * @param {{fileId: number, name: string, dir: string, size: number}} file - The model
 * @param {AbortSignal} [signal] - Stops the work when the tab is left
 * @return {Promise<import('./measureModel.js').MeasureResult>} Never rejects
 */
export function measureWithDefaults(file, signal) {
	return measureModel(file, {
		loadSettings: loadThumbnailSettings,
		load: loadModelForBackground,
		measure: measureInWorker,
	}, signal)
}
