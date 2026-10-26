/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client for the two thumbnail endpoints: which files need a thumbnail, and storing one.
 * `@nextcloud/axios` attaches the request token the upload requires.
 */

import axios from '@nextcloud/axios'
import { generateUrl } from '@nextcloud/router'

/** The status endpoint refuses more ids than this in one request. */
const MAX_IDS_PER_REQUEST = 200

/**
 * @typedef {object} ThumbnailStatus
 * @property {string} name - File name
 * @property {string} dir - Folder the file is in
 * @property {number} size - Size in bytes
 * @property {string} etag - Version of the file the status describes
 * @property {boolean} canEdit - Whether the user may write next to the file
 * @property {boolean} hasThumbnail - Whether this version already has a thumbnail
 */

/**
 * Ask which of the given files already have a thumbnail for their current version.
 *
 * @param {number[]} fileIds - Nextcloud file ids
 * @return {Promise<Map<number, ThumbnailStatus>>} Status by file id; files the user cannot
 *   see are absent
 */
export async function fetchStatus(fileIds) {
	const url = generateUrl('/apps/threedviewer/api/thumbnails/status')
	const statuses = new Map()

	for (let i = 0; i < fileIds.length; i += MAX_IDS_PER_REQUEST) {
		const ids = fileIds.slice(i, i + MAX_IDS_PER_REQUEST)
		const { data } = await axios.get(url, { params: { ids: ids.join(',') } })
		// `files` is `{}` when empty, but a PHP empty array can arrive as `[]`; entries of
		// either are fine
		for (const [id, status] of Object.entries(data?.files ?? {})) {
			statuses.set(Number(id), status)
		}
	}

	return statuses
}

/**
 * Store a rendered thumbnail for one version of a file.
 *
 * @param {number} fileId - Nextcloud file id
 * @param {string} etag - Version the thumbnail was rendered from, as the status reported it
 * @param {Blob} blob - The PNG
 * @return {Promise<'stored'|'exists'|'stale'|'forbidden'|'error'>} What the server did
 */
export async function uploadThumbnail(fileId, etag, blob) {
	const url = generateUrl('/apps/threedviewer/api/thumbnail/{fileId}', { fileId })
	let status
	try {
		const response = await axios.post(url, blob, {
			params: { etag },
			headers: { 'Content-Type': 'image/png' },
		})
		status = response.status
	} catch (error) {
		// axios rejects every non-2xx status, and 409/412/403 are answers, not failures
		status = error?.response?.status
	}

	switch (status) {
	case 201:
		return 'stored'
	case 409:
		return 'exists'
	case 412:
		return 'stale'
	case 403:
		return 'forbidden'
	default:
		return 'error'
	}
}
