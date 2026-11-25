/**
 * Shared annotations and measurements: loading them, and saving each change.
 *
 * useAnnotation and useMeasurement draw and edit; this composable is the only thing that
 * talks to the server. Each note is saved on its own — add, edit, delete — so two people
 * editing the same model never overwrite each other.
 *
 * Switching models mid-save is the tricky part: a create/update/delete started against one
 * model's api must finish against that same api even if load() has since moved on to another
 * model, and a load() that's been superseded by a newer one must never draw its results or
 * touch status/canEdit. Every server call therefore runs against the api (and "generation")
 * it started with, captured once and reused for every follow-up of that same operation — and
 * every point sent in that call is converted through the model root captured at the same time,
 * since getModelRoot() would otherwise hand a later follow-up the wrong model's transform.
 *
 * Review — a note's state, its thread of replies and the people its text mentions — rides on
 * the same item: `meta.state`, `meta.resolvedBy`, `meta.resolvedAt`, `meta.replies` and
 * `meta.mentions` are what the server sent, and every change to them goes to the server first
 * and is drawn from its answer, so the panel never shows a state the server did not accept.
 */

import { ref, readonly, toRaw } from 'vue'
import { pointToScene, sceneToModel, toPlain } from '../utils/noteSpace.js'
import { logger } from '../utils/logger.js'
import { expandMentions, markerLook } from '../utils/noteReview.js'

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
	// Whether resolved notes' markers are drawn (dimmed) rather than hidden
	const showResolved = ref(false)
	let api = null
	let generation = 0
	const textTimers = new Map()
	// The api, load generation, and model root each item was created or loaded under, so a
	// follow-up save/delete always targets the model it belongs to, even after load() moves on
	// to a different one (a different api, and a different transform to convert points through).
	const itemApi = new WeakMap()
	// The list entries the tools write to. The panel is handed `readonly()` views of them, and a
	// write through one is dropped without a word, so what the panel passes back is looked up
	// here before anything is changed on it. Keyed by the plain object underneath both.
	const liveItems = new WeakMap()
	const track = (item) => {
		liveItems.set(toRaw(item), item)
		return item
	}
	const live = (item) => liveItems.get(toRaw(item)) ?? item

	const tools = { annotation, measurement }

	// A note's text keeps the id of anyone it mentions; its label in the scene shows their name
	annotation.setLabelFormatter?.((item) => expandMentions(item.text, item.meta?.mentions))

	/** Draw a note's marker as its state asks: hidden once resolved, unless resolved notes are shown. */
	const applyLook = (kind, item) => tools[kind].setMarkerLook?.(item.id, markerLook(item, showResolved.value))

	/**
	 * Take what the server says about a note's review: its state and who resolved it, its
	 * thread, and the names of the people its text mentions.
	 *
	 * @param {object} item - the reactive list entry
	 * @param {object} note - a note as the API returns it
	 */
	const applyReview = (item, note) => {
		item.meta.state = note.state === 'resolved' ? 'resolved' : 'open'
		item.meta.resolvedBy = note.resolvedBy ?? null
		item.meta.resolvedAt = note.resolvedAt ?? null
		item.meta.replies = Array.isArray(note.replies) ? note.replies : []
		item.meta.mentions = isNames(note.mentions) ? note.mentions : {}
	}

	/** @param {*} value - written id => display name, as the server sends it; an empty one arrives as a list */
	const isNames = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

	const isCurrent = (gen) => gen === generation

	/**
	 * The server's type for an item: the measurement tool keeps distances and angles, and
	 * an angle is stored as a type of its own. A viewer from before angles lists only the
	 * types it knows, so it skips an angle rather than draw it as a distance between its
	 * first two points.
	 * @param {'annotation'|'measurement'} kind - the tool the item belongs to
	 * @param {object} item - the reactive list entry
	 * @return {'annotation'|'measurement'|'angle'} the note type
	 */
	const noteType = (kind, item) => (kind === 'measurement' && item.type === 'angle' ? 'angle' : kind)

	/**
	 * @param {'annotation'|'measurement'} kind - the note kind
	 * @param {object} item - the reactive list entry
	 * @param {?THREE.Object3D} [root] - the model root to convert through; defaults to the
	 *   model loaded right now, for the very first save of a brand-new item. Every follow-up
	 *   passes the root captured for that item so it keeps converting through its own model.
	 * @return {object} the payload to send to the notes API
	 */
	const payloadFor = (kind, item, root = getModelRoot()) => {
		const toModel = (p) => (root ? sceneToModel(p, root) : toPlain(p))
		if (kind === 'annotation') {
			return { space: 'model', point: toModel(item.point), text: item.text }
		}
		if (item.type === 'angle') {
			// Point, corner, point: the corner is the middle one
			return { space: 'model', points: [toModel(item.point1), toModel(item.vertex), toModel(item.point2)] }
		}
		return { space: 'model', points: [toModel(item.point1), toModel(item.point2)] }
	}

	const setStatusAfterSave = (gen) => {
		if (isCurrent(gen)) status.value = 'saved'
	}

	const failed = (item, title, gen) => {
		item.meta.saveState = 'failed'
		if (!isCurrent(gen)) return
		status.value = 'error'
		notify({
			type: 'error',
			title,
			message: t('threedviewer', 'Use Retry in the panel to try again.'),
		})
	}

	const remove = async (item) => {
		const { api: opApi, gen } = itemApi.get(item) ?? { api, gen: generation }
		try {
			await opApi.remove(item.meta.noteId)
		} catch (error) {
			logger.warn('useSharedNotes', 'Note delete failed', { error: error?.message })
			if (!isCurrent(gen)) return
			notify({
				type: 'error',
				title: t('threedviewer', 'Note not deleted'),
				message: t('threedviewer', 'It will reappear when the model is opened again.'),
			})
		}
	}

	const saveText = async (item) => {
		textTimers.delete(item.id)
		if (item.meta.deleted || item.meta.noteId === null) {
			return
		}
		const { api: opApi, gen, root } = itemApi.get(item) ?? { api, gen: generation, root: undefined }
		if (isCurrent(gen)) status.value = 'saving'
		try {
			const saved = await opApi.update(item.meta.noteId, payloadFor('annotation', item, root))
			item.meta.saveState = 'saved'
			// The names of whoever the text now mentions, for the label in the scene
			if (isNames(saved?.mentions) && Object.keys(saved.mentions).length > 0) {
				item.meta.mentions = { ...item.meta.mentions, ...saved.mentions }
				annotation.refreshAnnotationLabel?.(item.id)
			}
			setStatusAfterSave(gen)
		} catch (error) {
			logger.warn('useSharedNotes', 'Note update failed', { error: error?.message })
			if (item.meta.deleted) {
				return
			}
			failed(item, t('threedviewer', 'Change not saved'), gen)
		}
	}

	const scheduleText = (item) => {
		clearTimeout(textTimers.get(item.id)?.timer)
		const timer = setTimeout(() => { saveText(item) }, TEXT_SAVE_DEBOUNCE_MS)
		textTimers.set(item.id, { timer, item })
	}

	/** Send pending text edits against the api they were typed under, before load() moves on. */
	const flushPendingBeforeSwitch = () => {
		const pending = [...textTimers.values()]
		for (const { timer, item } of pending) {
			clearTimeout(timer)
			saveText(item)
		}
	}

	const create = async (kind, item) => {
		// A retry reuses the api/generation/root the item was first created under; a brand-new
		// item captures them now, from whatever is current.
		const existing = itemApi.get(item)
		const opApi = existing ? existing.api : api
		const gen = existing ? existing.gen : generation
		const root = existing ? existing.root : getModelRoot()
		if (!existing) {
			itemApi.set(item, { api: opApi, gen, root })
		}
		item.meta.saveState = 'saving'
		if (isCurrent(gen)) status.value = 'saving'
		const sent = kind === 'annotation' ? item.text : null
		try {
			const note = await opApi.create(noteType(kind, item), payloadFor(kind, item, root))
			item.meta.noteId = note.id
			item.meta.author = note.author ?? null
			applyReview(item, note)
			item.meta.saveState = 'saved'
			setStatusAfterSave(gen)
			if (item.meta.deleted) {
				await remove(item)
				return
			}
			if (kind === 'annotation' && item.text !== sent) {
				scheduleText(item)
			}
		} catch (error) {
			logger.warn('useSharedNotes', 'Note save failed', { type: noteType(kind, item), error: error?.message })
			if (item.meta.deleted) {
				return
			}
			failed(item, t('threedviewer', 'Note not saved'), gen)
		}
	}

	const hooksFor = (kind) => ({
		added(item) {
			track(item)
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

	const place = (note, root, saveState, notesApi, gen) => {
		const meta = {
			noteId: typeof note.id === 'number' ? note.id : null,
			author: note.author ?? null,
			saveState,
			state: note.state === 'resolved' ? 'resolved' : 'open',
			resolvedBy: note.resolvedBy ?? null,
			resolvedAt: note.resolvedAt ?? null,
			replies: Array.isArray(note.replies) ? note.replies : [],
			mentions: isNames(note.mentions) ? note.mentions : {},
		}
		const { payload } = note
		if (note.type === 'annotation') {
			const item = track(annotation.addAnnotationFromNote(pointToScene(payload.point, payload.space, root), payload.text, meta))
			itemApi.set(item, { api: notesApi, gen, root })
			applyLook('annotation', item)
			if (payload.space === 'scene' && saveState === 'saved' && root) {
				// A migrated pre-3.6 annotation: save it back in model space, once. Uses the
				// api and root this load started with, not whatever load() may have moved on
				// to since.
				notesApi.update(meta.noteId, payloadFor('annotation', item, root)).catch((error) => {
					logger.warn('useSharedNotes', 'Legacy note conversion failed; retried on next open', { error: error?.message })
				})
			}
		} else if (note.type === 'measurement') {
			const item = track(measurement.addMeasurementFromNote(
				pointToScene(payload.points[0], payload.space, root),
				pointToScene(payload.points[1], payload.space, root),
				meta,
			))
			itemApi.set(item, { api: notesApi, gen, root })
			applyLook('measurement', item)
		} else if (note.type === 'angle') {
			const item = track(measurement.addAngleFromNote(
				pointToScene(payload.points[0], payload.space, root),
				pointToScene(payload.points[1], payload.space, root),
				pointToScene(payload.points[2], payload.space, root),
				meta,
			))
			itemApi.set(item, { api: notesApi, gen, root })
			applyLook('measurement', item)
		}
	}

	/**
	 * Replace whatever is drawn with the notes of the model now loaded.
	 *
	 * @param {object} notesApi - from createNotesApi()
	 */
	const load = async (notesApi) => {
		const gen = ++generation

		// Save pending edits against the model being left, then stop tracking them locally.
		flushPendingBeforeSwitch()
		// Silent: these belong to the previous model and must not be deleted on the server.
		annotation.clearAllAnnotations({ silent: true })
		measurement.clearAllMeasurements({ silent: true })

		api = notesApi
		canEdit.value = false
		annotation.setCanAdd(false)
		status.value = 'loading'

		let data
		try {
			data = await notesApi.list()
		} catch (error) {
			logger.warn('useSharedNotes', 'Loading notes failed', { error: error?.message })
			if (!isCurrent(gen)) return
			status.value = 'error'
			notify({
				type: 'error',
				title: t('threedviewer', 'Notes not loaded'),
				message: t('threedviewer', 'Shared annotations and measurements could not be loaded.'),
			})
			return
		}

		// A newer load() has since taken over; drawing this one's results would put the
		// previous model's notes onto the current one.
		if (!isCurrent(gen)) return

		canEdit.value = data.canEdit
		annotation.setCanAdd(data.canEdit)
		const root = getModelRoot()
		for (const note of data.notes) place(note, root, data.canEdit ? 'saved' : 'shared', notesApi, gen)
		for (const note of data.private) place(note, root, 'private', notesApi, gen)
		status.value = data.canEdit ? 'saved' : 'readonly'
	}

	const retry = async (kind, view) => {
		// The panel passes a read-only view: the save must change the note itself, or a retry
		// that succeeds leaves it unsaved and the next one creates it again
		const item = live(view)
		if (item.meta.saveState === 'saving') {
			// Already in flight; retrying now would send a duplicate create.
			return
		}
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

	/**
	 * Draw every resolved note's marker, or hide them.
	 *
	 * @param {boolean} value - whether resolved notes' markers are shown (dimmed)
	 */
	const setShowResolved = (value) => {
		showResolved.value = value === true
		for (const item of annotation.annotations?.value ?? []) applyLook('annotation', item)
		for (const item of measurement.measurements?.value ?? []) applyLook('measurement', item)
	}

	/** The api and generation a note's follow-ups run against: the model it was loaded or made on. */
	const contextOf = (item) => itemApi.get(item) ?? { api, gen: generation }

	// Resolving, replying and looking up people are loaded the first time one is used: only
	// someone who opens a note's thread ever does, and none of it is needed to draw the notes.
	let actions = null
	const reviewActions = () => {
		actions ??= import('./noteReviewActions.js').then((module) => module.createReviewActions({
			contextOf, isCurrent, applyReview, applyLook, notify, t,
		})).catch((error) => {
			// A chunk that failed to load is tried again the next time, not remembered as failed
			actions = null
			throw error
		})
		return actions
	}
	// What the panel passes in is a read-only view of the note; what is changed is the note itself
	const viaActions = (name, itemAt) => async (...args) => {
		args[itemAt] = live(args[itemAt])
		return (await reviewActions())[name](...args)
	}

	/**
	 * Remember who an id in a note's text stands for, so its label in the scene can name them.
	 *
	 * @param {object} item - the reactive list entry
	 * @param {object} names - id => display name
	 */
	const learnMentions = (item, names) => {
		const entry = live(item)
		entry.meta.mentions = { ...entry.meta.mentions, ...names }
		annotation.refreshAnnotationLabel?.(entry.id)
	}

	return {
		status: readonly(status),
		canEdit: readonly(canEdit),
		showResolved: readonly(showResolved),
		setShowResolved,
		// Each resolves with whether the server accepted it; see noteReviewActions.js
		setState: viaActions('setState', 1),
		addReply: viaActions('addReply', 0),
		updateReply: viaActions('updateReply', 0),
		removeReply: viaActions('removeReply', 0),
		findPeople: viaActions('findPeople', 0),
		learnMentions,
		load,
		retry,
		discard,
		flush,
	}
}
