/**
 * Recording a turntable: one frame per step of the turn, handed to MediaRecorder, and the
 * viewer put back exactly as it was afterwards, however the recording ended.
 */
import * as THREE from 'three'
import { ref } from 'vue'
import { useTurntable } from '../../../src/composables/useTurntable.js'

class FakeRecorder {
	static isTypeSupported = jest.fn(() => true)
	constructor(stream, options) {
		this.stream = stream
		this.options = options
		this.state = 'inactive'
		FakeRecorder.last = this
	}

	start() { this.state = 'recording' }
	stop() {
		this.state = 'inactive'
		this.ondataavailable?.({ data: new Blob(['frames'], { type: this.options.mimeType }) })
		setTimeout(() => this.onstop?.(), 0)
	}
}

function setup() {
	const track = { requestFrame: jest.fn(), stop: jest.fn() }
	const canvas = { width: 801, height: 601, style: { width: '800px' }, captureStream: jest.fn(() => ({ getVideoTracks: () => [track], getTracks: () => [track] })) }
	const size = { x: 800, y: 600 }
	const renderer = {
		domElement: canvas,
		pixelRatio: 2,
		getSize: (target) => target.set(size.x, size.y),
		getPixelRatio: () => renderer.pixelRatio,
		setPixelRatio: jest.fn((r) => { renderer.pixelRatio = r }),
		setSize: jest.fn((w, h) => { size.x = w; size.y = h }),
		render: jest.fn(),
	}
	const camera = new THREE.PerspectiveCamera(50, 800 / 600)
	camera.position.set(0, 2, 10)
	const controls = { enabled: true, target: new THREE.Vector3(0, 2, 0) }
	const renderPaused = ref(false)
	let time = 0
	const turntable = useTurntable({
		renderer: () => renderer,
		scene: () => new THREE.Scene(),
		camera: () => camera,
		controls: () => controls,
		renderPaused,
		raf: (callback) => setTimeout(() => callback((time += 34)), 0),
		now: () => time,
	})
	return { turntable, renderer, camera, controls, renderPaused, track, canvas, size }
}

beforeEach(() => {
	global.MediaRecorder = FakeRecorder
	FakeRecorder.isTypeSupported.mockImplementation(() => true)
})
afterEach(() => { delete global.MediaRecorder })

test('records frameCount frames and resolves complete', async () => {
	const { turntable, renderer, track } = setup()
	const result = await turntable.record({ seconds: 4, size: '720p', direction: 'cw' })
	expect(renderer.render).toHaveBeenCalledTimes(120)
	expect(track.requestFrame).toHaveBeenCalledTimes(120)
	expect(result.complete).toBe(true)
	expect(result.extension).toBe('webm')
	expect(result.blob.size).toBeGreaterThan(0)
	expect(turntable.progress.value).toBe(1)
	expect(FakeRecorder.last.options.mimeType).toBe('video/webm;codecs=vp9')
})

test('the camera makes one full turn and ends where it began', async () => {
	const { turntable, camera, renderer } = setup()
	const positions = []
	renderer.render.mockImplementation(() => positions.push(camera.position.clone()))
	await turntable.record({ seconds: 4, size: '720p', direction: 'cw' })
	expect(positions[0].distanceTo(new THREE.Vector3(0, 2, 10))).toBeLessThan(1e-9)
	expect(positions[30].distanceTo(new THREE.Vector3(-10, 2, 0))).toBeLessThan(1e-6)
	expect(camera.position.distanceTo(new THREE.Vector3(0, 2, 10))).toBeLessThan(1e-9)
})

test('stop keeps a partial recording', async () => {
	const { turntable, renderer } = setup()
	renderer.render.mockImplementation(() => { if (renderer.render.mock.calls.length === 10) turntable.stop() })
	const result = await turntable.record({ seconds: 8, size: '720p', direction: 'cw' })
	expect(result.complete).toBe(false)
	expect(renderer.render.mock.calls.length).toBeLessThan(240)
	expect(turntable.stoppedReason.value).toBe('stopped')
})

test('hiding the page stops and keeps the recording', async () => {
	const { turntable, renderer } = setup()
	renderer.render.mockImplementation(() => {
		if (renderer.render.mock.calls.length === 5) {
			Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
			document.dispatchEvent(new Event('visibilitychange'))
		}
	})
	const result = await turntable.record({ seconds: 8, size: '720p', direction: 'cw' })
	Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
	expect(result.complete).toBe(false)
	expect(turntable.stoppedReason.value).toBe('hidden')
})

test('a render error restores everything', async () => {
	const { turntable, renderer, camera, controls, renderPaused, size } = setup()
	renderer.render.mockImplementation(() => { if (renderer.render.mock.calls.length === 3) throw new Error('context lost') })
	await expect(turntable.record({ seconds: 4, size: '1080p', direction: 'cw' })).rejects.toThrow('context lost')
	expect([size.x, size.y]).toEqual([800, 600])
	expect(renderer.pixelRatio).toBe(2)
	expect(camera.aspect).toBeCloseTo(800 / 600, 9)
	expect(camera.position.distanceTo(new THREE.Vector3(0, 2, 10))).toBeLessThan(1e-9)
	expect(controls.enabled).toBe(true)
	expect(controls.target.distanceTo(new THREE.Vector3(0, 2, 0))).toBeLessThan(1e-9)
	expect(renderPaused.value).toBe(false)
	expect(turntable.isRecording.value).toBe(false)
	expect(turntable.stoppedReason.value).toBe('error')
})

test('settings are restored after a normal finish', async () => {
	const { turntable, renderer, camera, controls, renderPaused, size, track } = setup()
	await turntable.record({ seconds: 4, size: '1080p', direction: 'ccw' })
	expect([size.x, size.y]).toEqual([800, 600])
	expect(renderer.pixelRatio).toBe(2)
	expect(camera.aspect).toBeCloseTo(800 / 600, 9)
	expect(controls.enabled).toBe(true)
	expect(renderPaused.value).toBe(false)
	expect(track.stop).toHaveBeenCalled()
})

test('size and pixel ratio are set for 1080p without touching the canvas style', async () => {
	const { turntable, renderer, canvas, camera } = setup()
	let during = null
	renderer.render.mockImplementation(() => { during ??= { aspect: camera.aspect } })
	await turntable.record({ seconds: 4, size: '1080p', direction: 'cw' })
	expect(renderer.setPixelRatio).toHaveBeenCalledWith(1)
	expect(renderer.setSize).toHaveBeenCalledWith(1920, 1080, false)
	expect(during.aspect).toBeCloseTo(1920 / 1080, 9)
	expect(canvas.style.width).toBe('800px')
})

test('the window size is the canvas size, rounded to even', async () => {
	const { turntable, renderer } = setup()
	await turntable.record({ seconds: 4, size: 'window', direction: 'cw' })
	expect(renderer.setSize).toHaveBeenCalledWith(800, 600, false)
})

test('a second record while recording rejects', async () => {
	const { turntable } = setup()
	const first = turntable.record({ seconds: 4, size: '720p', direction: 'cw' })
	await expect(turntable.record({ seconds: 4, size: '720p', direction: 'cw' })).rejects.toThrow()
	await first
})

test('isSupported is false without MediaRecorder', () => {
	delete global.MediaRecorder
	const { turntable } = setup()
	expect(turntable.isSupported.value).toBe(false)
	global.MediaRecorder = FakeRecorder
	FakeRecorder.isTypeSupported.mockImplementation(() => false)
	expect(setup().turntable.isSupported.value).toBe(false)
})
