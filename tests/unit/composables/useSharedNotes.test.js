const THREE = require('three')
const { reactive, readonly } = require('vue')
const { useSharedNotes, TEXT_SAVE_DEBOUNCE_MS } = require('../../../src/composables/useSharedNotes.js')

/*
 * Stand-ins for useAnnotation / useMeasurement that behave like the real list: items
 * live in a reactive array, hooks fire on user actions, and the note entry points and
 * `silent` options never fire hooks.
 */
function fakeTool(kind) {
	let hooks = {}
	let seq = 0
	const items = reactive([])
	const make = (fields, meta) => {
		items.push({ id: `${kind}-${++seq}`, ...fields, meta: meta ?? { noteId: null, author: null, saveState: 'new' } })
		return items[items.length - 1]
	}
	const remove = (id, { silent = false } = {}) => {
		const i = items.findIndex(x => x.id === id)
		if (i === -1) return
		if (!silent) hooks.deleted?.(items[i])
		items.splice(i, 1)
	}
	return {
		items,
		canAdd: true,
		setCanAdd(v) { this.canAdd = v },
		setNoteHooks: (h) => { hooks = h },
		addAnnotationFromNote: (point, text, meta) => make({ point, text }, meta),
		addMeasurementFromNote: (p1, p2, meta) => make({ type: 'distance', point1: p1, point2: p2 }, meta),
		addAngleFromNote: (p1, vertex, p2, meta) => make({ type: 'angle', point1: p1, vertex, point2: p2 }, meta),
		userAdd: (fields) => { const item = make(fields); hooks.added?.(item); return item },
		userEditText: (item, text) => { item.text = text; hooks.changed?.(item) },
		deleteAnnotation: remove,
		deleteMeasurement: remove,
		annotations: { value: items },
		measurements: { value: items },
		looks: new Map(),
		setMarkerLook(id, look) { this.looks.set(id, look) },
		setLabelFormatter(fn) { this.labelFormatter = fn },
		refreshAnnotationLabel: jest.fn(),
		userDelete: (item) => remove(item.id),
		clearAllAnnotations: ({ silent = false } = {}) => { [...items].forEach(i => remove(i.id, { silent })) },
		clearAllMeasurements: ({ silent = false } = {}) => { [...items].forEach(i => remove(i.id, { silent })) },
	}
}

function fakeApi(overrides = {}) {
	let next = 100
	return {
		readOnly: false,
		list: jest.fn().mockResolvedValue({ canEdit: true, notes: [], private: [] }),
		create: jest.fn().mockImplementation(async () => ({ id: next++, author: { uid: 'alice', displayName: 'Alice' } })),
		update: jest.fn().mockResolvedValue({}),
		remove: jest.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

function setup() {
	const annotation = fakeTool('a')
	const measurement = fakeTool('m')
	const notify = jest.fn()
	const root = new THREE.Group()
	root.position.set(10, 0, 0)
	const notes = useSharedNotes({ annotation, measurement, getModelRoot: () => root, notify })
	return { annotation, measurement, notify, root, notes }
}

/*
 * Like setup(), but getModelRoot() reads a variable the test can swap out — so a test can tell
 * whether a follow-up save converted its point through the model it started on (rootA) or
 * whatever model happens to be loaded when the follow-up actually runs (rootB).
 */
function setupSwappableRoot() {
	const annotation = fakeTool('a')
	const measurement = fakeTool('m')
	const notify = jest.fn()
	const state = { root: new THREE.Group() }
	state.root.position.set(10, 0, 0)
	const notes = useSharedNotes({ annotation, measurement, getModelRoot: () => state.root, notify })
	return { annotation, measurement, notify, notes, state }
}

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => jest.useRealTimers())

test('load draws shared notes in scene space and reports edit rights', async () => {
	const { annotation, measurement, notes } = setup()
	const api = fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: false,
			notes: [
				{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'Hole' }, author: { uid: 'bob', displayName: 'Bob' } },
				{ id: 2, type: 'measurement', payload: { space: 'model', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] }, author: null },
			],
			private: [],
		}),
	})

	await notes.load(api)

	expect(annotation.items[0].point.x).toBeCloseTo(11)
	expect(annotation.items[0].meta).toMatchObject({ noteId: 1, saveState: 'shared', author: { displayName: 'Bob' } })
	expect(measurement.items[0].point2.y).toBeCloseTo(1)
	expect(annotation.canAdd).toBe(false)
	expect(notes.canEdit.value).toBe(false)
	expect(notes.status.value).toBe('readonly')
})

test('private legacy notes are drawn but marked private', async () => {
	const { annotation, notes } = setup()
	await notes.load(fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: false,
			notes: [],
			private: [{ id: 'private-0', type: 'annotation', payload: { space: 'scene', point: { x: 1, y: 2, z: 3 }, text: 'Mine' }, author: null }],
		}),
	}))

	expect(annotation.items[0].meta.saveState).toBe('private')
	expect(annotation.items[0].point.x).toBe(1)
})

test('scene-space shared notes are converted once when the user can edit', async () => {
	const { notes } = setup()
	const api = fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: true,
			notes: [{ id: 5, type: 'annotation', payload: { space: 'scene', point: { x: 12, y: 0, z: 0 }, text: 'Old' }, author: null }],
			private: [],
		}),
	})

	await notes.load(api)
	await flushPromises()

	expect(api.update).toHaveBeenCalledTimes(1)
	expect(api.update).toHaveBeenCalledWith(5, { space: 'model', point: { x: 2, y: 0, z: 0 }, text: 'Old' })
})

/** Review focus: switching models clears the old notes locally, never on the server. */
test('load() clears previous notes silently', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	await notes.load(fakeApi())

	expect(annotation.items).toHaveLength(0)
	expect(api.remove).not.toHaveBeenCalled()
})

test('an added annotation is saved in model space and takes the server id', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)

	const item = annotation.userAdd({ point: new THREE.Vector3(11, 0, 0), text: 'Note' })
	expect(item.meta.saveState).toBe('saving')
	await flushPromises()

	expect(api.create).toHaveBeenCalledWith('annotation', { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'Note' })
	expect(item.meta).toMatchObject({ noteId: 100, saveState: 'saved', author: { displayName: 'Alice' } })
})

test('a failed save is marked failed, notifies, and retry saves it', async () => {
	const { measurement, notes, notify } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 7, author: null }) })
	await notes.load(api)

	const item = measurement.userAdd({ point1: new THREE.Vector3(10, 0, 0), point2: new THREE.Vector3(10, 1, 0) })
	await flushPromises()

	expect(item.meta.saveState).toBe('failed')
	expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))

	await notes.retry('measurement', item)

	expect(api.create).toHaveBeenLastCalledWith('measurement', { space: 'model', points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] })
	expect(item.meta).toMatchObject({ noteId: 7, saveState: 'saved' })
})

test('retry through a read-only view, as the panel holds, saves the note itself, once', async () => {
	const { measurement, notes } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ id: 7, author: null }) })
	await notes.load(api)
	const item = measurement.userAdd({ point1: new THREE.Vector3(10, 0, 0), point2: new THREE.Vector3(10, 1, 0) })
	await flushPromises()
	expect(item.meta.saveState).toBe('failed')

	await notes.retry('measurement', readonly(item))

	expect(item.meta).toMatchObject({ noteId: 7, saveState: 'saved' })
	// Saved now: another retry has nothing to create
	await notes.retry('measurement', readonly(item))
	expect(api.create).toHaveBeenCalledTimes(2)
	expect(api.update).not.toHaveBeenCalled()
})

test('discard through a read-only view removes the note', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValue(new Error('offline')) })
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	notes.discard('annotation', readonly(item))

	expect(annotation.items).toHaveLength(0)
	expect(api.remove).not.toHaveBeenCalled()
})

test('discard removes a never-saved note locally only', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi({ create: jest.fn().mockRejectedValue(new Error('offline')) })
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	notes.discard('annotation', item)

	expect(annotation.items).toHaveLength(0)
	expect(api.remove).not.toHaveBeenCalled()
})

test('text edits are saved once, after typing stops', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })
	await flushPromises() // real timers: let the first save finish and hand back its id

	jest.useFakeTimers()
	annotation.userEditText(item, 'Ab')
	annotation.userEditText(item, 'Abc')
	jest.advanceTimersByTime(TEXT_SAVE_DEBOUNCE_MS - 1)
	expect(api.update).not.toHaveBeenCalled()
	jest.advanceTimersByTime(1)
	jest.useRealTimers()
	await flushPromises()

	expect(api.update).toHaveBeenCalledTimes(1)
	expect(api.update).toHaveBeenCalledWith(100, { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Abc' })
})

/** Review focus: typing before the first save answers must not lose the text. */
test('text typed during the first save is sent afterwards', async () => {
	let resolveCreate
	const api = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const { annotation, notes } = setup()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })

	annotation.userEditText(item, 'Typed early')
	resolveCreate({ id: 55, author: null })
	await flushPromises()
	await notes.flush()

	expect(api.update).toHaveBeenCalledWith(55, expect.objectContaining({ text: 'Typed early' }))
})

/** Review focus: deleting mid-save must not leave an orphan on the server. */
test('delete during save removes the note once the server answers', async () => {
	let resolveCreate
	const api = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const { annotation, notes } = setup()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })

	annotation.userDelete(item)
	resolveCreate({ id: 77, author: null })
	await flushPromises()

	expect(api.remove).toHaveBeenCalledWith(77)
})

test('a saved note is deleted on the server', async () => {
	const { annotation, notes } = setup()
	const api = fakeApi()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	await flushPromises()

	annotation.userDelete(item)
	await flushPromises()

	expect(api.remove).toHaveBeenCalledWith(100)
})

test('read-only: a new measurement stays local and nothing is sent', async () => {
	const { measurement, notes } = setup()
	const api = fakeApi({ list: jest.fn().mockResolvedValue({ canEdit: false, notes: [], private: [] }) })
	await notes.load(api)

	const item = measurement.userAdd({ point1: new THREE.Vector3(), point2: new THREE.Vector3(1, 0, 0) })
	await flushPromises()

	expect(item.meta.saveState).toBe('local')
	expect(api.create).not.toHaveBeenCalled()
})

test('a failed load reports an error and leaves the tools usable', async () => {
	const { notes } = setup()

	await notes.load(fakeApi({ list: jest.fn().mockRejectedValue(new Error('500')) }))

	expect(notes.status.value).toBe('error')
	expect(notes.canEdit.value).toBe(false)
})

test('a failed load notifies', async () => {
	const { notes, notify } = setup()

	await notes.load(fakeApi({ list: jest.fn().mockRejectedValue(new Error('500')) }))

	expect(notify).toHaveBeenCalledWith({
		type: 'error',
		title: 'Notes not loaded',
		message: 'Shared annotations and measurements could not be loaded.',
	})
})

test('retry on a note that is already saving does not send a second create', async () => {
	let resolveCreate
	const api = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const { annotation, notes } = setup()
	await notes.load(api)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })
	expect(item.meta.saveState).toBe('saving')

	await notes.retry('annotation', item)

	expect(api.create).toHaveBeenCalledTimes(1)
	resolveCreate({ id: 1, author: null })
	await flushPromises()
	expect(item.meta).toMatchObject({ noteId: 1, saveState: 'saved' })
})

/** Review focus: a create/update/delete that resolves after a model switch must stay on its own model. */
test('delete during save across a model switch removes the note from the model it was created on', async () => {
	let resolveCreate
	const apiA = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const apiB = fakeApi()
	const { annotation, notes } = setup()
	await notes.load(apiA)
	const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'x' })

	annotation.userDelete(item)
	await notes.load(apiB)
	resolveCreate({ id: 77, author: null })
	await flushPromises()

	expect(apiA.remove).toHaveBeenCalledWith(77)
	expect(apiB.remove).not.toHaveBeenCalled()
})

/** Review focus: the follow-up save must convert through the note's own model, not the newly loaded one. */
test('text typed during the first save across a model switch is sent to the model it was created on', async () => {
	let resolveCreate
	const apiA = fakeApi({ create: jest.fn(() => new Promise(r => { resolveCreate = r })) })
	const apiB = fakeApi()
	const { annotation, notes, state } = setupSwappableRoot()
	await notes.load(apiA)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })

	annotation.userEditText(item, 'Typed early')
	const rootB = new THREE.Group()
	rootB.position.set(100, 0, 0)
	state.root = rootB
	await notes.load(apiB)
	resolveCreate({ id: 55, author: null })
	await flushPromises()
	await notes.flush()

	expect(apiA.update).toHaveBeenCalledWith(55, { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Typed early' })
	expect(apiB.update).not.toHaveBeenCalled()
})

test('a pending debounced edit at switch time is sent to the model it was typed on, not the new one', async () => {
	const apiA = fakeApi()
	const apiB = fakeApi()
	const { annotation, notes } = setup()
	await notes.load(apiA)
	const item = annotation.userAdd({ point: new THREE.Vector3(10, 0, 0), text: 'A' })
	await flushPromises()

	annotation.userEditText(item, 'Ab')
	await notes.load(apiB)
	await flushPromises()

	expect(apiA.update).toHaveBeenCalledWith(100, { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Ab' })
	expect(apiB.update).not.toHaveBeenCalled()
})

/** Review focus: getModelRoot() has already moved on to rootB by the time this follow-up runs. */
test('a text edit saved after a model switch converts through the model the note was created on, not the newly loaded one', async () => {
	const apiA = fakeApi()
	const apiB = fakeApi()
	const { annotation, notes, state } = setupSwappableRoot()
	await notes.load(apiA)
	const item = annotation.userAdd({ point: new THREE.Vector3(11, 0, 0), text: 'A' })
	await flushPromises() // let the create finish, note takes its server id

	annotation.userEditText(item, 'Ab')
	const rootB = new THREE.Group()
	rootB.position.set(100, 0, 0)
	state.root = rootB
	await notes.load(apiB)
	await flushPromises()

	expect(apiA.update).toHaveBeenCalledWith(100, { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'Ab' })
	expect(apiB.update).not.toHaveBeenCalled()
})

test('a stale list() resolving after a newer load() draws nothing and leaves canEdit/status on the new model', async () => {
	let resolveListA
	const apiA = fakeApi({ list: jest.fn(() => new Promise(r => { resolveListA = r })) })
	const apiB = fakeApi({
		list: jest.fn().mockResolvedValue({
			canEdit: false,
			notes: [{ id: 9, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'B note' }, author: null }],
			private: [],
		}),
	})
	const { annotation, notes } = setup()

	const loadA = notes.load(apiA)
	await notes.load(apiB)

	resolveListA({
		canEdit: true,
		notes: [{ id: 1, type: 'annotation', payload: { space: 'model', point: { x: 1, y: 0, z: 0 }, text: 'A note' }, author: null }],
		private: [],
	})
	await loadA
	await flushPromises()

	expect(annotation.items).toHaveLength(1)
	expect(annotation.items[0].meta.noteId).toBe(9)
	expect(notes.canEdit.value).toBe(false)
	expect(notes.status.value).toBe('readonly')
})

/*
 * An angle is stored as a note type of its own, point / corner / point, so a viewer that
 * predates angles skips it instead of drawing its first two points as a distance.
 */
describe('angles', () => {
	test('an angle is saved as an angle note, in model space, corner in the middle', async () => {
		const { measurement, notes } = setup()
		const api = fakeApi()
		await notes.load(api)

		const item = measurement.userAdd({
			type: 'angle',
			point1: new THREE.Vector3(11, 0, 0),
			vertex: new THREE.Vector3(10, 0, 0),
			point2: new THREE.Vector3(10, 1, 0),
		})
		await flushPromises()

		expect(api.create).toHaveBeenCalledWith('angle', {
			space: 'model',
			points: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }],
		})
		expect(item.meta.noteId).toBe(100)
		expect(item.meta.saveState).toBe('saved')
	})

	test('a distance is still saved as a measurement note', async () => {
		const { measurement, notes } = setup()
		const api = fakeApi()
		await notes.load(api)
		measurement.userAdd({ type: 'distance', point1: new THREE.Vector3(10, 0, 0), point2: new THREE.Vector3(10, 1, 0) })
		await flushPromises()
		expect(api.create).toHaveBeenCalledWith('measurement', expect.objectContaining({ points: expect.any(Array) }))
		expect(api.create.mock.calls[0][1].points).toHaveLength(2)
	})

	test('a stored angle is drawn back in scene space, with its author', async () => {
		const { measurement, notes } = setup()
		const api = fakeApi({
			list: jest.fn().mockResolvedValue({
				canEdit: false,
				notes: [{
					id: 7,
					type: 'angle',
					payload: { space: 'model', points: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
					author: { uid: 'bob', displayName: 'Bob' },
				}],
				private: [],
			}),
		})
		await notes.load(api)

		expect(measurement.items).toHaveLength(1)
		const [angle] = measurement.items
		expect(angle.type).toBe('angle')
		expect(angle.vertex.x).toBeCloseTo(10)
		expect(angle.point1.x).toBeCloseTo(11)
		expect(angle.point2.y).toBeCloseTo(1)
		expect(angle.meta).toMatchObject({ noteId: 7, author: { uid: 'bob', displayName: 'Bob' }, saveState: 'shared', state: 'open', replies: [] })
	})

	test('a failed angle save retries as an angle', async () => {
		const { measurement, notes } = setup()
		const api = fakeApi({ create: jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue({ id: 5, author: null }) })
		await notes.load(api)
		const item = measurement.userAdd({
			type: 'angle',
			point1: new THREE.Vector3(11, 0, 0),
			vertex: new THREE.Vector3(10, 0, 0),
			point2: new THREE.Vector3(10, 1, 0),
		})
		await flushPromises()
		expect(item.meta.saveState).toBe('failed')

		await notes.retry('measurement', item)
		expect(api.create).toHaveBeenLastCalledWith('angle', expect.objectContaining({ space: 'model' }))
		expect(item.meta.saveState).toBe('saved')
	})
})

describe('note review', () => {
	const annotationNote = (id, extra = {}) => ({
		id, type: 'annotation', payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: `Note ${id}` }, author: { uid: 'bob', displayName: 'Bob' }, ...extra,
	})
	const measurementNote = (id, extra = {}) => ({
		id, type: 'measurement', payload: { space: 'model', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }, author: null, ...extra,
	})
	const resolvedNote = { state: 'resolved', resolvedBy: { uid: 'omar', displayName: 'Omar' }, resolvedAt: 1_800_000_000 }

	// The review calls live on the api's lazily loaded review client
	const REVIEW = ['setState', 'addReply', 'updateReply', 'removeReply', 'people']

	async function loaded(notesList, apiOverrides = {}) {
		const ctx = setup()
		const review = Object.fromEntries(REVIEW.filter((name) => name in apiOverrides).map((name) => [name, apiOverrides[name]]))
		const rest = Object.fromEntries(Object.entries(apiOverrides).filter(([name]) => !REVIEW.includes(name)))
		const api = fakeApi({
			list: jest.fn().mockResolvedValue({ canEdit: true, notes: notesList, private: [] }),
			review: jest.fn().mockResolvedValue(review),
			...rest,
		})
		await ctx.notes.load(api)
		return { ...ctx, api }
	}

	test('notes that came without a state are open, with no thread', async () => {
		const { annotation } = await loaded([annotationNote(1)])

		expect(annotation.items[0].meta).toMatchObject({ state: 'open', resolvedBy: null, resolvedAt: null, replies: [], mentions: {} })
	})

	test('a resolved note comes with who resolved it and when, and its thread', async () => {
		const reply = { id: 5, text: 'Done', author: { uid: 'omar', displayName: 'Omar' }, createdAt: 2, updatedAt: 2, mentions: [] }
		const { annotation } = await loaded([annotationNote(1, { ...resolvedNote, replies: [reply], mentions: { sara: 'Sara' } })])

		expect(annotation.items[0].meta).toMatchObject({ state: 'resolved', resolvedBy: { uid: 'omar' }, resolvedAt: 1_800_000_000, replies: [reply], mentions: { sara: 'Sara' } })
	})

	test('an empty mentions list from the server is no names', async () => {
		const { annotation } = await loaded([annotationNote(1, { mentions: [] })])

		expect(annotation.items[0].meta.mentions).toEqual({})
	})

	test('markers of resolved notes are hidden, and shown dimmed on request', async () => {
		const { annotation, measurement, notes } = await loaded([
			annotationNote(1, resolvedNote),
			annotationNote(2),
			measurementNote(3, resolvedNote),
		])
		const [resolvedAnnotation, openAnnotation] = annotation.items
		const [resolvedMeasurement] = measurement.items

		expect(annotation.looks.get(resolvedAnnotation.id)).toBe('hidden')
		expect(annotation.looks.get(openAnnotation.id)).toBe('normal')
		expect(measurement.looks.get(resolvedMeasurement.id)).toBe('hidden')

		notes.setShowResolved(true)

		expect(notes.showResolved.value).toBe(true)
		expect(annotation.looks.get(resolvedAnnotation.id)).toBe('dim')
		expect(annotation.looks.get(openAnnotation.id)).toBe('normal')

		notes.setShowResolved(false)
		expect(measurement.looks.get(resolvedMeasurement.id)).toBe('hidden')
	})

	test('the label in the scene shows a mentioned person by name', async () => {
		const { annotation } = await loaded([annotationNote(1, { payload: { space: 'model', point: { x: 0, y: 0, z: 0 }, text: 'Ask @sara' }, mentions: { sara: 'Sara Ahmed' } })])

		expect(annotation.labelFormatter(annotation.items[0])).toBe('Ask @Sara Ahmed')
	})

	test('resolving goes to the server and is drawn from its answer', async () => {
		const setState = jest.fn().mockResolvedValue({ ...annotationNote(1, resolvedNote), replies: [] })
		const { annotation, notes } = await loaded([annotationNote(1)], { setState })
		const item = annotation.items[0]

		const done = await notes.setState('annotation', item, 'resolved')

		expect(done).toBe(true)
		expect(setState).toHaveBeenCalledWith(1, 'resolved')
		expect(item.meta).toMatchObject({ state: 'resolved', resolvedBy: { uid: 'omar' } })
		expect(annotation.looks.get(item.id)).toBe('hidden')
	})

	test('reopening brings the marker back', async () => {
		const setState = jest.fn().mockResolvedValue({ ...annotationNote(1), state: 'open', resolvedBy: null, resolvedAt: null })
		const { annotation, notes } = await loaded([annotationNote(1, resolvedNote)], { setState })
		const item = annotation.items[0]

		await notes.setState('annotation', item, 'open')

		expect(item.meta).toMatchObject({ state: 'open', resolvedBy: null, resolvedAt: null })
		expect(annotation.looks.get(item.id)).toBe('normal')
	})

	test('a refused state change leaves the note as it was and says so', async () => {
		const setState = jest.fn().mockRejectedValue(new Error('403'))
		const { annotation, notes, notify } = await loaded([annotationNote(1)], { setState })
		const item = annotation.items[0]

		const done = await notes.setState('annotation', item, 'resolved')

		expect(done).toBe(false)
		expect(item.meta.state).toBe('open')
		expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'The note was not changed' }))
	})

	test('a note not yet saved has nothing to resolve', async () => {
		const setState = jest.fn()
		// The server has not answered the create yet, so the note has no id
		const { annotation, notes } = await loaded([], { setState, create: jest.fn(() => new Promise(() => {})) })
		const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'New' })

		expect(await notes.setState('annotation', item, 'resolved')).toBe(false)
		expect(setState).not.toHaveBeenCalled()
	})

	test('a reply is added to the thread from the server\'s answer, and a resolved note stays resolved', async () => {
		const reply = { id: 8, text: 'Thanks', author: { uid: 'alice', displayName: 'Alice' }, createdAt: 3, updatedAt: 3, mentions: {} }
		const addReply = jest.fn().mockResolvedValue(reply)
		const { annotation, notes } = await loaded([annotationNote(1, resolvedNote)], { addReply })
		const item = annotation.items[0]

		expect(await notes.addReply(item, 'Thanks')).toBe(true)

		expect(addReply).toHaveBeenCalledWith(1, 'Thanks')
		expect(item.meta.replies).toEqual([reply])
		expect(item.meta.state).toBe('resolved')
		expect(annotation.looks.get(item.id)).toBe('hidden')
	})

	test('a failed reply is not added', async () => {
		const addReply = jest.fn().mockRejectedValue(new Error('down'))
		const { annotation, notes, notify } = await loaded([annotationNote(1)], { addReply })

		expect(await notes.addReply(annotation.items[0], 'Hi')).toBe(false)

		expect(annotation.items[0].meta.replies).toEqual([])
		expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Reply not saved' }))
	})

	test('a reply is replaced on edit and dropped on delete', async () => {
		const one = { id: 1, text: 'One', mentions: {} }
		const two = { id: 2, text: 'Two', mentions: {} }
		const updateReply = jest.fn().mockResolvedValue({ id: 2, text: 'Two, edited', mentions: {} })
		const removeReply = jest.fn().mockResolvedValue(undefined)
		const { annotation, notes } = await loaded([annotationNote(1, { replies: [one, two] })], { updateReply, removeReply })
		const item = annotation.items[0]

		await notes.updateReply(item, 2, 'Two, edited')
		expect(item.meta.replies.map((r) => r.text)).toEqual(['One', 'Two, edited'])
		expect(updateReply).toHaveBeenCalledWith(1, 2, 'Two, edited')

		await notes.removeReply(item, 1)
		expect(item.meta.replies.map((r) => r.id)).toEqual([2])
		expect(removeReply).toHaveBeenCalledWith(1, 1)
	})

	test('people to mention are asked of the model the note belongs to, and a failure is no people', async () => {
		const people = jest.fn().mockResolvedValueOnce([{ id: 'sara', label: 'Sara' }]).mockRejectedValueOnce(new Error('down'))
		const { annotation, notes } = await loaded([annotationNote(1)], { people })

		expect(await notes.findPeople(annotation.items[0], 'sa')).toEqual([{ id: 'sara', label: 'Sara' }])
		expect(await notes.findPeople(annotation.items[0], 'sa')).toEqual([])
	})

	test('a mention chosen in the editor is remembered, and the label redrawn', async () => {
		const { annotation, notes } = await loaded([annotationNote(1)])
		const item = annotation.items[0]

		notes.learnMentions(item, { sara: 'Sara Ahmed' })

		expect(item.meta.mentions).toEqual({ sara: 'Sara Ahmed' })
		expect(annotation.refreshAnnotationLabel).toHaveBeenCalledWith(item.id)
	})

	test('saving the text brings back the names of whoever it mentions', async () => {
		jest.useFakeTimers()
		const update = jest.fn().mockResolvedValue({ mentions: { sara: 'Sara Ahmed' } })
		const { annotation, notes } = await loaded([annotationNote(1)], { update })
		const item = annotation.items[0]

		annotation.userEditText(item, 'Ask @sara ')
		jest.advanceTimersByTime(TEXT_SAVE_DEBOUNCE_MS + 1)
		jest.useRealTimers()
		await flushPromises()

		expect(item.meta.mentions).toEqual({ sara: 'Sara Ahmed' })
		expect(annotation.refreshAnnotationLabel).toHaveBeenCalledWith(item.id)
		expect(notes.status.value).toBe('saved')
	})

	test('a note made here is open once the server has it', async () => {
		const { annotation } = await loaded([], { create: jest.fn().mockResolvedValue({ id: 31, author: null, state: 'open', replies: [], mentions: [] }) })
		const item = annotation.userAdd({ point: new THREE.Vector3(), text: 'New' })
		await flushPromises()

		expect(item.meta).toMatchObject({ noteId: 31, state: 'open', replies: [] })
	})

	test('a read-only view of a note, as the panel holds, changes the note itself', async () => {
		const setState = jest.fn().mockResolvedValue({ ...annotationNote(1, resolvedNote), replies: [] })
		const addReply = jest.fn().mockResolvedValue({ id: 8, text: 'Thanks', mentions: {} })
		const { annotation, notes } = await loaded([annotationNote(1)], { setState, addReply })
		const entry = annotation.items[0]
		const view = readonly(entry)

		await notes.setState('annotation', view, 'resolved')
		await notes.addReply(view, 'Thanks')
		notes.learnMentions(view, { sara: 'Sara Ahmed' })

		expect(entry.meta.state).toBe('resolved')
		expect(entry.meta.replies).toHaveLength(1)
		expect(entry.meta.mentions).toEqual({ sara: 'Sara Ahmed' })
	})
})
