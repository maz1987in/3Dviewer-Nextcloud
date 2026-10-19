/**
 * The notes routes, signed in and on a public link.
 *
 * `@nextcloud/axios` attaches the request token, which every signed-in notes route
 * requires — the read as well, because it runs the migration of private annotations.
 */

import axios from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'

/**
 * @param {object} options - API configuration
 * @param {number|string} options.fileId - the model's file id
 * @param {?string} [options.shareToken] - set on a public share page
 * @return {object} the API client
 */
export function createNotesApi({ fileId, shareToken = null }) {
	const base = generateUrl('/apps/threedviewer/api/notes/{fileId}', { fileId })
	const readOnly = shareToken !== null

	const refuseOnPublicLink = () => {
		if (readOnly) {
			throw new Error('Notes are read-only on a public link')
		}
	}

	return {
		readOnly,

		async list() {
			if (readOnly) {
				const url = generateOcsUrl('apps/threedviewer/public/notes/{token}/{fileId}', { token: shareToken, fileId })
				const { data } = await axios.get(url, { headers: { 'OCS-APIRequest': 'true' } })
				return { canEdit: false, notes: Array.isArray(data?.notes) ? data.notes : [], private: [] }
			}
			const { data } = await axios.get(base)
			return {
				canEdit: data?.canEdit === true,
				notes: Array.isArray(data?.notes) ? data.notes : [],
				private: Array.isArray(data?.private) ? data.private : [],
			}
		},

		async create(type, payload) {
			refuseOnPublicLink()
			const { data } = await axios.post(base, { type, payload })
			return data
		},

		async update(noteId, payload) {
			refuseOnPublicLink()
			const { data } = await axios.patch(`${base}/${noteId}`, { payload })
			return data
		},

		async remove(noteId) {
			refuseOnPublicLink()
			await axios.delete(`${base}/${noteId}`)
		},
	}
}
