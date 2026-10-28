/**
 * The pure parts of a turntable recording: which format the browser can record, where the
 * camera is at each frame, what size the video is, and what the file is called.
 */
import * as THREE from 'three'
import { TURNTABLE_DEFAULTS, TURNTABLE_SECONDS, pickRecordingFormat, frameCount, orbitPosition, outputSize, turntableFileName } from '../../../src/utils/turntable.js'

describe('pickRecordingFormat', () => {
	test('prefers VP9 WebM', () => {
		expect(pickRecordingFormat(() => true)).toEqual({ mimeType: 'video/webm;codecs=vp9', extension: 'webm' })
	})

	test('falls back to MP4 when WebM is unsupported (Safari)', () => {
		expect(pickRecordingFormat((type) => type.startsWith('video/mp4'))).toEqual({ mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' })
	})

	test('pickRecordingFormat returns null when nothing is supported', () => {
		expect(pickRecordingFormat(() => false)).toBeNull()
	})
})

test('defaults and limits', () => {
	expect(TURNTABLE_DEFAULTS).toEqual({ seconds: 8, size: '720p', direction: 'cw', fps: 30 })
	expect(TURNTABLE_SECONDS).toEqual({ min: 4, max: 15 })
})

test('8 s at 30 fps is 240 frames', () => {
	expect(frameCount(8)).toBe(240)
	expect(frameCount(4, 30)).toBe(120)
})

describe('orbitPosition', () => {
	const target = new THREE.Vector3(0, 0, 0)
	const up = new THREE.Vector3(0, 1, 0)
	const start = new THREE.Vector3(0, 0, 10)

	test('fraction 0 and 1 return the start position; 0.25 cw from +Z, about +Y, gives -X', () => {
		expect(orbitPosition(start, target, up, 0, 'cw').distanceTo(start)).toBeLessThan(1e-9)
		expect(orbitPosition(start, target, up, 1, 'cw').distanceTo(start)).toBeLessThan(1e-9)
		// Seen from above, +X is to the right and +Z toward the bottom: clockwise from the
		// bottom goes left, to -X
		const quarter = orbitPosition(start, target, up, 0.25, 'cw')
		expect(quarter.distanceTo(new THREE.Vector3(-10, 0, 0))).toBeLessThan(1e-9)
		expect(orbitPosition(start, target, up, 0.25, 'ccw').distanceTo(new THREE.Vector3(10, 0, 0))).toBeLessThan(1e-9)
	})

	test('distance to the target and height along up stay constant', () => {
		const from = new THREE.Vector3(3, 4, 5)
		const centre = new THREE.Vector3(1, 1, 1)
		for (const fraction of [0.1, 0.33, 0.5, 0.9]) {
			const at = orbitPosition(from, centre, up, fraction, 'cw')
			expect(at.distanceTo(centre)).toBeCloseTo(from.distanceTo(centre), 9)
			expect(at.y).toBeCloseTo(from.y, 9)
		}
	})

	test('turns about a Z up as well', () => {
		const at = orbitPosition(new THREE.Vector3(10, 0, 2), target, new THREE.Vector3(0, 0, 1), 0.5, 'cw')
		expect(at.distanceTo(new THREE.Vector3(-10, 0, 2))).toBeLessThan(1e-9)
	})
})

describe('outputSize', () => {
	test('fixed sizes', () => {
		expect(outputSize('720p', { width: 999, height: 555 })).toEqual({ width: 1280, height: 720 })
		expect(outputSize('1080p', { width: 999, height: 555 })).toEqual({ width: 1920, height: 1080 })
	})

	test('odd window sizes round to even', () => {
		expect(outputSize('window', { width: 1001, height: 577 })).toEqual({ width: 1000, height: 576 })
	})
})

describe('turntableFileName', () => {
	test('names the video after the model', () => {
		expect(turntableFileName('cube.stl', 'webm', [])).toBe('cube-turntable.webm')
		expect(turntableFileName('my.part.v2.obj', 'mp4', [])).toBe('my.part.v2-turntable.mp4')
	})

	test('name collisions count up to (3)', () => {
		expect(turntableFileName('model.glb', 'webm', ['model-turntable.webm', 'Model-Turntable (2).webm', 'other.webm'])).toBe('model-turntable (3).webm')
	})
})
