/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Record a turntable video: the camera makes one full turn around what it looks at, and
 * every frame of the turn is drawn once and handed to a MediaRecorder.
 *
 * The viewer's own render loop is paused while this one runs (`renderPaused`), so nothing
 * else moves the camera or draws in between. Each frame is sent explicitly
 * (`captureStream(0)` and `requestFrame()`), so a slow frame is a later frame, not a
 * dropped one. The renderer is resized for the video and everything it changes is put
 * back afterwards, whether the recording finished, was stopped, or failed. A hidden tab
 * throttles timers, so hiding the page ends the recording and keeps what was recorded.
 */

import { ref, computed, isRef } from 'vue'
import * as THREE from 'three'
import { TURNTABLE_DEFAULTS, recorderFormat, frameCount, orbitPosition, outputSize } from '../utils/turntable.js'

/**
 * @param {unknown} source - A ref, a getter or a value
 * @return {unknown} Its current value
 */
const read = (source) => (isRef(source) ? source.value : (typeof source === 'function' ? source() : source))

/**
 * @param {object} viewer - What the recording works on; each a ref, a getter or a value
 * @param {unknown} viewer.renderer - The WebGLRenderer
 * @param {unknown} viewer.scene - The scene
 * @param {unknown} viewer.camera - The camera
 * @param {unknown} viewer.controls - The orbit controls
 * @param {import('vue').Ref<boolean>} viewer.renderPaused - Pauses the viewer's own loop
 * @param {function(function(number): void): number} [viewer.raf] - Frame scheduler (tests pass their own)
 * @param {function(): number} [viewer.now] - Milliseconds, for frame timing
 * @param {function(): void} [viewer.beforeRender] - Runs before each frame is drawn, once
 *   the camera is in place: what the viewer's own loop would do, such as turning labels
 *   to face the camera
 * @return {object} The recording's state and methods
 */
export function useTurntable({ renderer, scene, camera, controls, renderPaused, raf = null, now = null, beforeRender = null }) {
	const schedule = raf ?? ((callback) => window.requestAnimationFrame(callback))
	const clock = now ?? (() => window.performance.now())

	const isRecording = ref(false)
	const progress = ref(0)
	const stoppedReason = ref(null)
	let stopRequested = null

	const format = computed(() => {
		const canvas = read(renderer)?.domElement
		return canvas && typeof canvas.captureStream !== 'function' ? null : recorderFormat()
	})
	const isSupported = computed(() => format.value !== null)

	const stop = () => {
		if (isRecording.value && !stopRequested) {
			stopRequested = 'stopped'
		}
	}

	/**
	 * Record one turn.
	 *
	 * @param {object} [options] - Options
	 * @param {number} [options.seconds] - Length, 4 to 15
	 * @param {'720p'|'1080p'|'window'} [options.size] - Video size
	 * @param {'cw'|'ccw'} [options.direction] - Seen from above
	 * @return {Promise<{blob: Blob, extension: string, complete: boolean}>} The video;
	 *   `complete` false when it was stopped or the page was hidden
	 */
	const record = async ({ seconds = TURNTABLE_DEFAULTS.seconds, size = TURNTABLE_DEFAULTS.size, direction = TURNTABLE_DEFAULTS.direction } = {}) => {
		if (isRecording.value) {
			throw new Error('A turntable is already recording')
		}
		const glRenderer = read(renderer)
		const cam = read(camera)
		const orbit = read(controls)
		const chosen = format.value
		if (!glRenderer || !cam || !chosen) {
			throw new Error('This browser can\'t record video')
		}

		isRecording.value = true
		progress.value = 0
		stoppedReason.value = null
		stopRequested = null

		// Everything this changes, to put back
		const saved = {
			size: glRenderer.getSize(new THREE.Vector2()),
			pixelRatio: glRenderer.getPixelRatio(),
			position: cam.position.clone(),
			aspect: cam.aspect,
			frustum: cam.isOrthographicCamera ? [cam.left, cam.right, cam.top, cam.bottom] : null,
			controlsEnabled: orbit?.enabled,
			target: orbit?.target?.clone() ?? null,
			paused: renderPaused?.value ?? false,
		}
		const target = orbit?.target?.clone() ?? new THREE.Vector3()
		const start = cam.position.clone()
		const frames = frameCount(seconds)
		const interval = 1000 / TURNTABLE_DEFAULTS.fps
		const onVisibility = () => {
			if (document.visibilityState === 'hidden' && !stopRequested) {
				stopRequested = 'hidden'
			}
		}

		let stream = null
		let recorder = null
		const chunks = []
		try {
			if (renderPaused) {
				renderPaused.value = true
			}
			if (orbit) {
				orbit.enabled = false
			}
			const canvas = glRenderer.domElement
			const { width, height } = outputSize(size, { width: canvas.width, height: canvas.height })
			glRenderer.setPixelRatio(1)
			// false: the drawing buffer changes, the canvas keeps its place on the page
			glRenderer.setSize(width, height, false)
			if (cam.isPerspectiveCamera) {
				cam.aspect = width / height
			} else if (cam.isOrthographicCamera) {
				// The same height of the scene, as wide as the video
				const half = (cam.top - cam.bottom) / 2 * (width / height)
				const centre = (cam.left + cam.right) / 2
				cam.left = centre - half
				cam.right = centre + half
			}
			cam.updateProjectionMatrix()

			stream = canvas.captureStream(0)
			const track = stream.getVideoTracks()[0]
			recorder = new globalThis.MediaRecorder(stream, { mimeType: chosen.mimeType, videoBitsPerSecond: 8_000_000 })
			recorder.ondataavailable = (event) => {
				if (event.data?.size) {
					chunks.push(event.data)
				}
			}
			// Listened for from the start: a recorder can stop on its own, when its encoder
			// fails, and stopping it again then does nothing
			let endedEarly = null
			const stopped = new Promise((resolve, reject) => {
				recorder.onstop = () => (endedEarly ? reject(endedEarly) : resolve())
				recorder.onerror = (event) => {
					endedEarly = event?.error ?? new Error('The video could not be recorded')
					reject(endedEarly)
				}
			})
			stopped.catch(() => {})
			recorder.start()
			document.addEventListener('visibilitychange', onVisibility)

			const scene3d = read(scene)
			let frame = 0
			let last = -Infinity
			await new Promise((resolve, reject) => {
				const step = (time) => {
					try {
						if (recorder.state === 'inactive') {
							endedEarly ??= new Error('The recorder stopped before the turn was done')
							reject(endedEarly)
							return
						}
						if (stopRequested) {
							resolve()
							return
						}
						const at = time ?? clock()
						if (at - last >= interval - 0.5) {
							last = at
							cam.position.copy(orbitPosition(start, target, cam.up, frame / frames, direction))
							cam.lookAt(target)
							beforeRender?.()
							glRenderer.render(scene3d, cam)
							track?.requestFrame?.()
							frame++
							progress.value = frame / frames
							if (frame >= frames) {
								resolve()
								return
							}
						}
						schedule(step)
					} catch (error) {
						reject(error)
					}
				}
				schedule(step)
			})

			recorder.stop()
			await stopped
			stoppedReason.value = stopRequested
			const mimeType = chosen.mimeType.split(';')[0]
			return { blob: new Blob(chunks, { type: mimeType }), extension: chosen.extension, complete: !stopRequested }
		} catch (error) {
			stoppedReason.value = 'error'
			if (recorder && recorder.state !== 'inactive') {
				try {
					recorder.stop()
				} catch (e) {
					// Already stopping: nothing to keep
				}
			}
			throw error
		} finally {
			document.removeEventListener('visibilitychange', onVisibility)
			stream?.getTracks?.().forEach((track) => track.stop())
			glRenderer.setPixelRatio(saved.pixelRatio)
			glRenderer.setSize(saved.size.x, saved.size.y, false)
			if (cam.isPerspectiveCamera) {
				cam.aspect = saved.aspect
			} else if (saved.frustum) {
				[cam.left, cam.right, cam.top, cam.bottom] = saved.frustum
			}
			cam.updateProjectionMatrix()
			cam.position.copy(saved.position)
			if (orbit) {
				orbit.enabled = saved.controlsEnabled
				if (saved.target) {
					orbit.target.copy(saved.target)
				}
			}
			cam.lookAt(saved.target ?? target)
			if (renderPaused) {
				renderPaused.value = saved.paused
			}
			isRecording.value = false
			stopRequested = null
		}
	}

	const dispose = () => stop()

	return { isSupported, format, isRecording, progress, stoppedReason, record, stop, dispose }
}
