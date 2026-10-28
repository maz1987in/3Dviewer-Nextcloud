/**
 * Print check's state: what it draws (always in the scene, never in the model), what it
 * measures, and that it lets go of everything when it closes or the model changes.
 */
import * as THREE from 'three'
import { ref, nextTick } from 'vue'
import { usePrintCheck } from '../../../src/composables/usePrintCheck.js'
import { checkClosed, measureThickness } from '../../../src/printCheck/printCheckClient.js'
import { loadPrintCheckSettings, savePrintCheckSettings, flushPrintCheckSettings } from '../../../src/printCheck/printCheckSettings.js'
import { PRINT_CHECK_DEFAULTS } from '../../../src/printCheck/printers.js'

jest.mock('../../../src/printCheck/printCheckClient.js', () => ({ checkClosed: jest.fn(), measureThickness: jest.fn() }))
jest.mock('../../../src/printCheck/printCheckSettings.js', () => ({
	loadPrintCheckSettings: jest.fn(),
	savePrintCheckSettings: jest.fn(() => Promise.resolve()),
	flushPrintCheckSettings: jest.fn(() => Promise.resolve()),
	sanitizePrintCheckSettings: jest.requireActual('../../../src/printCheck/printCheckSettings.js').sanitizePrintCheckSettings,
}))

const CLOSED = { boundaryEdges: 0, nonManifoldEdges: 0, closed: true }
const OPEN = { boundaryEdges: 4, nonManifoldEdges: 0, closed: false }

/** A deferred promise, to hold a worker call open. */
function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => { resolve = res; reject = rej })
	return { promise, resolve, reject }
}

/** A 10 mm cube resting on y = 0, in a scene, with a camera and orbit controls. */
function setup({ filename = 'cube.stl', size = 10, fileId = 1 } = {}) {
	const cameras = { current: null }
	const scene = new THREE.Scene()
	const root = new THREE.Group()
	const geometry = new THREE.BoxGeometry(size, size, size)
	geometry.translate(0, size / 2, 0)
	const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
	root.add(mesh)
	scene.add(root)
	root.updateMatrixWorld(true)
	const camera = new THREE.PerspectiveCamera()
	camera.position.set(30, 30, 30)
	cameras.current = camera
	const controls = {
		target: new THREE.Vector3(),
		_quat: new THREE.Quaternion(),
		_quatInverse: new THREE.Quaternion(),
		update: jest.fn(),
	}
	const modelRoot = ref(root)
	const printCheck = usePrintCheck({
		scene: () => scene,
		modelRoot,
		camera: () => cameras.current,
		controls: () => controls,
		mmPerUnit: () => 1,
		filename: () => filename,
		fileId: () => fileId,
	})
	return { scene, root, mesh, camera, cameras, controls, modelRoot, printCheck }
}

/** Every object in the scene that is not part of the model. */
function overlays(scene, root) {
	return scene.children.filter((child) => child !== root)
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
	jest.clearAllMocks()
	loadPrintCheckSettings.mockReturnValue({ ...PRINT_CHECK_DEFAULTS, custom: { ...PRINT_CHECK_DEFAULTS.custom } })
	checkClosed.mockResolvedValue([CLOSED])
})

test('open adds overlays to the scene, none under the model root', async () => {
	const { scene, root, printCheck } = setup()
	printCheck.open()
	await flush()

	expect(printCheck.active.value).toBe(true)
	const added = overlays(scene, root)
	expect(added.length).toBeGreaterThanOrEqual(3) // box, bed, overhang overlay
	expect(added.every((object) => object.userData.viewerOverlay)).toBe(true)
	let underRoot = 0
	root.traverse((child) => { if (child.userData.viewerOverlay) underRoot++ })
	expect(underRoot).toBe(0)
	expect(printCheck.fit.value.fits).toBe(true)
	expect(printCheck.overhang.value.share).toBe(0)

	printCheck.close()
	expect(overlays(scene, root)).toEqual([])
	expect(printCheck.active.value).toBe(false)
})

test("a cube that doesn't fit turns the box red", async () => {
	const { scene, root, printCheck } = setup({ size: 20 })
	printCheck.open()
	printCheck.setPrinter('custom')
	printCheck.setCustom({ width: 10, depth: 10, height: 10 })
	await flush()

	expect(printCheck.fit.value.fits).toBe(false)
	expect(printCheck.fit.value.over.width).toBeCloseTo(10, 6)
	const box = overlays(scene, root).find((object) => object.isLineSegments)
	expect(box.material.color.getHex()).toBe(0xe53935)
	expect(savePrintCheckSettings).toHaveBeenCalled()
})

test('z-up changes camera.up and close restores it', () => {
	const { camera, controls, printCheck } = setup()
	printCheck.open()
	printCheck.setUp('z')
	expect(camera.up.toArray()).toEqual([0, 0, 1])
	const expected = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))
	expect(controls._quat.angleTo(expected)).toBeLessThan(1e-6)

	printCheck.close()
	expect(camera.up.toArray()).toEqual([0, 1, 0])
	expect(controls._quat.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
})

test('the up choice is remembered per file for the session', () => {
	const first = setup({ fileId: 7 })
	first.printCheck.open()
	first.printCheck.setUp('z')
	first.printCheck.close()

	const again = setup({ fileId: 7 })
	again.printCheck.open()
	expect(again.printCheck.up.value).toBe('z')
	again.printCheck.close()

	const other = setup({ fileId: 8 })
	other.printCheck.open()
	expect(other.printCheck.up.value).toBe('y')
})

test('estimate waits for the closed check', async () => {
	const check = deferred()
	checkClosed.mockReturnValue(check.promise)
	const { printCheck } = setup()
	printCheck.open()

	expect(printCheck.closed.value).toBe('checking')
	expect(printCheck.estimate.value).toBeNull()
	check.resolve([CLOSED])
	await flush()

	expect(printCheck.closed.value).toBe('closed')
	// A 10 mm cube at the default 20% PLA
	expect(printCheck.estimate.value.grams).toBeCloseTo(0.96224, 4)
})

test('open model gives no estimate and counts open parts', async () => {
	checkClosed.mockResolvedValue([OPEN])
	const { printCheck } = setup()
	printCheck.open()
	await flush()

	expect(printCheck.closed.value).toBe('open')
	expect(printCheck.openParts.value).toBe(1)
	expect(printCheck.estimate.value).toBeNull()
})

test('switching model cancels the running check', async () => {
	const check = deferred()
	let signal
	checkClosed.mockImplementation((parts, options) => { signal = options.signal; return check.promise })
	const { scene, root, modelRoot, printCheck } = setup()
	printCheck.open()

	modelRoot.value = new THREE.Group()
	await nextTick()

	expect(signal.aborted).toBe(true)
	expect(overlays(scene, root)).toEqual([])
	expect(printCheck.active.value).toBe(false)
	expect(printCheck.closed.value).toBeNull()
})

test('a late worker result after close is ignored', async () => {
	const check = deferred()
	checkClosed.mockReturnValue(check.promise)
	const { printCheck } = setup()
	printCheck.open()
	printCheck.close()

	check.resolve([CLOSED])
	await flush()

	expect(printCheck.closed.value).toBeNull()
	expect(printCheck.estimate.value).toBeNull()
})

test('gizmo change recomputes the fit, debounced', async () => {
	jest.useFakeTimers()
	const { root, printCheck } = setup()
	printCheck.open()
	expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)

	root.scale.setScalar(3)
	printCheck.modelMoved()
	printCheck.modelMoved()
	expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)
	jest.advanceTimersByTime(200)
	expect(printCheck.fit.value.size.width).toBeCloseTo(30, 6)
	jest.useRealTimers()
})

test('gcode shows only the slicer summary', () => {
	const { root, scene, printCheck } = setup({ filename: 'print.gcode' })
	root.userData.slicerSummary = { slicer: 'Cura 5.7.1', printSeconds: 3723, filamentMm: 1520.35, filamentGrams: null }
	printCheck.open()

	expect(printCheck.kind.value).toBe('gcode')
	expect(printCheck.slicerSummary.value.printSeconds).toBe(3723)
	expect(overlays(scene, root)).toEqual([])
	expect(checkClosed).not.toHaveBeenCalled()
})

test('thickness: a run colours, measures and reports the thin share', async () => {
	const { scene, root, printCheck } = setup({ size: 0.5 })
	const triangles = 12
	measureThickness.mockImplementation((parts, { onProgress }) => {
		onProgress(1, 1)
		return Promise.resolve([{ thickness: new Float32Array(24).fill(0.5), triangleThickness: new Float32Array(triangles).fill(0.5), sampled: false }])
	})
	printCheck.open()
	await flush()
	const before = overlays(scene, root).length

	await printCheck.runThickness()

	expect(printCheck.thickness.value.state).toBe('done')
	expect(printCheck.thickness.value.share).toBeCloseTo(1, 9)
	expect(printCheck.thickness.value.sampled).toBe(false)
	expect(overlays(scene, root).length).toBe(before + 1)
	const hit = { object: root.children[0], faceIndex: 3 }
	expect(printCheck.thicknessAt(hit)).toBeCloseTo(0.5, 9)
})

test('thickness: cancel stops the run', async () => {
	let signal
	measureThickness.mockImplementation((parts, options) => {
		signal = options.signal
		return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))
	})
	const { printCheck } = setup()
	printCheck.open()
	const running = printCheck.runThickness()
	expect(printCheck.thickness.value.state).toBe('running')

	printCheck.cancelThickness()
	await running

	expect(signal.aborted).toBe(true)
	expect(printCheck.thickness.value.state).toBe('cancelled')
})

test('thickness on an open model carries the warning', async () => {
	checkClosed.mockResolvedValue([OPEN])
	measureThickness.mockResolvedValue([{ thickness: new Float32Array(24).fill(10), triangleThickness: new Float32Array(12).fill(10), sampled: true }])
	const { printCheck } = setup()
	printCheck.open()
	await flush()
	await printCheck.runThickness()
	expect(printCheck.thickness.value.warnOpen).toBe(true)
	expect(printCheck.thickness.value.sampled).toBe(true)
	expect(printCheck.thickness.value.share).toBe(0)
})

test('a model that moved is noticed on the next frame, whatever moved it', () => {
	jest.useFakeTimers()
	const { root, printCheck } = setup()
	printCheck.open()
	printCheck.onFrame()
	root.scale.setScalar(2)
	root.updateMatrixWorld(true)
	printCheck.onFrame()
	jest.advanceTimersByTime(200)
	expect(printCheck.fit.value.size.width).toBeCloseTo(20, 6)
	jest.useRealTimers()
})

test('the thickness colours are cut by the renderer\'s own clipping planes', async () => {
	const { scene, root, printCheck } = setup({ size: 0.5 })
	measureThickness.mockResolvedValue([{ thickness: new Float32Array(24).fill(0.5), triangleThickness: new Float32Array(12).fill(0.5), sampled: false }])
	printCheck.open()
	await flush()
	const before = new Set(overlays(scene, root))
	await printCheck.runThickness()
	const added = overlays(scene, root).filter((object) => !before.has(object))
	expect(added).toHaveLength(1)
	expect(added[0].material.clipping).toBe(true)
})

test('typed values are kept in range, on screen and when saved', () => {
	const { printCheck } = setup()
	printCheck.open()
	printCheck.setMinThickness(0)
	expect(printCheck.settings.value.minThickness).toBe(0.1)
	printCheck.setInfill(500)
	expect(printCheck.settings.value.infill).toBe(100)
	printCheck.setCustom({ width: Number.NaN })
	expect(printCheck.settings.value.custom.width).toBe(PRINT_CHECK_DEFAULTS.custom.width)
	const saved = savePrintCheckSettings.mock.calls.at(-1)[0]
	expect(saved.minThickness).toBe(0.1)
	expect(saved.infill).toBe(100)
})

test('z up follows a projection toggle, and close puts both cameras back', () => {
	const { camera, cameras, printCheck } = setup()
	printCheck.open()
	printCheck.setUp('z')
	const other = new THREE.OrthographicCamera()
	cameras.current = other
	printCheck.onFrame()
	expect(other.up.toArray()).toEqual([0, 0, 1])
	expect(camera.up.toArray()).toEqual([0, 1, 0])

	printCheck.close()
	expect(other.up.toArray()).toEqual([0, 1, 0])
	expect(camera.up.toArray()).toEqual([0, 1, 0])
})

test('close puts the turned camera back even when the projection changed since the last frame', () => {
	const { camera, cameras, printCheck } = setup()
	printCheck.open()
	printCheck.setUp('z')
	cameras.current = new THREE.OrthographicCamera()
	printCheck.close()
	expect(camera.up.toArray()).toEqual([0, 1, 0])
	expect(cameras.current.up.toArray()).toEqual([0, 1, 0])
})

test('where no wall was met, the colour data holds a large finite value, never Infinity', async () => {
	const { scene, root, printCheck } = setup({ size: 0.5 })
	const perVertex = new Float32Array(24).fill(0.5)
	perVertex[3] = Infinity
	measureThickness.mockResolvedValue([{ thickness: perVertex, triangleThickness: new Float32Array(12).fill(0.5), sampled: false }])
	printCheck.open()
	await flush()
	const before = new Set(overlays(scene, root))
	await printCheck.runThickness()
	const [overlay] = overlays(scene, root).filter((object) => !before.has(object))
	const values = [...overlay.geometry.attributes.thickness.array]
	expect(values.every(Number.isFinite)).toBe(true)
	expect(values[3]).toBeGreaterThan(1e20)
})

test('closing the viewer sends a settings change still waiting to be saved', () => {
	const { printCheck } = setup()
	printCheck.open()
	printCheck.setInfill(40)
	printCheck.dispose()
	expect(flushPrintCheckSettings).toHaveBeenCalled()
})
