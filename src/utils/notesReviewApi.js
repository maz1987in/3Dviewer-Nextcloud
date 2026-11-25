/**
 * The routes of note review: a note's state, the replies under it, and the people to offer
 * for an @. Signed in only — on a public link notes are read-only, states and replies
 * included, so nothing here is reachable there.
 *
 * Kept apart from notesApi.js, which loads with every model, because none of it is needed
 * until someone resolves a note, replies, or types an @.
 */

import axios from '@nextcloud/axios'

/**
 * @param {string} base - the model's notes route, from createNotesApi
 * @param {boolean} readOnly - true on a public link, which refuses every call
 * @return {object} the review API client
 */
export function createReviewApi(base, readOnly) {
	const refuseOnPublicLink = () => {
		if (readOnly) {
			throw new Error('Notes are read-only on a public link')
		}
	}

	return {
		/**
		 * Resolve a note or open it again.
		 *
		 * @param {number} noteId - the note
		 * @param {'open'|'resolved'} state - what it should be
		 * @return {Promise<object>} the note as it is now, with its thread
		 */
		async setState(noteId, state) {
			refuseOnPublicLink()
			const { data } = await axios.patch(`${base}/${noteId}/state`, { state })
			return data
		},

		async addReply(noteId, text) {
			refuseOnPublicLink()
			const { data } = await axios.post(`${base}/${noteId}/replies`, { text })
			return data
		},

		async updateReply(noteId, replyId, text) {
			refuseOnPublicLink()
			const { data } = await axios.patch(`${base}/${noteId}/replies/${replyId}`, { text })
			return data
		},

		async removeReply(noteId, replyId) {
			refuseOnPublicLink()
			await axios.delete(`${base}/${noteId}/replies/${replyId}`)
		},

		/**
		 * The people to offer when someone types an @: those who can open this model.
		 *
		 * @param {string} search - what has been typed after the @
		 * @return {Promise<Array<{id: string, label: string}>>}
		 */
		async people(search) {
			refuseOnPublicLink()
			const { data } = await axios.get(`${base}/people`, { params: { search } })
			return Array.isArray(data?.people) ? data.people : []
		},
	}
}
