/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The user's thumbnail settings as the background queue needs them: saved values over the
 * defaults, with anything unusable replaced by the default.
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'
import { THUMBNAIL_SETTINGS } from '../config/viewer-config.js'

/** Inclusive limits for the numeric settings. */
const RANGES = {
	maxFileSizeMB: [1, 2048],
	timeoutSeconds: [5, 300],
	folderBudgetMB: [50, 10000],
}

/**
 * @typedef {object} ThumbnailSettings
 * @property {boolean} enabled - Thumbnails are made at all
 * @property {boolean} background - They are also made while browsing Files
 * @property {number} maxFileSizeMB - Largest file background work downloads
 * @property {number} timeoutSeconds - Time allowed for downloading and rendering one file
 * @property {number} folderBudgetMB - Download allowance per folder visit
 */

/**
 * @return {ThumbnailSettings} The defaults
 */
function defaults() {
	const { enabled, background, maxFileSizeMB, timeoutSeconds, folderBudgetMB } = THUMBNAIL_SETTINGS
	return { enabled, background, maxFileSizeMB, timeoutSeconds, folderBudgetMB }
}

/**
 * Load the user's thumbnail settings. Never rejects: a failed request gives the defaults.
 *
 * @return {Promise<ThumbnailSettings>} Effective settings
 */
export async function loadThumbnailSettings() {
	const result = defaults()
	let saved
	try {
		const response = await axios.get(generateUrl('/apps/threedviewer/settings'))
		saved = response?.data?.settings?.thumbnails
	} catch (e) {
		return result
	}
	if (!saved || typeof saved !== 'object') {
		return result
	}

	for (const key of ['enabled', 'background']) {
		if (typeof saved[key] === 'boolean') {
			result[key] = saved[key]
		}
	}
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		const value = saved[key]
		if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) {
			result[key] = value
		}
	}
	return result
}
