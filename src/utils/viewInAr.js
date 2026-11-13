/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR: which way a phone can show the open model in the room, how big it is there,
 * and when a model is too heavy to try. The pure decisions are here; the files and
 * sessions they lead to are loaded only when someone presses the button (src/ar/).
 */

/** The ways a device can show a model in the room. */
export const AR_PATH = Object.freeze({
	/** iPhone and iPad: a USDZ file opened in AR Quick Look. */
	QUICK_LOOK: 'quick-look',
	/** Android Chrome and other WebXR browsers: a live `immersive-ar` session. */
	WEBXR: 'webxr',
})

/**
 * @param {Document} [doc] - The page
 * @return {boolean} Whether this browser opens `<a rel="ar">` links in AR Quick Look
 */
export function supportsQuickLook(doc = typeof document === 'undefined' ? null : document) {
	try {
		return !!doc?.createElement('a').relList?.supports?.('ar')
	} catch {
		return false
	}
}

/**
 * @param {?object} [xr] - `navigator.xr`
 * @return {Promise<boolean>} Whether this browser can start an `immersive-ar` session
 */
export async function supportsWebXrAr(xr = typeof navigator === 'undefined' ? null : navigator.xr) {
	if (typeof xr?.isSessionSupported !== 'function') {
		return false
	}
	try {
		return !!(await xr.isSessionSupported('immersive-ar'))
	} catch {
		return false
	}
}

/**
 * Which way this device can show a model in the room, or null where there is none (a
 * desktop), so the button is not offered. WebXR is asked first, as model-viewer does:
 * a browser that has a live session can place the model on the floor, and Quick Look
 * is for the ones that don't, Safari on an iPhone, an iPad or a Vision Pro.
 *
 * @param {object} [env] - What to ask, for a test
 * @param {Document} [env.doc] - The page
 * @param {?object} [env.xr] - `navigator.xr`
 * @return {Promise<?string>} A value of AR_PATH, or null
 */
export async function detectArPath({ doc, xr } = {}) {
	if (await supportsWebXrAr(xr)) {
		return AR_PATH.WEBXR
	}
	return supportsQuickLook(doc) ? AR_PATH.QUICK_LOOK : null
}
