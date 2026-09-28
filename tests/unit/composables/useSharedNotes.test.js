const THREE = require('three')
const { reactive } = require('vue')
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
		addMeasurementFromNote: (p1, p2, meta) => make({ point1: p1, point2: p2 }, meta),
		userAdd: (fields) => { const item = make(fields); hooks.added?.(item); return item },
		userEditText: (item, text) => { item.text = text; hooks.changed?.(item) },
		deleteAnnotation: remove,
		deleteMeasurement: remove,
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
