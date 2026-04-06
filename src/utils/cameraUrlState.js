/**
 * Camera URL state — serialize and deserialize a camera viewpoint to a
 * compact `cam=...` query parameter so users can share a link that reopens
 * the model at exactly the same angle.
 *
 * Why a custom compact format instead of JSON?
 * - URLs have practical length limits (~2 KB is safe, some webhooks truncate
 *   past 1 KB). A JSON blob with 7 float keys runs ~120+ chars after
 *   encoding; a comma-separated list of 7 fixed-precision floats runs ~60.
 * - Copy-paste friendliness: the compact form is visibly short, which
 *   matters for IM/email previews.
 *
 * Format (7 comma-separated floats, fixed 4 decimal precision):
 *   {px,py,pz,tx,ty,tz,z}
 * where:
 *   px,py,pz = camera world position
 *   tx,ty,tz = controls target (look-at point)
 *   z        = camera.zoom (1 for perspective at default distance)
 *
 * Example:
 *   ?cam=1.2345,0.5000,-0.8000,0.0000,0.1000,0.0000,1.0000
 *
 * Callers should defer applying state until after the model is loaded AND
 * its bounding box has been used to place the default camera — otherwise
 * `fitToView` will stomp on the restored state one render frame later.
 */

import { logger } from './logger.js'

const PRECISION = 4
const URL_PARAM = 'cam'

/**
 * Build the `cam` query parameter value from a Three.js camera + controls pair.
 *
 * @param {THREE.Camera} camera - Perspective or Orthographic camera
 * @param {Object} controls - OrbitControls instance (needs `.target`)
 * @return {string|null} The serialized string, or null if inputs are invalid
 */
export function serializeCameraState(camera, controls) {
	try {
		if (!camera || !camera.position || !controls || !controls.target) {
			return null
		}
		const p = camera.position
		const t = controls.target
		const zoom = typeof camera.zoom === 'number' ? camera.zoom : 1
		const parts = [
			p.x, p.y, p.z,
			t.x, t.y, t.z,
			zoom,
		].map(n => Number(n).toFixed(PRECISION))
		return parts.join(',')
	} catch (e) {
		logger.warn('cameraUrlState', 'Failed to serialize camera state', e)
		return null
	}
}

/**
 * Parse a `cam` query parameter value back into a plain object.
 * Returns null for any malformed input so callers can silently fall back
 * to default camera placement.
 *
 * @param {string} value - The raw `cam` parameter value
 * @return {{position: {x,y,z}, target: {x,y,z}, zoom: number}|null}
 */
export function parseCameraState(value) {
	if (typeof value !== 'string' || value.length === 0) return null
	const parts = value.split(',')
	if (parts.length !== 7) return null
	const nums = parts.map(Number)
	if (nums.some(n => !Number.isFinite(n))) return null
	return {
		position: { x: nums[0], y: nums[1], z: nums[2] },
		target: { x: nums[3], y: nums[4], z: nums[5] },
		zoom: nums[6],
	}
}

/**
 * Read the `cam` parameter from the current window URL and parse it.
 * Returns null when the param is absent or malformed.
 *
 * @return {{position, target, zoom}|null}
 */
export function readCameraStateFromUrl() {
	if (typeof window === 'undefined' || !window.location) return null
	const params = new URLSearchParams(window.location.search)
	const raw = params.get(URL_PARAM)
	if (!raw) return null
	return parseCameraState(raw)
}

/**
 * Build a full shareable URL for the current page with the given camera
 * state appended as `cam=...`. Preserves all other query params (fileId,
 * filename, dir, etc.) so the link round-trips through the existing viewer
 * routing unchanged.
 *
 * @param {string} serialized - Output of serializeCameraState
 * @return {string} Full absolute URL
 */
export function buildShareableUrl(serialized) {
	if (typeof window === 'undefined') return ''
	const url = new URL(window.location.href)
	if (serialized) {
		url.searchParams.set(URL_PARAM, serialized)
	} else {
		url.searchParams.delete(URL_PARAM)
	}
	return url.toString()
}

/**
 * Apply a parsed camera state to a Three.js camera + controls pair.
 *
 * Callers MUST invoke this AFTER initial fitToView so the restored view
 * isn't immediately overwritten by auto-fit. The helper calls
 * `controls.update()` at the end so the OrbitControls internal state
 * (spherical distance, etc.) matches the new position.
 *
 * @param {THREE.Camera} camera
 * @param {Object} controls - OrbitControls instance
 * @param {{position, target, zoom}} state
 * @return {boolean} True on success, false if inputs were invalid
 */
export function applyCameraState(camera, controls, state) {
	try {
		if (!camera || !controls || !state) return false
		if (!state.position || !state.target) return false

		camera.position.set(state.position.x, state.position.y, state.position.z)
		controls.target.set(state.target.x, state.target.y, state.target.z)
		if (typeof state.zoom === 'number' && Number.isFinite(state.zoom)) {
			camera.zoom = state.zoom
			if (typeof camera.updateProjectionMatrix === 'function') {
				camera.updateProjectionMatrix()
			}
		}
		camera.lookAt(controls.target)
		if (typeof controls.update === 'function') {
			controls.update()
		}
		return true
	} catch (e) {
		logger.warn('cameraUrlState', 'Failed to apply camera state', e)
		return false
	}
}

export const CAMERA_URL_PARAM = URL_PARAM
