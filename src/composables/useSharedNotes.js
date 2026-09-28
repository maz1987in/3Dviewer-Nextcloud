/**
 * Shared annotations and measurements: loading them, and saving each change.
 *
 * useAnnotation and useMeasurement draw and edit; this composable is the only thing that
 * talks to the server. Each note is saved on its own — add, edit, delete — so two people
 * editing the same model never overwrite each other.
 */

import { ref, readonly } from 'vue'
import { pointToScene, sceneToModel, toPlain } from '../utils/noteSpace.js'
import { logger } from '../utils/logger.js'

export const TEXT_SAVE_DEBOUNCE_MS = 600

const fallbackT = (_app, text, vars = {}) => text.replace(/{(\w+)}/g, (_, k) => String(vars[k] ?? ''))

/**
 * @param {object} deps
 * @param {object} deps.annotation - the useAnnotation() instance
 * @param {object} deps.measurement - the useMeasurement() instance
 * @param {Function} deps.getModelRoot - returns the loaded model's root, or null
 * @param {Function} [deps.notify] - receives { type, title, message } toasts
 * @param {Function} [deps.t] - Nextcloud's translate function
 * @return {object} the shared-notes controller
 */
export function useSharedNotes({ annotation, measurement, getModelRoot, notify = () => {}, t = fallbackT }) {
	const status = ref('idle')
	const canEdit = ref(false)
	let api = null
	const textTimers = new Map()

	const tools = { annotation, measurement }

	const payloadFor = (kind, item) => {
		const root = getModelRoot()
		const toModel = (p) => (root ? sceneToModel(p, root) : toPlain(p))
		if (kind === 'annotation') {
			return { space: 'model', point: toModel(item.point), text: item.text }
		}
		return { space: 'model', points: [toModel(item.point1), toModel(item.point2)] }
	}

	const setStatusAfterSave = () => {
		status.value = 'saved'
	}

	const failed = (item, title) => {
		item.meta.saveState = 'failed'
		status.value = 'error'
		notify({
			type: 'error',
			title,
			message: t('threedviewer', 'Use Retry in the panel to try again.'),
		})
	}

	const create = async (kind, item) => {
		item.meta.saveState = 'saving'
		status.value = 'saving'
		const sent = kind === 'annotation' ? item.text : null
		try {
			const note = await api.create(kind, payloadFor(kind, item))
			item.meta.noteId = note.id
			item.meta.author = note.author ?? null
			item.meta.saveState = 'saved'
			setStatusAfterSave()
			if (item.meta.deleted) {
				await remove(item)
				return
			}
			if (kind === 'annotation' && item.text !== sent) {
				scheduleText(item)
			}
		} catch (error) {
			logger.warn('useSharedNotes', 'Note save failed', { kind, error: error?.message })
			if (item.meta.deleted) {
				return
			}
			failed(item, t('threedviewer', 'Note not saved'))
		}
	}

	const saveText = async (item) => {
		textTimers.delete(item.id)
		if (item.meta.deleted || item.meta.noteId === null) {
			return
		}
		status.value = 'saving'
		try {
			await api.update(item.meta.noteId, payloadFor('annotation', item))
			item.meta.saveState = 'saved'
			setStatusAfterSave()
		} catch (error) {
			logger.warn('useSharedNotes', 'Note update failed', { error: error?.message })
			failed(item, t('threedviewer', 'Change not saved'))
		}
	}

	const scheduleText = (item) => {
		clearTimeout(textTimers.get(item.id)?.timer)
		const timer = setTimeout(() => { saveText(item) }, TEXT_SAVE_DEBOUNCE_MS)
		textTimers.set(item.id, { timer, item })
	}

	const remove = async (item) => {
		try {
			await api.remove(item.meta.noteId)
		} catch (error) {
			logger.warn('useSharedNotes', 'Note delete failed', { error: error?.message })
			notify({
				type: 'error',
				title: t('threedviewer', 'Note not deleted'),
				message: t('threedviewer', 'It will reappear when the model is opened again.'),
			})
		}
	}

	const hooksFor = (kind) => ({
		added(item) {
			if (!canEdit.value) {
				item.meta.saveState = 'local'
				return
			}
			create(kind, item)
		},
		changed(item) {
			if (!canEdit.value || ['local', 'private'].includes(item.meta.saveState)) {
				return
			}
			// Still being created: create() sends the latest text once the id arrives.
			if (item.meta.noteId === null) {
				return
			}
			scheduleText(item)
		},
		deleted(item) {
			item.meta.deleted = true
			clearTimeout(textTimers.get(item.id)?.timer)
			textTimers.delete(item.id)
			if (!canEdit.value || item.meta.noteId === null) {
				// A note still saving is removed by create() once its id comes back.
				return
			}
			remove(item)
		},
	})

	annotation.setNoteHooks(hooksFor('annotation'))
	measurement.setNoteHooks(hooksFor('measurement'))

	const place = (note, root, saveState) => {
		const meta = { noteId: typeof note.id === 'number' ? note.id : null, author: note.author ?? null, saveState }
		const { payload } = note
		if (note.type === 'annotation') {
			const item = annotation.addAnnotationFromNote(pointToScene(payload.point, payload.space, root), payload.text, meta)
			if (payload.space === 'scene' && saveState === 'saved' && root) {
				// A migrated pre-3.6 annotation: save it back in model space, once.
				api.update(meta.noteId, payloadFor('annotation', item)).catch((error) => {
					logger.warn('useSharedNotes', 'Legacy note conversion failed; retried on next open', { error: error?.message })
				})
			}
		} else if (note.type === 'measurement') {
			measurement.addMeasurementFromNote(
				pointToScene(payload.points[0], payload.space, root),
				pointToScene(payload.points[1], payload.space, root),
				meta,
			)
		}
	}

	/**
	 * Replace whatever is drawn with the notes of the model now loaded.
	 *
	 * @param {object} notesApi - from createNotesApi()
	 */
	const load = async (notesApi) => {
		for (const { timer } of textTimers.values()) clearTimeout(timer)
		textTimers.clear()
		// Silent: these belong to the previous model and must not be deleted on the server.
		annotation.clearAllAnnotations({ silent: true })
		measurement.clearAllMeasurements({ silent: true })

		api = notesApi
		canEdit.value = false
		annotation.setCanAdd(false)
		status.value = 'loading'

		let data
		try {
			data = await api.list()
		} catch (error) {
			logger.warn('useSharedNotes', 'Loading notes failed', { error: error?.message })
			status.value = 'error'
			return
		}

		canEdit.value = data.canEdit
		annotation.setCanAdd(data.canEdit)
		const root = getModelRoot()
		for (const note of data.notes) place(note, root, data.canEdit ? 'saved' : 'shared')
		for (const note of data.private) place(note, root, 'private')
		status.value = data.canEdit ? 'saved' : 'readonly'
	}

	const retry = async (kind, item) => {
		if (item.meta.noteId === null) {
			await create(kind, item)
		} else {
			await saveText(item)
		}
	}

	const discard = (kind, item) => {
		const tool = tools[kind]
		if (kind === 'annotation') {
			tool.deleteAnnotation(item.id, { silent: true })
		} else {
			tool.deleteMeasurement(item.id, { silent: true })
		}
	}

	/** Save pending text edits now rather than after the debounce. */
	const flush = async () => {
		const pending = [...textTimers.values()]
		for (const { timer } of pending) clearTimeout(timer)
		await Promise.all(pending.map(({ item }) => saveText(item)))
	}

	return {
		status: readonly(status),
		canEdit: readonly(canEdit),
		load,
		retry,
		discard,
		flush,
	}
}
