/**
 * The public links of a model, from Nextcloud's sharing API.
 *
 * Asked with `reshares=false`, the API returns the shares this user made of the file:
 * the ones they manage. Only link shares (type 3) reach someone without an account, so
 * those are the ones a view or an embed code can be built on.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl } from '@nextcloud/router'
import { saveFolder } from './turntable.js'

const LINK_SHARE = 3

/**
 * @typedef {object} LinkShare
 * @property {string} id
 * @property {string} token
 * @property {string} url - the share's public address
 * @property {string} label - as its owner named it; may be empty
 * @property {number} created - Unix seconds
 * @property {boolean} hasPassword
 * @property {number|null} expires - milliseconds, or null for never
 * @property {boolean} canDownload
 * @property {boolean} isFile - a share of the file itself, not of a folder holding it
 * @property {boolean} canRead - false for an upload-only (file drop) link
 */

/**
 * The link shares this user made of the file at `path`. Empty when there are none, and
 * when the API can't be reached: the caller then simply offers no public link.
 *
 * @param {string} path - the file's path in the user's files, from the root
 * @return {Promise<LinkShare[]>}
 */
export async function listLinkShares(path) {
	try {
		const { data } = await axios.get(generateOcsUrl('apps/files_sharing/api/v1/shares'), {
			params: { path, reshares: false, subfiles: false, format: 'json' },
			headers: { 'OCS-APIRequest': 'true' },
		})
		const shares = data?.ocs?.data
		if (!Array.isArray(shares)) return []
		return shares.filter((share) => share.share_type === LINK_SHARE).map((share) => ({
			id: String(share.id),
			token: share.token,
			url: share.url,
			label: share.label || '',
			created: share.stime,
			hasPassword: !!share.password,
			// "2026-12-01 00:00:00", in the server's time zone; read as local, near enough
			// for a list that only drops what has expired
			expires: share.expiration ? Date.parse(share.expiration.replace(' ', 'T')) : null,
			canDownload: !share.hide_download,
			isFile: share.item_type === 'file',
			canRead: (share.permissions & 1) === 1,
		}))
	} catch {
		return []
	}
}

/**
 * The shares worth offering: not expired, newest first.
 *
 * @param {LinkShare[]} shares
 * @param {number} [now] - milliseconds
 * @return {LinkShare[]}
 */
export function pickableShares(shares, now = Date.now()) {
	return shares
		.filter((share) => share.expires === null || share.expires > now)
		.sort((a, b) => b.created - a.created)
}

/**
 * The model's path in the user's files, as the sharing API takes it.
 *
 * @param {?string} dir - the folder the viewer was given
 * @param {?string} filename - the model's name, or its path
 * @return {?string} null when the file is unknown
 */
export function modelPath(dir, filename) {
	if (!filename) return null
	const folder = saveFolder(dir, filename) ?? ''
	const name = String(filename).split('/').filter(Boolean).pop()
	return '/' + [...folder.split('/'), name].filter(Boolean).join('/')
}
