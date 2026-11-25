/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client for the two statistics endpoints: what is known of a model (its stored
 * measurement, its notes, the unit and direction chosen for it) and storing a measurement.
 * `@nextcloud/axios` attaches the request token the upload requires.
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/**
 * @typedef {object} ModelInfo
 * @property {number} fileId - The model
 * @property {string} name - File name
 * @property {number} size - Size in bytes
 * @property {string} etag - The current version of the file
 * @property {boolean} canEdit - Whether the user may edit the file
 * @property {?object} stats - The measurement of this very version, or null when it has none
 * @property {{unit: ?string, up: ?string}} settings - The unit and direction chosen for the file
 * @property {{count: number, firstId: ?number}} notes - Its notes
 */

/**
 * @param {number} fileId - Nextcloud file id
 * @return {Promise<ModelInfo>} What the server knows of the model; rejects when the user
 *   cannot read the file or it is not a model
 */
export async function fetchModelInfo(fileId) {
	const { data } = await axios.get(generateUrl('/apps/threedviewer/api/stats/{fileId}', { fileId }))
	return {
		fileId,
		name: String(data?.name ?? ''),
		size: Number(data?.size) || 0,
		etag: String(data?.etag ?? ''),
		canEdit: data?.canEdit === true,
		stats: data?.stats && typeof data.stats === 'object' ? data.stats : null,
		settings: { unit: data?.settings?.unit ?? null, up: data?.settings?.up ?? null },
		notes: { count: Number(data?.notes?.count) || 0, firstId: Number(data?.notes?.firstId) || null },
	}
}

/**
 * Store the measurement of one version of a file.
 *
 * @param {number} fileId - Nextcloud file id
 * @param {string} etag - The version the measurement was made from, as the server reported it
 * @param {object} stats - From extractModelStats
 * @return {Promise<'stored'|'exists'|'stale'|'invalid'|'error'>} What the server did
 */
export async function uploadModelStats(fileId, etag, stats) {
	let status
	try {
		const response = await axios.post(
			generateUrl('/apps/threedviewer/api/stats/{fileId}', { fileId }),
			{ etag, stats },
		)
		status = response.status
	} catch (error) {
		// axios rejects every non-2xx status, and 409/412/400 are answers, not failures
		status = error?.response?.status
	}

	switch (status) {
	case 201:
		return 'stored'
	case 409:
		return 'exists'
	case 412:
		return 'stale'
	case 400:
	case 413:
		return 'invalid'
	default:
		return 'error'
	}
}
