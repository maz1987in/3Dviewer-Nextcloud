/**
 * What can be done to a shared note beyond writing it: resolve it, reopen it, reply to it,
 * edit and delete those replies, and look up the people to mention.
 *
 * Loaded the first time one of these is used, by useSharedNotes. Each change goes to the
 * server first and the panel is drawn from its answer, so it never shows a state or a reply
 * the server did not accept; a note that is not saved yet, or whose model has been left
 * since, is not touched.
 */

import { logger } from '../utils/logger.js'

/**
 * @param {object} deps - what useSharedNotes lends: how it tells a note's model, takes the
 *   server's account of a note, draws its marker, and says that something went wrong
 * @param {Function} deps.contextOf - (item) => { api, gen }: the model the note belongs to
 * @param {Function} deps.isCurrent - (gen) => whether that model is still the one open
 * @param {Function} deps.applyReview - (item, note) => takes state, thread and mentions from the server
 * @param {Function} deps.applyLook - (kind, item) => draws the note's marker as its state asks
 * @param {Function} deps.notify - receives { type, title, message } toasts
 * @param {Function} deps.t - Nextcloud's translate function
 * @return {object} the actions
 */
export function createReviewActions({ contextOf, isCurrent, applyReview, applyLook, notify, t }) {
	/**
	 * Run one change against the server and say so if it fails.
	 *
	 * @param {object} item - the reactive list entry
	 * @param {string} failedTitle - what to tell the user when it did not work
	 * @param {Function} change - receives the review api and the note's id; its result is returned
	 * @return {Promise<*>} what the change returned, or null when it failed
	 */
	const run = async (item, failedTitle, change) => {
		const { api, gen } = contextOf(item)
		if (!Number.isSafeInteger(item.meta?.noteId)) { return null }
		try {
			return await change(await api.review(), item.meta.noteId)
		} catch (error) {
			logger.warn('noteReviewActions', 'Review change failed', { error: error?.message })
			if (isCurrent(gen)) {
				notify({ type: 'error', title: failedTitle, message: t('threedviewer', 'Try again in a moment.') })
			}
			return null
		}
	}

	return {
		/**
		 * Resolve a note, or open it again.
		 *
		 * @param {'annotation'|'measurement'} kind - the tool the item belongs to
		 * @param {object} item - the reactive list entry
		 * @param {'open'|'resolved'} state - what it should be
		 * @return {Promise<boolean>} whether the server accepted it
		 */
		async setState(kind, item, state) {
			const note = await run(item, t('threedviewer', 'The note was not changed'), (review, id) => review.setState(id, state))
			if (!note) { return false }
			applyReview(item, note)
			applyLook(kind, item)
			return true
		},

		/**
		 * @param {object} item - the reactive list entry
		 * @param {string} text - the reply, with the ids of the people it mentions
		 * @return {Promise<boolean>} whether the reply was saved
		 */
		async addReply(item, text) {
			const reply = await run(item, t('threedviewer', 'Reply not saved'), (review, id) => review.addReply(id, text))
			if (!reply) { return false }
			item.meta.replies = [...(item.meta.replies ?? []), reply]
			return true
		},

		async updateReply(item, replyId, text) {
			const reply = await run(item, t('threedviewer', 'Reply not saved'), (review, id) => review.updateReply(id, replyId, text))
			if (!reply) { return false }
			item.meta.replies = (item.meta.replies ?? []).map((existing) => (existing.id === replyId ? reply : existing))
			return true
		},

		async removeReply(item, replyId) {
			const done = await run(item, t('threedviewer', 'Reply not deleted'), async (review, id) => {
				await review.removeReply(id, replyId)
				return true
			})
			if (!done) { return false }
			item.meta.replies = (item.meta.replies ?? []).filter((existing) => existing.id !== replyId)
			return true
		},

		/**
		 * @param {object} item - the reactive list entry the person is typing in
		 * @param {string} search - what has been typed after the @
		 * @return {Promise<Array<{id: string, label: string}>>} who can be mentioned; none when the search fails
		 */
		async findPeople(item, search) {
			try {
				return await (await contextOf(item).api.review()).people(search)
			} catch (error) {
				logger.warn('noteReviewActions', 'People search failed', { error: error?.message })
				return []
			}
		},
	}
}
