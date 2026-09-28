const THREE = require('three')
const { useAnnotation, MAX_ANNOTATION_TEXT } = require('../../../src/composables/useAnnotation.js')
const { useMeasurement } = require('../../../src/composables/useMeasurement.js')

// jsdom has no 2D canvas; the label code needs the calls below (see measurementMarkers.test.js).
beforeAll(() => {
	window.HTMLCanvasElement.prototype.getContext = function getContext() {
		return {
			canvas: this,
			measureText: (text) => ({ width: String(text).length * 20 }),
			fillRect: () => {}, clearRect: () => {}, fillText: () => {}, beginPath: () => {}, rect: () => {}, fill: () => {},
			set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
		}
	}
})

function sceneWithModel() {
	const scene = new THREE.Scene()
	scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
	return scene
}

function spyHooks() {
	return { added: jest.fn(), changed: jest.fn(), deleted: jest.fn() }
}

describe('useAnnotation note hooks', () => {
	test('user actions fire hooks with the reactive item and its meta', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		const item = a.addAnnotationPoint(new THREE.Vector3(0, 0.5, 0))
		a.updateAnnotationText(item.id, 'Edited')
		a.deleteAnnotation(item.id)

		expect(hooks.added).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, meta: expect.objectContaining({ saveState: 'new' }) }))
		expect(hooks.changed).toHaveBeenCalledWith(expect.objectContaining({ text: 'Edited' }))
		expect(hooks.deleted).toHaveBeenCalledTimes(1)
	})

	test('notes from the server and silent calls fire no hooks', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		const item = a.addAnnotationFromNote(new THREE.Vector3(), 'Shared', { noteId: 3, author: null, saveState: 'saved' })
		a.updateAnnotationText(item.id, 'x', { silent: true })
		a.clearAllAnnotations({ silent: true })

		expect(item.text).toBe('x')
		expect(hooks.added).not.toHaveBeenCalled()
		expect(hooks.changed).not.toHaveBeenCalled()
		expect(hooks.deleted).not.toHaveBeenCalled()
	})

	test('clear all reports each note as deleted', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)
		a.addAnnotationFromNote(new THREE.Vector3(), 'One', { noteId: 1, author: null, saveState: 'saved' })
		a.addAnnotationFromNote(new THREE.Vector3(), 'Two', { noteId: 2, author: null, saveState: 'saved' })

		a.clearAllAnnotations()

		expect(hooks.deleted).toHaveBeenCalledTimes(2)
		expect(a.annotations.value).toHaveLength(0)
	})

	test('a click adds nothing while adding is switched off', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		a.setCanAdd(false)
		a.toggleAnnotation()

		a.handleClick({ clientX: 0, clientY: 0, target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } }, new THREE.PerspectiveCamera())

		expect(a.annotations.value).toHaveLength(0)
	})

	test('import adds each annotation once, with its text, as a user add', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const hooks = spyHooks()
		a.setNoteHooks(hooks)

		a.importFromJSON({ format: 'threedviewer-annotations', annotations: [{ point: { x: 0, y: 0, z: 0 }, text: 'Imported' }] })

		expect(hooks.added).toHaveBeenCalledTimes(1)
		expect(hooks.added).toHaveBeenCalledWith(expect.objectContaining({ text: 'Imported' }))
		expect(hooks.changed).not.toHaveBeenCalled()
	})

	/** The server refuses more than 2,000 characters, counted in code points. */
	test('import cuts long text to 2,000 characters without splitting a surrogate pair', () => {
		const a = useAnnotation()
		a.init(sceneWithModel())
		const point = { x: 0, y: 0, z: 0 }

		a.importFromJSON({
			format: 'threedviewer-annotations',
			annotations: [{ point, text: 'x'.repeat(2500) }, { point, text: '😀'.repeat(2001) }],
		})

		const [plain, emoji] = a.annotations.value
		expect(plain.text).toBe('x'.repeat(MAX_ANNOTATION_TEXT))
		expect(Array.from(emoji.text)).toHaveLength(MAX_ANNOTATION_TEXT)
		expect(emoji.text).toBe('😀'.repeat(MAX_ANNOTATION_TEXT))
	})
})

describe('useMeasurement note hooks', () => {
	test('a completed measurement fires added; one from a note does not', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const hooks = spyHooks()
		m.setNoteHooks(hooks)

		m.addMeasurementPoint(new THREE.Vector3(0, 0, 0))
		m.addMeasurementPoint(new THREE.Vector3(1, 0, 0))
		const fromNote = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(0, 2, 0), { noteId: 9, author: null, saveState: 'saved' })

		expect(hooks.added).toHaveBeenCalledTimes(1)
		expect(fromNote.meta.noteId).toBe(9)
		expect(fromNote.distance).toBeCloseTo(2)
		expect(m.measurements.value).toHaveLength(2)
	})

	test('delete and clear fire deleted unless silent', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const hooks = spyHooks()
		m.setNoteHooks(hooks)
		const one = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 1, author: null, saveState: 'saved' })
		m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(2, 0, 0), { noteId: 2, author: null, saveState: 'saved' })

		m.deleteMeasurement(one.id)
		m.clearAllMeasurements({ silent: true })

		expect(hooks.deleted).toHaveBeenCalledTimes(1)
		expect(m.measurements.value).toHaveLength(0)
	})

	/** Importing after one click must not pair the first imported point with the pending one. */
	test('cancelPendingPoint drops a half-taken measurement and its sphere', () => {
		const scene = sceneWithModel()
		const m = useMeasurement()
		m.init(scene)
		const spheres = () => scene.getObjectByName('measurementGroup').children
			.filter(o => o.name.startsWith('measurementPoint_'))

		m.addMeasurementPoint(new THREE.Vector3(5, 5, 5))
		m.cancelPendingPoint()
		m.addMeasurementPoint(new THREE.Vector3(0, 0, 0))
		m.addMeasurementPoint(new THREE.Vector3(1, 0, 0))

		expect(m.measurements.value).toHaveLength(1)
		expect(m.measurements.value[0].distance).toBeCloseTo(1)
		expect(m.points.value).toHaveLength(0)
		expect(spheres()).toHaveLength(2)
	})

	/** Notes arriving while the user has clicked one point must not strand that point's sphere. */
	test('a measurement from a note drops a pending point and its sphere', () => {
		const scene = sceneWithModel()
		const m = useMeasurement()
		m.init(scene)
		const spheres = () => scene.getObjectByName('measurementGroup').children
			.filter(o => o.name.startsWith('measurementPoint_'))

		m.addMeasurementPoint(new THREE.Vector3(5, 5, 5))
		const fromNote = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 1, author: null, saveState: 'saved' })

		expect(fromNote.distance).toBeCloseTo(1)
		expect(m.points.value).toHaveLength(0)
		expect(spheres()).toHaveLength(2)
		expect(spheres().some(s => s.position.equals(new THREE.Vector3(5, 5, 5)))).toBe(false)

		m.deleteMeasurement(fromNote.id)
		expect(spheres()).toHaveLength(0)
	})

	/** Two notes loaded in the same millisecond must not share an id. */
	test('ids stay unique when measurements are created back to back', () => {
		const m = useMeasurement()
		m.init(sceneWithModel())
		const a = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 1, author: null, saveState: 'saved' })
		const b = m.addMeasurementFromNote(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { noteId: 2, author: null, saveState: 'saved' })

		expect(a.id).not.toBe(b.id)
	})
})
