/**
 * @jest-environment jsdom
 *
 * The WebXR half of View in AR, against a stand-in for the browser's session: the request
 * it makes, what it hides and shows, where a tap puts the model and how big it is there,
 * and that everything is put back when the session ends. A real session needs a phone;
 * this checks the part that does not.
 */
import * as THREE from 'three'
import { createOverlay, scenePlacement, sessionInit, startArSession, yawToward } from '../../../src/ar/session.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

/** A session that is an event target, as the browser's is. */
function fakeSession() {
	const session = new EventTarget()
	session.end = jest.fn(async () => { session.dispatchEvent(new Event('end')) })
	session.requestReferenceSpace = jest.fn(async () => ({ viewer: true }))
	session.hitTestSource = { cancel: jest.fn() }
	session.requestHitTestSource = jest.fn(async () => session.hitTestSource)
	session.touchSource = { cancel: jest.fn() }
	session.requestHitTestSourceForTransientInput = jest.fn(async () => session.touchSource)
	return session
}

/** A select from a finger on the screen, as the browser sends one. */
function tap(session, inputSource = FINGER) {
	const event = new Event('select')
	event.inputSource = inputSource
	session.dispatchEvent(event)
}

const FINGER = { targetRayMode: 'screen' }

/** A pose at a point, as a hit test result gives it. */
function hitAt(at) {
	const matrix = new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).toArray()
	return { getPose: () => ({ transform: { matrix } }) }
}

/**
 * A frame in which the floor under the ring is `at` (metres, in the session's space), the
 * head is at `head`, and a finger on the screen, if any, is over the floor at `touch`.
 */
function frameWith(at, head = { x: 0, y: 1.5, z: 0 }, touch = null) {
	return {
		getViewerPose: () => ({ transform: { position: head } }),
		getHitTestResults: () => (at ? [hitAt(at)] : []),
		getHitTestResultsForTransientInput: () => (touch ? [{ inputSource: FINGER, results: [hitAt(touch)] }] : []),
	}
}

/** The viewer's side: a scene holding the model, a grid, lights and a background. */
function viewer(millimetres = 10) {
	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#123456')
	scene.fog = new THREE.Fog('#ffffff', 1, 10)
	const grid = new THREE.GridHelper(10, 10)
	const light = new THREE.AmbientLight()
	// A 10-unit cube in millimetres, centred at x and z = 3 and standing on the grid, as
	// the viewer leaves a model it has placed
	const model = new THREE.Mesh(new THREE.BoxGeometry(millimetres, millimetres, millimetres), new THREE.MeshStandardMaterial())
	model.position.set(3, millimetres / 2, 3)
	scene.add(model, grid, light)
	const session = fakeSession()
	const xr = { requestSession: jest.fn(async () => session) }
	const renderer = {
		xr: {
			setReferenceSpaceType: jest.fn(),
			setSession: jest.fn(async () => {}),
			getReferenceSpace: jest.fn(() => ({ local: true })),
		},
		setAnimationLoop: jest.fn(),
	}
	return { scene, model, grid, light, session, xr, renderer }
}

async function start(v, extra = {}) {
	const renderFrame = jest.fn()
	const onEnd = jest.fn()
	const running = await startArSession({
		renderer: v.renderer,
		scene: v.scene,
		model: v.model,
		metresPerUnit: 0.001,
		renderFrame,
		onEnd,
		xr: v.xr,
		doc: document,
		...extra,
	})
	// The loop the session gave the renderer: (time, frame) => void
	const frame = (at, head, touch) => v.renderer.setAnimationLoop.mock.calls.at(-1)[0](1000, frameWith(at, head, touch))
	return { running, renderFrame, onEnd, frame }
}

afterEach(() => { document.body.innerHTML = '' })

describe('the session it asks for', () => {
	it('is immersive-ar with hit-test, and the page\'s controls over the camera', async () => {
		const v = viewer()
		await start(v)
		const [mode, init] = v.xr.requestSession.mock.calls[0]
		expect(mode).toBe('immersive-ar')
		expect(init.requiredFeatures).toEqual(['hit-test'])
		expect(init.optionalFeatures).toEqual(['dom-overlay'])
		expect(init.domOverlay.root).toBe(document.body.querySelector('[role="region"]'))
		expect(sessionInit(null).domOverlay).toEqual({ root: null })
	})

	it('hands the browser\'s refusal on and leaves nothing behind', async () => {
		const v = viewer()
		v.xr.requestSession.mockRejectedValue(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
		await expect(start(v)).rejects.toThrow('no')
		expect(document.body.children).toHaveLength(0)
		expect(v.scene.background).not.toBeNull()
		expect(v.grid.visible).toBe(true)
	})

	it('ends the session and puts the scene back when it fails to come up', async () => {
		const v = viewer()
		v.renderer.xr.setSession.mockRejectedValue(new Error('no gl'))
		const onEnd = jest.fn()
		await expect(startArSession({ renderer: v.renderer, scene: v.scene, model: v.model, metresPerUnit: 0.001, renderFrame: jest.fn(), onEnd, xr: v.xr })).rejects.toThrow('no gl')
		expect(v.session.end).toHaveBeenCalled()
		expect(onEnd).not.toHaveBeenCalled()
		expect(document.body.children).toHaveLength(0)
		expect(v.scene.background).not.toBeNull()
	})
})

describe('while the session runs', () => {
	it('shows the camera, hides the viewer\'s furniture and the model until it is placed', async () => {
		const v = viewer()
		await start(v)
		expect(v.scene.background).toBeNull()
		expect(v.scene.fog).toBeNull()
		expect(v.grid.visible).toBe(false)
		expect(v.light.visible).toBe(false)
		expect(v.model.visible).toBe(false)
		expect(v.renderer.xr.setReferenceSpaceType).toHaveBeenCalledWith('local')
		expect(document.querySelector('[role="region"]').style.display).toBe('')
		expect(document.querySelector('[role="status"]').textContent).toBe('Move your phone slowly to find the floor.')
	})

	it('draws the viewer\'s frame on each of the session\'s', async () => {
		const v = viewer()
		const { renderFrame, frame } = await start(v)
		frame(null)
		expect(renderFrame).toHaveBeenCalledWith(1000)
	})

	it('puts the model on the floor where it is tapped, at real size: 10 mm is 10 mm', async () => {
		const v = viewer()
		const { frame } = await start(v)
		// The person stands straight behind the spot, so the model's front faces them square on
		frame({ x: 0.5, y: -1.2, z: -2 }, { x: 0.5, y: 1.5, z: 0 })
		expect(document.querySelector('[role="status"]').textContent).toBe('Tap to place the model.')
		expect(v.model.visible).toBe(false)

		tap(v.session)
		v.scene.updateMatrixWorld(true)

		expect(v.model.visible).toBe(true)
		expect(v.scene.scale.x).toBeCloseTo(0.001, 12)
		const box = new THREE.Box3().setFromObject(v.model)
		const size = box.getSize(new THREE.Vector3())
		// A 10 mm cube is a centimetre across in metres, whatever the scene's units
		expect(size.x).toBeCloseTo(0.01, 9)
		expect(size.y).toBeCloseTo(0.01, 9)
		// Its bottom centre is on the spot that was tapped
		expect(box.min.y).toBeCloseTo(-1.2, 9)
		const centre = box.getCenter(new THREE.Vector3())
		expect(centre.x).toBeCloseTo(0.5, 9)
		expect(centre.z).toBeCloseTo(-2, 9)
		expect(document.querySelector('[role="status"]').textContent).toBe('Placed at real size. Tap somewhere else to move it.')
	})

	it('moves the model to the next spot tapped', async () => {
		const v = viewer()
		const { frame } = await start(v)
		frame({ x: 0, y: 0, z: -1 })
		tap(v.session)
		frame({ x: 2, y: 0, z: -3 })
		tap(v.session)
		v.scene.updateMatrixWorld(true)
		const centre = new THREE.Box3().setFromObject(v.model).getCenter(new THREE.Vector3())
		expect(centre.x).toBeCloseTo(2, 9)
		expect(centre.z).toBeCloseTo(-3, 9)
	})

	it('puts the model where the finger touched, not where the ring is', async () => {
		const v = viewer()
		const { frame } = await start(v)
		// The ring is ahead; the finger is on a patch of floor off to the left
		frame({ x: 0, y: 0, z: -1 }, undefined, { x: -1.5, y: 0, z: -2 })
		tap(v.session)
		v.scene.updateMatrixWorld(true)
		const centre = new THREE.Box3().setFromObject(v.model).getCenter(new THREE.Vector3())
		expect(centre.x).toBeCloseTo(-1.5, 9)
		expect(centre.z).toBeCloseTo(-2, 9)
	})

	it('uses the ring when the browser cannot say what is under the finger', async () => {
		const v = viewer()
		delete v.session.requestHitTestSourceForTransientInput
		const { frame } = await start(v)
		frame({ x: 0.5, y: 0, z: -1 }, undefined, { x: -1.5, y: 0, z: -2 })
		tap(v.session)
		v.scene.updateMatrixWorld(true)
		const centre = new THREE.Box3().setFromObject(v.model).getCenter(new THREE.Vector3())
		expect(centre.x).toBeCloseTo(0.5, 9)
		expect(centre.z).toBeCloseTo(-1, 9)
	})

	it('uses the ring when no floor is under the finger', async () => {
		const v = viewer()
		const { frame } = await start(v)
		frame({ x: 0.5, y: 0, z: -1 })
		tap(v.session)
		v.scene.updateMatrixWorld(true)
		const centre = new THREE.Box3().setFromObject(v.model).getCenter(new THREE.Vector3())
		expect(centre.x).toBeCloseTo(0.5, 9)
	})

	it('places nothing for a tap where no floor was found', async () => {
		const v = viewer()
		const { frame } = await start(v)
		frame(null)
		tap(v.session)
		expect(v.model.visible).toBe(false)
		expect(v.scene.scale.x).toBe(1)
	})

	it('scales a glTF in metres by one, not by a thousandth', async () => {
		const v = viewer(2)
		const { frame } = await start(v, { metresPerUnit: 1 })
		frame({ x: 0, y: 0, z: -1 })
		tap(v.session)
		v.scene.updateMatrixWorld(true)
		expect(new THREE.Box3().setFromObject(v.model).getSize(new THREE.Vector3()).x).toBeCloseTo(2, 9)
	})

	it('draws the floor ring where the floor is, and not when there is none', async () => {
		const v = viewer()
		const { frame } = await start(v)
		const ring = v.scene.getObjectByName('ar-reticle')
		frame({ x: 1, y: -1, z: -2 })
		expect(ring.visible).toBe(true)
		v.scene.updateMatrixWorld(true)
		expect(new THREE.Vector3().setFromMatrixPosition(ring.matrixWorld).toArray()).toEqual([1, -1, -2].map((n) => expect.closeTo(n, 9)))
		frame(null)
		expect(ring.visible).toBe(false)
	})

	it('keeps the ring true to the floor after the scene has been scaled to place the model', async () => {
		const v = viewer()
		const { frame } = await start(v)
		frame({ x: 0, y: 0, z: -1 })
		tap(v.session)
		frame({ x: 1, y: -1, z: -2 })
		v.scene.updateMatrixWorld(true)
		const ring = v.scene.getObjectByName('ar-reticle')
		expect(new THREE.Vector3().setFromMatrixPosition(ring.matrixWorld).toArray()).toEqual([1, -1, -2].map((n) => expect.closeTo(n, 9)))
		// and its radius is still the metres it was drawn in
		ring.geometry.computeBoundingBox()
		const radius = ring.geometry.boundingBox.max.x * new THREE.Vector3().setFromMatrixScale(ring.matrixWorld).x
		expect(radius).toBeCloseTo(0.15, 6)
	})
})

describe('when the session ends', () => {
	it('puts the scene back as the viewer had it, and says so', async () => {
		const v = viewer()
		const { frame, onEnd } = await start(v)
		frame({ x: 1, y: 0, z: -2 })
		tap(v.session)
		const added = v.scene.children.length

		await v.session.end()

		expect(onEnd).toHaveBeenCalledTimes(1)
		expect(v.scene.background).toEqual(new THREE.Color('#123456'))
		expect(v.scene.fog).not.toBeNull()
		expect(v.scene.scale.toArray()).toEqual([1, 1, 1])
		expect(v.scene.position.toArray()).toEqual([0, 0, 0])
		expect(v.grid.visible).toBe(true)
		expect(v.light.visible).toBe(true)
		expect(v.model.visible).toBe(true)
		// Nothing of the session's stays in the scene: the model, grid and light are left
		expect(v.scene.children).toHaveLength(3)
		expect(added).toBeGreaterThan(3)
		expect(v.session.hitTestSource.cancel).toHaveBeenCalled()
		expect(v.renderer.setAnimationLoop).toHaveBeenLastCalledWith(null)
		expect(v.renderer.xr.setReferenceSpaceType).toHaveBeenLastCalledWith('local-floor')
		expect(document.body.querySelector('[role="region"]')).toBeNull()
	})

	it('puts the viewer\'s camera back where it was, though the session moved it to the phone', async () => {
		const v = viewer()
		const camera = new THREE.PerspectiveCamera()
		camera.position.set(20, 15, 30)
		camera.lookAt(3, 5, 3)
		const before = { position: camera.position.clone(), quaternion: camera.quaternion.clone() }
		const { running } = await start(v, { camera })
		// What the browser does on each frame of the session: the camera is the phone
		camera.position.set(0.1, 1.4, 0.2)
		camera.quaternion.set(0, 0.7, 0, 0.7)
		await running.end()
		expect(camera.position.distanceTo(before.position)).toBeLessThan(1e-9)
		expect(camera.quaternion.angleTo(before.quaternion)).toBeLessThan(1e-9)
	})

	it('puts a model that was hidden before back hidden', async () => {
		const v = viewer()
		v.model.visible = false
		await start(v)
		await v.session.end()
		expect(v.model.visible).toBe(false)
	})

	it('is ended by the Exit AR button', async () => {
		const v = viewer()
		const { onEnd } = await start(v)
		const exit = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Exit AR')
		exit.click()
		expect(v.session.end).toHaveBeenCalled()
		expect(onEnd).toHaveBeenCalledTimes(1)
	})

	it('reports the end once, however it comes', async () => {
		const v = viewer()
		const { onEnd } = await start(v)
		v.session.dispatchEvent(new Event('end'))
		v.session.dispatchEvent(new Event('end'))
		expect(onEnd).toHaveBeenCalledTimes(1)
	})
})

describe('the controls over the camera', () => {
	it('keep a tap on them from also placing the model', () => {
		const { root } = createOverlay(document, jest.fn())
		const event = new Event('beforexrselect', { cancelable: true })
		root.dispatchEvent(event)
		expect(event.defaultPrevented).toBe(true)
	})

	it('are named for a screen reader and say what to do in a live region', () => {
		const { root, setHint } = createOverlay(document, jest.fn())
		expect(root.getAttribute('aria-label')).toBe('View in AR')
		setHint('Tap')
		expect(root.querySelector('[role="status"]').textContent).toBe('Tap')
		expect(root.querySelector('button[type="button"]').textContent).toBe('Exit AR')
	})
})

describe('where the scene goes', () => {
	const box = new THREE.Box3(new THREE.Vector3(2, 0, 4), new THREE.Vector3(4, 10, 8))

	it('puts the model\'s bottom centre on the spot, scaled to metres', () => {
		const { position, quaternion } = scenePlacement(box, 0.001, new THREE.Vector3(1, -1, -2))
		expect(quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 9)
		// The box's bottom centre is (3, 0, 6) scene units: 3 mm and 6 mm, so
		expect(position.x).toBeCloseTo(1 - 0.003, 9)
		expect(position.y).toBeCloseTo(-1, 9)
		expect(position.z).toBeCloseTo(-2 - 0.006, 9)
	})

	it('turns the model about its own bottom centre', () => {
		const spot = new THREE.Vector3(0, 0, -1)
		const { position, quaternion } = scenePlacement(box, 1, spot, Math.PI / 2)
		const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1))
		const bottomCentre = new THREE.Vector3(3, 0, 6).applyMatrix4(matrix)
		expect(bottomCentre.toArray()).toEqual(spot.toArray().map((n) => expect.closeTo(n, 9)))
	})

	it('faces the model\'s front at the person', () => {
		expect(yawToward(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1.5, 0))).toBeCloseTo(0, 9)
		expect(yawToward(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1.5, 0))).toBeCloseTo(Math.PI / 2, 9)
		expect(yawToward(new THREE.Vector3(0, 0, 0), null)).toBe(0)
	})
})
