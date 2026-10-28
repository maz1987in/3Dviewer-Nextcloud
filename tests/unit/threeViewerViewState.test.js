/**
 * What "Copy link to this view" captures from the full viewer: the camera always, and
 * the cut and the exploded view only while they are on, so a link never switches on a
 * tool the sender had off.
 */
import * as THREE from 'three'
import { captureViewState, decodeView, encodeView } from '../../src/utils/viewLink.js'

const perspective = (position) => {
	const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
	camera.position.set(...position)
	return camera
}
const off = {
	renderMode: 'standard',
	wireframe: false,
	lightingPreset: 'default',
	clipping: { isActive: false, mode: 'plane', axis: 'y', position: 0, flipped: false, boxOffsets: {} },
	exploded: { isActive: false, factor: 0 },
	highlightedNoteId: null,
}

describe('captureViewState', () => {
	it('captures only what is switched on', () => {
		const view = captureViewState({ ...off, camera: perspective([3, 4, 5]), controls: { target: new THREE.Vector3(0, 1, 0) } })
		expect(view).toEqual({
			camera: { position: [3, 4, 5], target: [0, 1, 0], zoom: 1, projection: 'perspective' },
			renderMode: 'standard',
			wireframe: false,
			lighting: 'default',
		})
	})

	it('captures an active plane cut, the exploded amount and a highlighted note', () => {
		const view = captureViewState({
			...off,
			camera: perspective([1, 1, 1]),
			controls: { target: new THREE.Vector3() },
			clipping: { isActive: true, mode: 'plane', axis: 'x', position: 0.3, flipped: false, boxOffsets: {} },
			exploded: { isActive: true, factor: 0.5 },
			highlightedNoteId: 12,
		})
		expect(view.clipping).toEqual({ mode: 'plane', axis: 'x', position: 0.3, flipped: false })
		expect(view.exploded).toBe(0.5)
		expect(view.note).toBe(12)
	})

	it('captures an active box cut', () => {
		const offsets = { xMin: 0.1, xMax: 0, yMin: 0, yMax: 0.2, zMin: 0, zMax: 0.3 }
		const view = captureViewState({
			...off,
			camera: perspective([1, 1, 1]),
			controls: { target: new THREE.Vector3() },
			clipping: { isActive: true, mode: 'box', axis: 'y', position: 0, flipped: false, boxOffsets: offsets },
		})
		expect(view.clipping).toEqual({ mode: 'box', offsets })
	})

	it('treats an orthographic camera as orthographic and keeps its zoom', () => {
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
		camera.position.set(0, 0, 10)
		camera.zoom = 2.5
		const view = captureViewState({ ...off, camera, controls: { target: new THREE.Vector3() } })
		expect(view.camera).toEqual({ position: [0, 0, 10], target: [0, 0, 0], zoom: 2.5, projection: 'orthographic' })
	})

	it('is null without a camera or controls', () => {
		expect(captureViewState({ ...off, camera: null, controls: null })).toBeNull()
	})

	it('writes a link that reads back as what was captured', () => {
		const view = captureViewState({ ...off, renderMode: 'xray', camera: perspective([1, 2, 3]), controls: { target: new THREE.Vector3() } })
		expect(decodeView(encodeView(view))).toEqual(view)
	})
})
