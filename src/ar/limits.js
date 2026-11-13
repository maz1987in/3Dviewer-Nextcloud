/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR's numbers: how big the model is in the room, and when it is too heavy for a
 * phone to try. Loaded when the button is pressed.
 */

import { AR_PATH } from '../utils/viewInAr.js'

/**
 * Triangle counts past which a phone is asked too much, by way. Quick Look needs the whole
 * model written as a file first (three writes USDZ geometry as text, so a million
 * triangles is a file of well over 100 MB made on the phone); WebXR draws the model as it
 * is, every frame, with no file to make, so it takes more before a phone's memory or
 * frame rate gives out. Past `warn` the person is told it may take a while or run slowly;
 * past `refuse` it is not tried.
 */
export const AR_TRIANGLES = Object.freeze({
	[AR_PATH.QUICK_LOOK]: Object.freeze({ warn: 250_000, refuse: 1_000_000 }),
	[AR_PATH.WEBXR]: Object.freeze({ warn: 1_000_000, refuse: 3_000_000 }),
})

/**
 * AR viewers place models in metres.
 *
 * @param {number} millimetresPerUnit - Millimetres a scene unit is, from the file
 *   (utils/sourceUnits.js; 1 for an STL, 1000 for a glTF)
 * @return {number} Metres a scene unit is, which is the scale the model is shown at
 */
export function metresPerUnit(millimetresPerUnit) {
	return Number.isFinite(millimetresPerUnit) && millimetresPerUnit > 0 ? millimetresPerUnit / 1000 : 1
}

/**
 * Whether to go ahead with a model of this many triangles.
 *
 * @param {number} triangles - The model's triangle count
 * @param {string} path - A value of AR_PATH
 * @return {{verdict: string, limit: number}} `verdict` is 'ok', 'warn' (try, and say it may
 *   take a while) or 'refuse'; `limit` is the count past which it refuses
 */
export function arSizeVerdict(triangles, path) {
	const limits = AR_TRIANGLES[path] ?? AR_TRIANGLES[AR_PATH.QUICK_LOOK]
	if (triangles > limits.refuse) {
		return { verdict: 'refuse', limit: limits.refuse }
	}
	return { verdict: triangles > limits.warn ? 'warn' : 'ok', limit: limits.refuse }
}
