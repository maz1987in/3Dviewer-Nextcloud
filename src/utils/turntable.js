/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * The pure parts of a turntable video: one full turn of the camera around the model.
 * Vectors are three.js Vector3s, passed in; this module imports nothing.
 */

export const TURNTABLE_DEFAULTS = Object.freeze({ seconds: 8, size: '720p', direction: 'cw', fps: 30 })
export const TURNTABLE_SECONDS = Object.freeze({ min: 4, max: 15 })

// Best first. Safari records no WebM, only MP4.
const FORMATS = [
	{ mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
	{ mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
	{ mimeType: 'video/webm', extension: 'webm' },
	{ mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
	{ mimeType: 'video/mp4', extension: 'mp4' },
]

const SIZES = Object.freeze({ '720p': { width: 1280, height: 720 }, '1080p': { width: 1920, height: 1080 } })

/**
 * The best format this browser can record.
 *
 * @param {function(string): boolean} isTypeSupported - MediaRecorder.isTypeSupported
 * @return {?{mimeType: string, extension: 'webm'|'mp4'}} The format, or null when it can
 *   record none of them
 */
export function pickRecordingFormat(isTypeSupported) {
	return FORMATS.find((format) => isTypeSupported(format.mimeType)) ?? null
}

/**
 * @param {number} seconds - The video's length
 * @param {number} [fps] - Frames per second
 * @return {number} How many frames that is
 */
export function frameCount(seconds, fps = TURNTABLE_DEFAULTS.fps) {
	return Math.round(seconds * fps)
}

/**
 * Where the camera is a fraction of the way round the turn.
 *
 * @param {THREE.Vector3} start - Where it starts
 * @param {THREE.Vector3} target - What it turns around
 * @param {THREE.Vector3} up - The axis it turns about (the camera's up)
 * @param {number} fraction - 0 at the start, 1 a full turn
 * @param {'cw'|'ccw'} direction - Clockwise or counter-clockwise, seen from above
 * @return {THREE.Vector3} The position
 */
export function orbitPosition(start, target, up, fraction, direction) {
	// Clockwise seen from above is a negative turn about the up axis
	const angle = (direction === 'ccw' ? 1 : -1) * Math.PI * 2 * fraction
	const axis = up.clone().normalize()
	return start.clone().sub(target).applyAxisAngle(axis, angle).add(target)
}

/**
 * The video's size in pixels. Encoders want even sides.
 *
 * @param {'720p'|'1080p'|'window'} size - The choice
 * @param {{width: number, height: number}} canvas - The canvas's drawing buffer, for 'window'
 * @return {{width: number, height: number}} The size
 */
export function outputSize(size, canvas) {
	const chosen = SIZES[size] ?? canvas
	return { width: Math.max(2, chosen.width - (chosen.width % 2)), height: Math.max(2, chosen.height - (chosen.height % 2)) }
}

/**
 * A file name for the video: `<model>-turntable.<ext>`, counted up when taken.
 *
 * @param {string} modelName - The model's file name
 * @param {string} extension - 'webm' or 'mp4'
 * @param {string[]} existingNames - Names already in the folder
 * @return {string} A free name
 */
export function turntableFileName(modelName, extension, existingNames) {
	const base = String(modelName || 'model').replace(/\.[^./]+$/, '') || 'model'
	const taken = new Set(existingNames.map((name) => name.toLowerCase()))
	let name = `${base}-turntable.${extension}`
	for (let n = 2; taken.has(name.toLowerCase()); n++) {
		name = `${base}-turntable (${n}).${extension}`
	}
	return name
}
