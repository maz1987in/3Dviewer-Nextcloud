/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Writing a file into the logged-in user's Nextcloud folders, through WebDAV, with
 * Nextcloud's own permission checks. Asking first whether a folder takes new files lets
 * the viewer offer "Save next to the model" only where it would work: a folder shared
 * read-only has no `C` (create) in its permissions.
 */

import axios from '@nextcloud/axios'
import { generateRemoteUrl } from '@nextcloud/router'

const DAV = 'DAV:'
const OC = 'http://owncloud.org/ns'

/**
 * A path in the user's files, as a WebDAV URL.
 *
 * @param {string} userId - The logged-in user
 * @param {string} path - A path from the root of their files, e.g. `/models/cube.stl`
 * @return {string} The URL, every segment encoded
 */
export function userFilesUrl(userId, path) {
	const encoded = String(path || '/').split('/').map((segment) => encodeURIComponent(segment)).join('/')
	return `${generateRemoteUrl('dav')}/files/${encodeURIComponent(userId)}${encoded.startsWith('/') ? '' : '/'}${encoded}`
}

/**
 * @param {string} userId - The logged-in user
 * @param {string} path - The folder
 * @param {string} depth - '0' for the folder, '1' for what is in it
 * @param {string} props - The props to ask for, as XML
 * @return {Promise<Document>} The multistatus response
 */
async function propfind(userId, path, depth, props) {
	const response = await axios.request({
		method: 'PROPFIND',
		url: userFilesUrl(userId, path),
		headers: { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' },
		data: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>${props}</d:prop></d:propfind>`,
		responseType: 'text',
	})
	return new DOMParser().parseFromString(response.data, 'application/xml')
}

/**
 * Whether the user may create files in a folder.
 *
 * @param {string} userId - The logged-in user
 * @param {string} dirPath - The folder
 * @return {Promise<boolean>} True only when its permissions include create; false on any error
 */
export async function canCreateIn(userId, dirPath) {
	try {
		const doc = await propfind(userId, dirPath, '0', '<oc:permissions/>')
		const permissions = doc.getElementsByTagNameNS(OC, 'permissions')[0]?.textContent ?? ''
		return permissions.includes('C')
	} catch (error) {
		return false
	}
}

/**
 * The names of what is in a folder.
 *
 * @param {string} userId - The logged-in user
 * @param {string} dirPath - The folder
 * @return {Promise<string[]>} Its entries' names, the folder itself left out
 */
export async function listNames(userId, dirPath) {
	const doc = await propfind(userId, dirPath, '1', '<d:displayname/>')
	const names = []
	for (const response of doc.getElementsByTagNameNS(DAV, 'response')) {
		const href = response.getElementsByTagNameNS(DAV, 'href')[0]?.textContent ?? ''
		// The folder's own entry ends in a slash
		if (href.endsWith('/')) {
			continue
		}
		const shown = response.getElementsByTagNameNS(DAV, 'displayname')[0]?.textContent
		names.push(shown || decodeURIComponent(href.split('/').pop()))
	}
	return names
}

/**
 * Write a file into a folder, replacing nothing the caller did not mean to: pick a free
 * name first (listNames).
 *
 * @param {string} userId - The logged-in user
 * @param {string} dirPath - The folder
 * @param {string} name - The file name
 * @param {Blob} blob - The content
 * @return {Promise<void>} Rejects when the server refuses it (no space, no permission)
 */
export async function putFile(userId, dirPath, name, blob) {
	const path = `${String(dirPath || '').replace(/\/+$/, '')}/${name}`
	await axios.put(userFilesUrl(userId, path), blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } })
}
