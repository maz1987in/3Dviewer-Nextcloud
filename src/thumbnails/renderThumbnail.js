/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Fixed-look thumbnail renderer. Every thumbnail, whether made in the viewer or in a
 * background worker, goes through here so they all look the same: transparent
 * background, the default lighting preset and the viewer's default camera framing.
 *
 * Runs in a Web Worker as well as on the main thread, so it must not touch `document`
 * or `window`, and imports only plain-data config modules (not viewer-config.js).
 */

import {
	AmbientLight,
	Box3,
	DirectionalLight,
	PerspectiveCamera,
	PointLight,
	Scene,
	WebGLRenderer,
} from 'three'
import { DEFAULT_CAMERA_FOV } from '../config/cameraDefaults.js'
import { LIGHT_LAYOUT, LIGHTING_PRESETS } from '../config/lightingPresets.js'
import { computeCameraFit } from './cameraFit.js'
import { EmptyModelError } from './errors.js'

// Defined beside the worker's own errors; re-exported so callers keep one import site
export { EmptyModelError }

const DEFAULT_SIZE = 512
const PNG = 'image/png'

/**
 * Add the default lighting preset to a scene.
 *
 * @param {THREE.Scene} scene - Scene to light
 */
function addDefaultLights(scene) {
	const preset = LIGHTING_PRESETS.default

	scene.add(new AmbientLight(LIGHT_LAYOUT.ambientColor, preset.ambient.intensity))

	const directional = new DirectionalLight(LIGHT_LAYOUT.directionalColor, preset.directional.intensity)
	directional.position.set(preset.directional.x, preset.directional.y, preset.directional.z)
	scene.add(directional)

	const point = new PointLight(LIGHT_LAYOUT.pointColor, preset.point.intensity, LIGHT_LAYOUT.pointDistance)
	point.position.set(LIGHT_LAYOUT.pointPosition.x, LIGHT_LAYOUT.pointPosition.y, LIGHT_LAYOUT.pointPosition.z)
	scene.add(point)
}

/**
 * Encode the canvas as a PNG blob.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - Canvas holding the rendered frame
 * @return {Promise<Blob>} The PNG
 */
function encodePng(canvas) {
	if (typeof canvas.convertToBlob === 'function') {
		return canvas.convertToBlob({ type: PNG })
	}
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob)
			} else {
				reject(new Error('Could not encode the thumbnail as PNG'))
			}
		}, PNG)
	})
}

/**
 * Render a model to a transparent PNG.
 *
 * The model is placed in a temporary scene for the render and put back under its
 * original parent afterwards; its materials and transforms are not modified.
 *
 * @param {THREE.Object3D} object3D - Model to render
 * @param {object} options - Render options
 * @param {HTMLCanvasElement|OffscreenCanvas} options.canvas - Canvas to render on
 * @param {number} [options.size] - Width and height in pixels
 * @param {number} [options.fovDegrees] - Camera field of view, the viewer default when omitted
 * @return {Promise<Blob>} The PNG
 * @throws {EmptyModelError} When the model has no geometry to frame
 */
export async function renderThumbnail(object3D, { canvas, size = DEFAULT_SIZE, fovDegrees } = {}) {
	const renderer = new WebGLRenderer({
		canvas,
		alpha: true,
		preserveDrawingBuffer: true,
		antialias: true,
	})

	const originalParent = object3D.parent
	const originalIndex = originalParent ? originalParent.children.indexOf(object3D) : -1
	const scene = new Scene()
	let moved = false

	/**
	 * Take the model out of the temporary scene and back under its original parent.
	 * Safe to call more than once, and a no-op if the model never left its parent.
	 */
	const restoreModel = () => {
		if (!moved) {
			return
		}
		moved = false
		scene.remove(object3D)
		if (originalParent) {
			// Back at its old index, so sibling order is unchanged
			originalParent.children.splice(originalIndex, 0, object3D)
			object3D.parent = originalParent
		}
		object3D.updateWorldMatrix(true, true)
	}

	try {
		renderer.setClearColor(0x000000, 0)
		renderer.setPixelRatio(1)
		renderer.setSize(size, size, false)

		// Scene.add detaches the model from its parent, so its world matrix is now
		// relative to the scene, which is what both the fit and the render use.
		scene.add(object3D)
		moved = true
		object3D.updateWorldMatrix(true, true)

		const fov = fovDegrees ?? DEFAULT_CAMERA_FOV
		const fit = computeCameraFit(new Box3().setFromObject(object3D), fov)
		if (!fit) {
			throw new EmptyModelError()
		}

		// Same near/far scaling the viewer applies after fitting
		const distance = fit.position[2] - fit.target[2]
		const camera = new PerspectiveCamera(fov, 1, distance / 100, distance * 100)
		camera.position.set(...fit.position)
		camera.lookAt(...fit.target)
		camera.updateMatrixWorld()

		addDefaultLights(scene)
		renderer.render(scene, camera)

		// The render is synchronous and the encode snapshots the bitmap when it is
		// called, so give a live model back to its parent before awaiting the encode:
		// the viewer's frame loop must not draw without it in the meantime.
		const encoded = encodePng(canvas)
		restoreModel()

		// Encode before the context is lost, or the drawing buffer is gone
		return await encoded
	} finally {
		restoreModel()
		scene.clear()
		renderer.dispose()
		renderer.forceContextLoss()
	}
}
