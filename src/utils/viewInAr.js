/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR: which way a phone can show the open model in the room, how big it is there,
 * and when a model is too heavy to try. The pure decisions are here; the files and
 * sessions they lead to are loaded only when someone presses the button (src/ar/).
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

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

/**
 * Whether View in AR is at work, so a press does nothing: the file is being written or
 * the session is starting ('preparing'), or a session runs ('active').
 *
 * @param {string} state - useViewInAR's state
 * @return {boolean} Whether a press is to be ignored
 */
export function isArBusy(state) {
	return state === 'preparing' || state === 'active'
}

/**
 * What the button says, by useViewInAR's state. The full viewer's panel and the light
 * viewer's button say the same.
 *
 * @param {string} state - useViewInAR's state
 * @return {string} "View in AR", "Preparing AR…", or "Open in AR" when a file waits for a tap
 */
export function arButtonLabel(state) {
	if (state === 'preparing') {
		return t('threedviewer', 'Preparing AR…')
	}
	return state === 'ready' ? t('threedviewer', 'Open in AR') : t('threedviewer', 'View in AR')
}

/**
 * Whether the light viewer (ViewerComponent) offers View in AR. Not in a frame on another
 * site: a WebXR session there needs the frame to allow `xr-spatial-tracking`, which only the
 * site that frames it can grant, and Quick Look from inside a frame is not dependable. The
 * frame's "Open in Nextcloud" link leads to the share page, which offers it.
 *
 * @param {?string} path - A value of AR_PATH, or null where the device has no way
 * @param {object} [where] - Where the viewer is
 * @param {boolean} [where.embedded] - In the embed page, framed by another site
 * @return {boolean} Whether to show the button
 */
export function lightViewerOffersAr(path, { embedded = false } = {}) {
	return Object.values(AR_PATH).includes(path) && !embedded
}
