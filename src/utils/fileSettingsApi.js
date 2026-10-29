/**
 * The routes for a model's shared settings, signed in and on a public link.
 *
 * `@nextcloud/axios` attaches the request token, which the signed-in routes require.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'
import { FILE_UNITS } from './sourceUnits.js'

/**
 * @param {object} data - A response body
 * @param {boolean} readOnly - Whether the caller is on a public link
 * @return {{canEdit: boolean, unit: ?string}} The answer, with anything unknown dropped
 */
function settingsFrom(data, readOnly) {
	const unit = data?.unit
	return {
		canEdit: !readOnly && data?.canEdit === true,
		unit: typeof unit === 'string' && Object.hasOwn(FILE_UNITS, unit) ? unit : null,
	}
}

/**
 * @param {object} options - API configuration
 * @param {number|string} options.fileId - the model's file id
 * @param {?string} [options.shareToken] - set on a public share page
 * @return {object} the API client
 */
export function createFileSettingsApi({ fileId, shareToken = null }) {
	const base = generateUrl('/apps/threedviewer/api/file-settings/{fileId}', { fileId })
	const readOnly = shareToken !== null

	return {
		readOnly,

		async get() {
			if (readOnly) {
				const url = generateOcsUrl('apps/threedviewer/public/file-settings/{token}/{fileId}', { token: shareToken, fileId })
				const { data } = await axios.get(url, { headers: { 'OCS-APIRequest': 'true' } })
				return settingsFrom(data, true)
			}
			const { data } = await axios.get(base)
			return settingsFrom(data, false)
		},

		/**
		 * @param {?string} unit - A key of FILE_UNITS, or null for the format's default
		 * @return {Promise<{canEdit: boolean, unit: ?string}>} What the server now holds
		 */
		async setUnit(unit) {
			if (readOnly) {
				throw new Error('The unit is read-only on a public link')
			}
			const { data } = await axios.put(base, { unit })
			return settingsFrom(data, false)
		},
	}
}
