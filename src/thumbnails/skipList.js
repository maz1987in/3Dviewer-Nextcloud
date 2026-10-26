/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The file versions this browser gave up making a thumbnail for, so background work does
 * not retry them on every folder visit. Keyed by file id and etag, so a changed file is
 * tried again. Kept in localStorage, which can be missing or throw (private windows,
 * blocked site data), so every access is guarded and failure means "nothing is skipped".
 */

const STORAGE_KEY = 'threedviewer:thumbnailSkips'
const MAX_ENTRIES = 2000

/**
 * @param {number} fileId - Nextcloud file id
 * @param {string} etag - Version of the file
 * @return {string} Entry key
 */
function entryKey(fileId, etag) {
	return `${fileId}:${etag}`
}

/**
 * @return {Object<string, number>} Entry key to the time it was skipped (epoch ms)
 */
function readSkips() {
	try {
		const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY))
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
	} catch (e) {
		return {}
	}
}

/**
 * Whether this version of the file was skipped before.
 *
 * @param {number} fileId - Nextcloud file id
 * @param {string} etag - Version of the file
 * @return {boolean} True when it is on the skip list
 */
export function isSkipped(fileId, etag) {
	return Object.hasOwn(readSkips(), entryKey(fileId, etag))
}

/**
 * Put this version of the file on the skip list, dropping the oldest entries past the cap.
 *
 * @param {number} fileId - Nextcloud file id
 * @param {string} etag - Version of the file
 */
export function markSkipped(fileId, etag) {
	try {
		const skips = readSkips()
		skips[entryKey(fileId, etag)] = Date.now()
		const keep = Object.entries(skips)
			.sort((a, b) => a[1] - b[1])
			.slice(-MAX_ENTRIES)
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(keep)))
	} catch (e) {
		// Storage unavailable: the file is simply tried again next time
	}
}

/**
 * Empty the skip list so every file is tried again.
 */
export function clearSkips() {
	try {
		window.localStorage.removeItem(STORAGE_KEY)
	} catch (e) {
		// Storage unavailable: nothing was kept
	}
}
