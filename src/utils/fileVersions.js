/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * A file's earlier versions, read from Nextcloud's `versions` WebDAV collection.
 *
 * The collection is the logged-in user's own: a share recipient lists and downloads
 * through `versions/<their id>/versions/<fileId>`, and the owner's collection answers
 * them with 403. It lists the current version as well, under an id equal to the file's
 * modified time in seconds, so that entry is left out here. What each server version
 * returns is recorded in docs/TECHNICAL.md ("File Versions").
 */

import axios from '@nextcloud/axios'
import { generateRemoteUrl } from '@nextcloud/router'

const DAV = 'DAV:'
const NC = 'http://nextcloud.org/ns'

const PROPFIND_BODY = '<?xml version="1.0"?>'
	+ '<d:propfind xmlns:d="DAV:" xmlns:nc="http://nextcloud.org/ns">'
	+ '<d:prop><d:getlastmodified/><d:getcontentlength/><d:getcontenttype/><nc:version-label/><nc:version-author/></d:prop>'
	+ '</d:propfind>'

/**
 * @typedef {object} Version
 * @property {string} id - The version's id: its timestamp in Unix seconds
 * @property {string} url - Where to GET its bytes
 * @property {number} mtime - When it was made, in milliseconds
 * @property {number} size - Its size in bytes
 * @property {?string} label - The name a user gave it, if any
 * @property {?string} author - The id of the user who made it, if known
 */

/**
 * The versions collection of a file, for the user who is asking.
 *
 * @param {string} userId - The logged-in user
 * @param {number|string} fileId - The file
 * @return {string} The collection's URL
 */
export function versionsUrl(userId, fileId) {
	return `${generateRemoteUrl('dav')}/versions/${encodeURIComponent(userId)}/versions/${fileId}`
}

/**
 * The text of the first element with this namespace and local name under `parent`.
 *
 * @param {Element} parent - Where to look
 * @param {string} ns - Namespace URI
 * @param {string} name - Local name
 * @return {?string} The trimmed text, or null when absent or empty
 */
function textOf(parent, ns, name) {
	const element = parent.getElementsByTagNameNS(ns, name)[0]
	const text = element?.textContent?.trim()
	return text ? text : null
}

/**
 * The earlier versions in a PROPFIND response, newest first.
 *
 * @param {string} xmlText - The multistatus body
 * @param {object} [options] - Options
 * @param {?number} [options.currentMtime] - The file's modified time in milliseconds; the
 *   version with that timestamp is the current one. Without it the newest is.
 * @return {Version[]} The earlier versions
 */
export function parseVersions(xmlText, { currentMtime = null } = {}) {
	const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
	const versions = []
	for (const response of doc.getElementsByTagNameNS(DAV, 'response')) {
		const href = textOf(response, DAV, 'href')
		const id = href?.replace(/\/+$/, '').split('/').pop()
		// The collection's own entry ends in a slash and carries no version props
		if (!href || href.endsWith('/') || !/^\d+$/.test(id)) {
			continue
		}
		const modified = Date.parse(textOf(response, DAV, 'getlastmodified') ?? '')
		versions.push({
			id,
			url: href,
			mtime: Number.isFinite(modified) ? modified : Number(id) * 1000,
			size: Number(textOf(response, DAV, 'getcontentlength') ?? 0),
			label: textOf(response, NC, 'version-label'),
			author: textOf(response, NC, 'version-author'),
		})
	}
	versions.sort((a, b) => b.mtime - a.mtime)

	if (currentMtime === null) {
		return versions.slice(1)
	}
	const currentId = String(Math.floor(currentMtime / 1000))
	return versions.filter(version => version.id !== currentId)
}

/**
 * The earlier versions of a file. A server without the Versions app, or a file it does
 * not know, has none.
 *
 * @param {object} options - Options
 * @param {string} options.userId - The logged-in user
 * @param {number|string} options.fileId - The file
 * @param {?number} [options.currentMtime] - The file's modified time in milliseconds
 * @param {AbortSignal} [options.signal] - Cancels the request
 * @return {Promise<Version[]>} The earlier versions, newest first
 */
export async function listVersions({ userId, fileId, currentMtime = null, signal }) {
	try {
		const response = await axios.request({
			method: 'PROPFIND',
			url: versionsUrl(userId, fileId),
			headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
			data: PROPFIND_BODY,
			responseType: 'text',
			signal,
		})
		return parseVersions(response.data, { currentMtime })
	} catch (error) {
		const status = error?.response?.status
		if (status === 404 || status === 405) {
			return []
		}
		throw error
	}
}

/**
 * The bytes of one version.
 *
 * @param {Version} version - The version
 * @param {object} [options] - Options
 * @param {AbortSignal} [options.signal] - Cancels the download
 * @return {Promise<ArrayBuffer>} Its content
 */
export async function fetchVersion(version, { signal } = {}) {
	const response = await axios.get(version.url, { responseType: 'arraybuffer', signal })
	return response.data
}
