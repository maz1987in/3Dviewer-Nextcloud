/**
 * Print check's state: what it draws (always in the scene, never in the model), what it
 * measures, and that it lets go of everything when it closes or the model changes.
 */
import * as THREE from 'three'
import { ref, nextTick } from 'vue'
import { usePrintCheck } from '../../../src/composables/usePrintCheck.js'
import { openSurfaceSession, analyzeParts, measureThickness, repairParts } from '../../../src/printCheck/printCheckClient.js'
import { measureSurface } from '../../../src/printCheck/surfaceMeasures.js'
import { loadPrintCheckSettings, savePrintCheckSettings, flushPrintCheckSettings } from '../../../src/printCheck/printCheckSettings.js'
import { PRINT_CHECK_DEFAULTS } from '../../../src/printCheck/printers.js'

jest.mock('../../../src/printCheck/printCheckClient.js', () => ({ openSurfaceSession: jest.fn(), analyzeParts: jest.fn(), measureThickness: jest.fn(), repairParts: jest.fn() }))

// The worker's session, answered on the page with the worker's own measurements; and the
// mesh analysis, which runs in a worker of its own, as `analyze(parts, scales)`
const checkClosed = jest.fn()
const analyze = jest.fn()
const closeSession = jest.fn()
const measureRequests = []
jest.mock('../../../src/printCheck/printCheckSettings.js', () => ({
	loadPrintCheckSettings: jest.fn(),
	savePrintCheckSettings: jest.fn(() => Promise.resolve()),
	flushPrintCheckSettings: jest.fn(() => Promise.resolve()),
	sanitizePrintCheckSettings: jest.requireActual('../../../src/printCheck/printCheckSettings.js').sanitizePrintCheckSettings,
}))

const CLOSED = { boundaryEdges: 0, nonManifoldEdges: 0, closed: true }
// What the worker's mesh analysis answers for a part with nothing wrong
const CLEAN = {
	triangles: 12, vertices: 36, joinableVertices: 28, nearVertices: 0, degenerateFaces: 0, duplicateFaces: 0, openEdges: 0,
	holes: { count: 0, fillable: 0, tooLarge: 0, complex: 0 }, nonManifoldEdges: 0, flippedFaces: 0, twistedEdges: 0,
	insideOutParts: 0, parts: 1, closed: true, volume: 1000, area: 600, tolerance: 1e-4, fixable: false,
}
const OPEN = { boundaryEdges: 4, nonManifoldEdges: 0, closed: false }

/** A deferred promise, to hold a worker call open. */
function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => { resolve = res; reject = rej })
	return { promise, resolve, reject }
}

/** A 10 mm cube resting on y = 0, in a scene, with a camera and orbit controls. */
function setup({ filename = 'cube.stl', size = 10, fileId = 1, mmPerUnit = () => 1, renderer = null, repairExport = null } = {}) {
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
		mmPerUnit,
		filename: () => filename,
		fileId: () => fileId,
		renderer: () => renderer,
		repairExport,
	})
	return { scene, root, mesh, camera, cameras, controls, modelRoot, printCheck }
}

/** Every object in the scene that is not part of the model. */
function overlays(scene, root) {
	return scene.children.filter((child) => child !== root)
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
// For a test on fake timers: let the session's answers in
const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve()
	}
}

beforeEach(() => {
	jest.clearAllMocks()
	loadPrintCheckSettings.mockReturnValue({ ...PRINT_CHECK_DEFAULTS, custom: { ...PRINT_CHECK_DEFAULTS.custom } })
	checkClosed.mockResolvedValue([CLOSED])
	analyze.mockResolvedValue([CLEAN])
	measureRequests.length = 0
	openSurfaceSession.mockImplementation((parts) => ({
		measure: (request) => {
			measureRequests.push(request)
			return Promise.resolve(measureSurface(parts, request))
		},
		checkClosed: () => checkClosed(parts),
		close: closeSession,
	}))
	analyzeParts.mockImplementation((parts, { scales }) => analyze(parts, scales))
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
	expect(box.material.uniforms.uColor.value.getHex()).toBe(0xe53935)
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

test('switching model ends the worker and its running check', async () => {
	const check = deferred()
	checkClosed.mockReturnValue(check.promise)
	const { scene, root, modelRoot, printCheck } = setup()
	printCheck.open()

	modelRoot.value = new THREE.Group()
	await nextTick()

	expect(closeSession).toHaveBeenCalledTimes(1)
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

test('refits and re-estimates when the unit changes', async () => {
	const unit = ref(1)
	const { printCheck } = setup({ mmPerUnit: unit })
	printCheck.open()
	await flush()
	expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)
	const grams = printCheck.estimate.value.grams

	unit.value = 25.4
	printCheck.unitChanged()

	expect(printCheck.fit.value.size.width).toBeCloseTo(254, 6)
	expect(printCheck.estimate.value.grams).toBeGreaterThan(grams * 1000)
})

test('gizmo change recomputes the fit, debounced', async () => {
	jest.useFakeTimers()
	const { root, printCheck } = setup()
	printCheck.open()
	await settle()
	expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)

	root.scale.setScalar(3)
	printCheck.modelMoved()
	printCheck.modelMoved()
	await settle()
	expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)
	jest.advanceTimersByTime(200)
	await settle()
	expect(printCheck.fit.value.size.width).toBeCloseTo(30, 6)
	expect(measureRequests).toHaveLength(2)
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

test('a model that moved is noticed on the next frame, whatever moved it', async () => {
	jest.useFakeTimers()
	const { root, printCheck } = setup()
	printCheck.open()
	printCheck.onFrame()
	root.scale.setScalar(2)
	root.updateMatrixWorld(true)
	printCheck.onFrame()
	jest.advanceTimersByTime(200)
	await settle()
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

describe('nothing per vertex on the page', () => {
	/** What Print check draws, visible or not. */
	const drawn = (scene, root) => overlays(scene, root).map((object) => object.visible)

	test('the card has its state at once; the fit and overhangs come from the worker', async () => {
		const { printCheck } = setup()
		printCheck.open()

		expect(printCheck.active.value).toBe(true)
		expect(printCheck.fit.value).toBeNull()
		expect(printCheck.overhang.value).toBeNull()
		expect(openSurfaceSession).toHaveBeenCalledTimes(1)
		expect(measureRequests).toHaveLength(1)
		await flush()
		expect(printCheck.fit.value.size.width).toBeCloseTo(10, 6)
		expect(printCheck.overhang.value.share).toBe(0)
	})

	test('the build volume and shading stay hidden until their shaders are compiled', async () => {
		jest.useFakeTimers()
		// No KHR_parallel_shader_compile: compiled, then given time
		const renderer = { compile: jest.fn(), extensions: { has: () => false } }
		const { scene, root, printCheck } = setup({ renderer })
		printCheck.open()
		await settle()

		expect(printCheck.fit.value).not.toBeNull()
		expect(drawn(scene, root)).toEqual([false, false, false])
		// The box, the bed and the overhang overlay share one shader, compiled once
		expect(renderer.compile).toHaveBeenCalledTimes(1)
		printCheck.onFrame()
		expect(drawn(scene, root)).toEqual([false, false, false])

		jest.advanceTimersByTime(1500)
		await settle()
		printCheck.onFrame()
		expect(drawn(scene, root)).toEqual([true, true, true])
		printCheck.close()
		jest.useRealTimers()
	})

	test('with KHR_parallel_shader_compile they show when the driver says the shaders are ready', async () => {
		const ready = deferred()
		const renderer = { compile: jest.fn(), compileAsync: jest.fn(() => ready.promise), extensions: { has: (name) => name === 'KHR_parallel_shader_compile' } }
		const { scene, root, printCheck } = setup({ renderer })
		printCheck.open()
		await flush()
		expect(drawn(scene, root)).toEqual([false, false, false])
		expect(renderer.compile).not.toHaveBeenCalled()

		ready.resolve()
		await flush()
		expect(drawn(scene, root)).toEqual([true, true, true])
	})

	test('closing while the worker measures leaves nothing behind, and its late answer is dropped', async () => {
		const answer = deferred()
		openSurfaceSession.mockImplementation(() => ({ measure: () => answer.promise, checkClosed: () => new Promise(() => {}), analyze: () => new Promise(() => {}), close: closeSession }))
		const { scene, root, printCheck } = setup()
		printCheck.open()
		expect(overlays(scene, root)).toHaveLength(3)

		printCheck.close()
		expect(closeSession).toHaveBeenCalledTimes(1)
		expect(overlays(scene, root)).toEqual([])

		answer.resolve({ extent: { min: [0, 0, 0], max: [1, 1, 1] }, overhangArea: 1, totalArea: 2, volume: 1, area: 6 })
		await flush()
		expect(printCheck.fit.value).toBeNull()
		expect(printCheck.overhang.value).toBeNull()
		expect(overlays(scene, root)).toEqual([])
	})

	test('only the latest of several measurements counts', async () => {
		const answers = []
		openSurfaceSession.mockImplementation(() => ({
			measure: () => new Promise((resolve) => answers.push(resolve)),
			checkClosed: () => Promise.resolve([CLOSED]),
			analyze: () => Promise.resolve([CLEAN]),
			close: closeSession,
		}))
		const { printCheck } = setup({ fileId: 42 })
		printCheck.open()
		printCheck.setUp('z')
		answers[1]({ extent: { min: [0, 0, 0], max: [3, 3, 3] }, overhangArea: 0, totalArea: 1, volume: 1, area: 6 })
		await flush()
		answers[0]({ extent: { min: [0, 0, 0], max: [1, 1, 1] }, overhangArea: 0, totalArea: 1, volume: 1, area: 6 })
		await flush()
		expect(printCheck.fit.value.size.width).toBe(3)
	})

	test('a worker that cannot measure says so', async () => {
		openSurfaceSession.mockImplementation(() => ({ measure: () => Promise.reject(new Error('out of memory')), checkClosed: () => Promise.resolve([CLOSED]), analyze: () => Promise.resolve([CLEAN]), close: closeSession }))
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		expect(printCheck.measureFailed.value).toBe(true)
		expect(printCheck.fit.value).toBeNull()
	})

	test('Z up is measured along Z, and the Y-up numbers are not shown meanwhile', async () => {
		// A file of its own: the up axis is remembered per file
		const { printCheck } = setup({ fileId: 41 })
		printCheck.open()
		await flush()
		printCheck.setUp('z')
		expect(printCheck.fit.value).toBeNull()
		expect(printCheck.overhang.value).toBeNull()
		expect(measureRequests.at(-1).axes.up).toEqual([0, 0, 1])
		await flush()
		expect(printCheck.fit.value.size.height).toBeCloseTo(10, 6)
	})

	test('a new angle is measured after the slider settles; a new printer needs no measuring', async () => {
		jest.useFakeTimers()
		const { printCheck } = setup()
		printCheck.open()
		await settle()
		printCheck.setPrinter('custom')
		expect(measureRequests).toHaveLength(1)

		printCheck.setOverhangAngle(30)
		printCheck.setOverhangAngle(31)
		expect(measureRequests).toHaveLength(1)
		jest.advanceTimersByTime(200)
		expect(measureRequests).toHaveLength(2)
		expect(measureRequests[1].thresholdDeg).toBe(31)
		jest.useRealTimers()
	})

	test('the estimate follows the model when it is scaled', async () => {
		jest.useFakeTimers()
		const { root, printCheck } = setup()
		printCheck.open()
		await settle()
		const grams = printCheck.estimate.value.grams
		root.scale.setScalar(2)
		printCheck.modelMoved()
		jest.advanceTimersByTime(200)
		await settle()
		expect(printCheck.estimate.value.grams).toBeGreaterThan(grams * 4)
		jest.useRealTimers()
	})
})

describe('mesh problems and repair', () => {
	const { analyzeMesh } = jest.requireActual('../../../src/printCheck/meshAnalysis.js')
	const { repairMesh } = jest.requireActual('../../../src/printCheck/meshRepair.js')
	const { edgeReport } = jest.requireActual('../../../src/printCheck/closedMesh.js')

	/** The worker's analysis and repair, run here on the same plain modules. */
	function useRealMeshWork() {
		analyze.mockImplementation((parts, scales) => Promise.resolve(parts.map((part, i) => analyzeMesh({ positions: part.positions, index: part.index, millimetresPerUnit: scales[i] }))))
		repairParts.mockImplementation((parts, { millimetresPerUnit, onProgress }) => {
			onProgress?.(1, 2)
			return Promise.resolve(parts.map((part) => {
				const result = repairMesh({ positions: part.positions, index: part.index, millimetresPerUnit })
				return { ...result, closedReport: edgeReport({ positions: result.positions, index: result.index }) }
			}))
		})
	}

	/** The test cube with its -z face (the last two triangles) left out. */
	function setupOpenCube(options) {
		const result = setup(options)
		const geometry = result.mesh.geometry
		geometry.setIndex(Array.from(geometry.index.array).slice(0, -6))
		return result
	}

	test('the analysis is asked for with the millimetres in a unit of each part, and its counts are kept', async () => {
		useRealMeshWork()
		const { printCheck } = setup({ mmPerUnit: () => 25.4 })
		expect(printCheck.problems.value.state).toBe('idle')
		printCheck.open()
		// Started once the closed check answers
		expect(printCheck.problems.value.state).toBe('waiting')
		await flush()
		expect(analyze.mock.calls[0][1]).toEqual([25.4])
		expect(printCheck.problems.value.state).toBe('done')
		expect(printCheck.problems.value.report).toMatchObject({ closed: true, fixable: false, holes: { count: 0 } })
	})

	test('an analysis that fails says so, and one cut short by closing says nothing', async () => {
		analyze.mockRejectedValue(new Error('out of memory'))
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		expect(printCheck.problems.value).toEqual({ state: 'error', report: null })

		analyze.mockRejectedValue(new DOMException('cancelled', 'AbortError'))
		const second = setup().printCheck
		second.open()
		await flush()
		expect(second.problems.value.state).toBe('checking')
	})

	test('a model with nothing to fix has nothing to repair', async () => {
		useRealMeshWork()
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		expect(repairParts).not.toHaveBeenCalled()
		expect(printCheck.repair.value.state).toBe('idle')
	})

	test('a repair fills the hole, re-checks the result, and the card shows the new state', async () => {
		useRealMeshWork()
		checkClosed.mockResolvedValue([OPEN])
		const { scene, root, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		expect(printCheck.problems.value.report).toMatchObject({ fixable: true, holes: { count: 1, fillable: 1 } })
		expect(printCheck.closed.value).toBe('open')
		expect(printCheck.estimate.value).toBeNull()
		const before = overlays(scene, root).length

		await printCheck.runRepair()
		await flush()

		expect(repairParts.mock.calls[0][1].millimetresPerUnit).toBe(1)
		const repair = printCheck.repair.value
		expect(repair.state).toBe('done')
		expect(repair.summary).toMatchObject({ filledHoles: 1, addedFaces: 2 })
		expect(repair.after).toMatchObject({ closed: true, openEdges: 0 })
		// The closed check ran on the repaired meshes, so the card says closed and the estimate is there
		expect(printCheck.closed.value).toBe('closed')
		expect(printCheck.openParts.value).toBe(0)
		expect(printCheck.estimate.value.grams).toBeGreaterThan(0)
		// What was added is drawn over the model, beside it in the scene and never under it
		const added = overlays(scene, root).slice(before)
		expect(added).toHaveLength(1)
		expect(added[0].userData.viewerOverlay).toBe(true)
		expect(added[0].geometry.attributes.position.count).toBe(6)
		expect(added[0].visible).toBe(true)
		let underRoot = 0
		root.traverse((child) => { if (child.userData.viewerOverlay) underRoot++ })
		expect(underRoot).toBe(0)
		// And the model itself is as it was loaded
		expect(root.children[0].geometry.index.count).toBe(30)
	})

	test('the repaired model is written as an STL of its real size, ready to save or download', async () => {
		useRealMeshWork()
		checkClosed.mockResolvedValue([OPEN])
		const { printCheck } = setupOpenCube({ size: 20 })
		printCheck.open()
		await flush()
		expect(await printCheck.buildRepairedFile('stl')).toBeNull()
		await printCheck.runRepair()

		const file = await printCheck.buildRepairedFile('stl')
		expect(file.extension).toBe('stl')
		// 12 triangles of 50 bytes after an 84-byte header
		expect(file.blob.size).toBe(84 + 12 * 50)
		const bytes = new Uint8Array(await new Promise((resolve) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result)
			reader.readAsArrayBuffer(file.blob)
		}))
		const view = new DataView(bytes.buffer)
		expect(view.getUint32(80, true)).toBe(12)
		let largest = 0
		for (let t = 0; t < 12; t++) {
			for (let k = 0; k < 9; k++) {
				largest = Math.max(largest, Math.abs(view.getFloat32(84 + t * 50 + 12 + k * 4, true)))
			}
		}
		// A 20 mm cube resting on y = 0, centred: the real size, not a unit cube
		expect(largest).toBeCloseTo(20, 4)
	})

	test('the 3MF carries the unit', async () => {
		useRealMeshWork()
		checkClosed.mockResolvedValue([OPEN])
		const { printCheck } = setupOpenCube({ mmPerUnit: () => 1000 })
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		expect(repairParts.mock.calls[0][1].millimetresPerUnit).toBe(1000)
		const file = await printCheck.buildRepairedFile('3mf')
		expect(file.extension).toBe('3mf')
		expect(file.blob.size).toBeGreaterThan(100)
	})

	test('undo puts back what the card showed before, and the overlay goes', async () => {
		useRealMeshWork()
		checkClosed.mockResolvedValue([OPEN])
		const { scene, root, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		const before = overlays(scene, root).length
		await printCheck.runRepair()
		await flush()
		expect(overlays(scene, root).length).toBe(before + 1)

		printCheck.undoRepair()

		expect(printCheck.repair.value.state).toBe('idle')
		expect(printCheck.closed.value).toBe('open')
		expect(printCheck.openParts.value).toBe(1)
		expect(printCheck.estimate.value).toBeNull()
		expect(overlays(scene, root).length).toBe(before)
		expect(await printCheck.buildRepairedFile('stl')).toBeNull()
		// And it can be done again
		await printCheck.runRepair()
		expect(printCheck.repair.value.state).toBe('done')
	})

	test('the faces a repair added can be hidden and shown', async () => {
		useRealMeshWork()
		const { scene, root, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		await flush()
		const overlay = overlays(scene, root).find((object) => object.name === 'Print check repair')
		printCheck.setRepairHighlight(false)
		expect(overlay.visible).toBe(false)
		expect(printCheck.repair.value.highlight).toBe(false)
		printCheck.setRepairHighlight(true)
		expect(overlay.visible).toBe(true)
	})

	test('cancel stops a repair, which can be started again', async () => {
		useRealMeshWork()
		let signal
		repairParts.mockImplementationOnce((parts, options) => {
			signal = options.signal
			return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('x', 'AbortError'))))
		})
		const { printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		const running = printCheck.runRepair()
		expect(printCheck.repair.value.state).toBe('running')
		// Asking again while it runs starts nothing more
		printCheck.runRepair()
		expect(repairParts).toHaveBeenCalledTimes(1)

		printCheck.cancelRepair()
		await running
		expect(signal.aborted).toBe(true)
		expect(printCheck.repair.value.state).toBe('cancelled')

		await printCheck.runRepair()
		expect(printCheck.repair.value.state).toBe('done')
	})

	test('progress is kept while it runs', async () => {
		useRealMeshWork()
		const answer = deferred()
		repairParts.mockImplementationOnce((parts, options) => {
			options.onProgress(250, 1000)
			return answer.promise
		})
		const { printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		const running = printCheck.runRepair()
		expect(printCheck.repair.value.progress).toBeCloseTo(0.25, 9)
		answer.reject(new DOMException('x', 'AbortError'))
		await running
	})

	test('a repair that fails says so', async () => {
		useRealMeshWork()
		repairParts.mockRejectedValueOnce(new Error('out of memory'))
		const { printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		expect(printCheck.repair.value.state).toBe('error')
	})

	test('moving the model drops the repair, as the repaired meshes are where it was', async () => {
		useRealMeshWork()
		const { root, scene, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		expect(printCheck.repair.value.state).toBe('done')

		root.position.x = 5
		root.updateMatrixWorld(true)
		printCheck.onFrame()

		expect(printCheck.repair.value.state).toBe('idle')
		expect(overlays(scene, root).some((object) => object.name === 'Print check repair')).toBe(false)
	})

	test('a model moved while the repair ran is not repaired where it no longer is', async () => {
		useRealMeshWork()
		const answer = deferred()
		repairParts.mockImplementationOnce(() => answer.promise)
		const { root, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		const running = printCheck.runRepair()
		root.position.x = 5
		root.updateMatrixWorld(true)
		answer.resolve([])
		await running
		expect(printCheck.repair.value.state).toBe('idle')
	})

	test('closing lets go of the repaired meshes and the overlay, and ends a repair still running', async () => {
		useRealMeshWork()
		const { scene, root, printCheck } = setupOpenCube()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		printCheck.close()
		expect(overlays(scene, root)).toEqual([])
		expect(printCheck.repair.value.state).toBe('idle')
		expect(printCheck.problems.value.state).toBe('idle')
		expect(await printCheck.buildRepairedFile('stl')).toBeNull()

		let signal
		repairParts.mockImplementationOnce((parts, options) => {
			signal = options.signal
			return new Promise(() => {})
		})
		printCheck.open()
		await flush()
		printCheck.runRepair()
		printCheck.close()
		expect(signal.aborted).toBe(true)
	})
})

describe('handing over the repaired file', () => {
	const { analyzeMesh } = jest.requireActual('../../../src/printCheck/meshAnalysis.js')
	const { repairMesh } = jest.requireActual('../../../src/printCheck/meshRepair.js')
	const { edgeReport } = jest.requireActual('../../../src/printCheck/closedMesh.js')

	function useRealMeshWork() {
		analyze.mockImplementation((parts, scales) => Promise.resolve(parts.map((part, i) => analyzeMesh({ positions: part.positions, index: part.index, millimetresPerUnit: scales[i] }))))
		repairParts.mockImplementation((parts, { millimetresPerUnit }) => Promise.resolve(parts.map((part) => {
			const result = repairMesh({ positions: part.positions, index: part.index, millimetresPerUnit })
			return { ...result, closedReport: edgeReport({ positions: result.positions, index: result.index }) }
		})))
	}

	/** An open cube, with the export context the viewer gives. */
	function setupExport({ canSave = true } = {}) {
		const context = { canSave, userId: 'alice', folder: '/models', modelName: 'cube.stl', notify: jest.fn(), download: jest.fn() }
		const result = setup({ repairExport: () => context })
		const geometry = result.mesh.geometry
		geometry.setIndex(Array.from(geometry.index.array).slice(0, -6))
		return { ...result, context }
	}

	test('is offered nothing before there is a repaired model', async () => {
		useRealMeshWork()
		const { printCheck, context } = setupExport()
		printCheck.open()
		await flush()
		await printCheck.repairAction('download', 'stl')
		expect(context.download).not.toHaveBeenCalled()
		expect(context.notify).not.toHaveBeenCalled()
	})

	test('downloads the repaired STL, and is busy meanwhile', async () => {
		useRealMeshWork()
		const { printCheck, context } = setupExport()
		printCheck.open()
		await flush()
		await printCheck.runRepair()
		expect(printCheck.repair.value.busy).toBe(false)

		const exporting = printCheck.repairAction('download', 'stl')
		expect(printCheck.repair.value.busy).toBe(true)
		// A second press while it is made does nothing more
		printCheck.repairAction('download', 'stl')
		await exporting

		expect(printCheck.repair.value.busy).toBe(false)
		expect(context.download).toHaveBeenCalledTimes(1)
		expect(context.download.mock.calls[0][1]).toBe('cube (repaired).stl')
		expect(context.download.mock.calls[0][0].size).toBe(84 + 12 * 50)
	})

	test('the card\'s events do the same', async () => {
		useRealMeshWork()
		const { printCheck, context } = setupExport()
		printCheck.open()
		await flush()
		printCheck.repairAction('run')
		await flush()
		await flush()
		expect(printCheck.repair.value.state).toBe('done')
		printCheck.repairAction('highlight', false)
		expect(printCheck.repair.value.highlight).toBe(false)
		await printCheck.repairAction('download', '3mf')
		expect(context.download.mock.calls[0][1]).toBe('cube (repaired).3mf')
		printCheck.repairAction('undo')
		expect(printCheck.repair.value.state).toBe('idle')
		expect(printCheck.repairAction('cancel')).toBeUndefined()
		expect(printCheck.repairAction('nonsense')).toBeUndefined()
	})

	test('saving is only for where Export may save, and the card is told', async () => {
		useRealMeshWork()
		const denied = setupExport({ canSave: false })
		denied.printCheck.open()
		await flush()
		await denied.printCheck.runRepair()
		expect(denied.printCheck.repair.value.canSave).toBe(false)
		await denied.printCheck.repairAction('save', 'stl')
		expect(denied.context.notify).not.toHaveBeenCalled()
		expect(denied.context.download).not.toHaveBeenCalled()

		const allowed = setupExport({ canSave: true })
		allowed.printCheck.open()
		await flush()
		expect(allowed.printCheck.repair.value.canSave).toBe(true)
	})
})

describe('when the mesh is checked for problems', () => {
	test('once for the model, whatever setting changes or wherever it moves', async () => {
		jest.useFakeTimers()
		const { root, printCheck } = setup()
		printCheck.open()
		await settle()
		expect(analyze).toHaveBeenCalledTimes(1)

		printCheck.setOverhangAngle(60)
		printCheck.setUp('z')
		printCheck.setPrinter('custom')
		printCheck.setInfill(30)
		printCheck.setMaterial('petg')
		printCheck.unitChanged()
		root.scale.setScalar(2)
		printCheck.modelMoved()
		jest.advanceTimersByTime(500)
		await settle()

		// The measurements were asked for again, the mesh analysis was not
		expect(measureRequests.length).toBeGreaterThan(2)
		expect(analyze).toHaveBeenCalledTimes(1)
		expect(printCheck.problems.value.state).toBe('done')
		jest.useRealTimers()
	})

	test('a large model is checked on opening too, once', async () => {
		const { mesh, printCheck } = setup()
		// 230 x 230 squares: 105,800 triangles
		mesh.geometry = new THREE.PlaneGeometry(10, 10, 230, 230)
		printCheck.open()
		await flush()
		expect(analyze).toHaveBeenCalledTimes(1)
		expect(analyze.mock.calls[0][0][0].index.length).toBe(105800 * 3)
		expect(printCheck.problems.value.state).toBe('done')
		printCheck.repairAction('check')
		expect(analyze).toHaveBeenCalledTimes(1)
	})

	test('starts once the closed check has answered, so the first measurements are never held up', async () => {
		const closedAnswer = deferred()
		checkClosed.mockReturnValue(closedAnswer.promise)
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		expect(analyze).not.toHaveBeenCalled()
		expect(printCheck.problems.value.state).toBe('waiting')

		closedAnswer.resolve([CLOSED])
		await flush()
		expect(analyze).toHaveBeenCalledTimes(1)
		expect(printCheck.problems.value.state).toBe('done')
	})

	test('starts even when the closed check fails', async () => {
		checkClosed.mockRejectedValue(new Error('out of memory'))
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		expect(analyze).toHaveBeenCalledTimes(1)
	})

	test('a measurement asked for while it runs is answered meanwhile', async () => {
		jest.useFakeTimers()
		analyze.mockReturnValue(new Promise(() => {}))
		const { printCheck } = setup()
		printCheck.open()
		await settle()
		expect(printCheck.problems.value.state).toBe('checking')
		const before = measureRequests.length

		printCheck.setOverhangAngle(60)
		jest.advanceTimersByTime(500)
		await settle()

		expect(measureRequests.length).toBe(before + 1)
		expect(printCheck.overhang.value).not.toBeNull()
		expect(printCheck.problems.value.state).toBe('checking')
		jest.useRealTimers()
	})

	test('closing Print check ends a check still running', async () => {
		analyze.mockReturnValue(new Promise(() => {}))
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		const { signal } = analyzeParts.mock.calls[0][1]
		expect(signal.aborted).toBe(false)

		printCheck.close()
		expect(signal.aborted).toBe(true)
		expect(printCheck.problems.value.state).toBe('idle')
	})

	test('a check that failed can be asked for again, and one asked for after closing does nothing', async () => {
		analyze.mockRejectedValueOnce(new Error('out of memory'))
		const { printCheck } = setup()
		printCheck.open()
		await flush()
		expect(printCheck.problems.value.state).toBe('error')
		printCheck.repairAction('check')
		await flush()
		expect(printCheck.problems.value.state).toBe('done')
		printCheck.close()
		printCheck.repairAction('check')
		expect(printCheck.problems.value.state).toBe('idle')
	})
})
