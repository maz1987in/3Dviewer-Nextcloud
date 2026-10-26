/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The heavy half of the Files page integration: the user, the settings, the server calls,
 * the model loader and the worker renderer, wired into a background queue. filesPage.js
 * imports this only once a folder shows a model, so other Files pages never load it.
 *
 * The loader is the background one, not the viewer's: it fetches only the companions a
 * model declares, within the budget, and stops when the queue aborts it. See
 * backgroundLoad.js for why.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { getCurrentUser } from '@nextcloud/auth'
import { loadModelForBackground } from './backgroundLoad.js'
import { createBackgroundQueue } from './backgroundQueue.js'
import { isSkipped, markSkipped } from './skipList.js'
import { fetchStatus, uploadThumbnail } from './thumbnailApi.js'
import { loadThumbnailSettings } from './thumbnailSettings.js'
import { probeWorkerRendering, renderInWorker } from './workerRenderer.js'

/**
 * Create the background queue, if there is a logged-in user with "Create thumbnails while
 * browsing Files" on. That switch is independent of `enabled`, which is about capturing
 * from the open viewer.
 *
 * @param {object} options - What the page provides
 * @param {import('./backgroundQueue.js').BackgroundQueueDeps['env']} options.env - Pause, resume and idle
 * @param {(fileId: number, blob: Blob) => void} options.onThumbnail - Told about each stored thumbnail
 * @return {Promise<?ReturnType<typeof createBackgroundQueue>>} The queue, or null when
 *   thumbnails are not made in the background
 */
export async function createFilesQueue({ env, onThumbnail }) {
	if (!getCurrentUser()) {
		return null
	}
	const settings = await loadThumbnailSettings()
	if (!settings.background) {
		return null
	}
	return createBackgroundQueue({
		settings,
		api: { fetchStatus, uploadThumbnail },
		load: loadModelForBackground,
		render: renderInWorker,
		probe: probeWorkerRendering,
		skips: { isSkipped, markSkipped },
		env,
		onThumbnail,
	})
}
