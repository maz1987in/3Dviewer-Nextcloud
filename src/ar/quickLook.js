/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * View in AR on an iPhone or iPad: the model as a USDZ file, opened in AR Quick Look.
 * Loaded when the button is pressed, with the USDZ exporter after it.
 *
 * Safari opens Quick Look for a click on `<a rel="ar" href="file.usdz">` whose first child
 * is an `<img>`; the link needs no visible image. This is what model-viewer does too.
 */

import { buildUsdz } from '../utils/usdz.js'

export const USDZ_MIME_TYPE = 'model/vnd.usdz+zip'

/**
 * Quick Look is told not to let the person pinch the model bigger or smaller: it is
 * shown at the size it really is, which is what View in AR is for.
 *
 * @param {string} url - The file's address
 * @return {string} The address Quick Look is opened with
 */
export function quickLookHref(url) {
	return `${url}#allowsContentScaling=0`
}

/**
 * The model as a file Quick Look opens, at real size.
 *
 * @param {THREE.Object3D} object - The model
 * @param {object} [options] - Options
 * @param {number} [options.millimetresPerUnit] - Millimetres per scene unit
 * @return {Promise<Blob>} The USDZ file
 * @throws {NothingToExportError} When the model has no triangles to show
 */
export async function buildQuickLookFile(object, { millimetresPerUnit = 1 } = {}) {
	const bytes = await buildUsdz(object, { millimetresPerUnit })
	return new Blob([bytes], { type: USDZ_MIME_TYPE })
}

/**
 * Open a file in Quick Look. Must run in the tap that asked for it, or soon enough after
 * it that Safari still counts the tap (see `useViewInAR`).
 *
 * @param {string} url - The address of the USDZ file (a blob: URL)
 * @param {Document} [doc] - The page
 */
export function openQuickLook(url, doc = document) {
	const anchor = doc.createElement('a')
	anchor.setAttribute('rel', 'ar')
	anchor.setAttribute('href', quickLookHref(url))
	// Off the page, not display: none, which some browsers treat as not there at all
	anchor.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 1px; height: 1px; overflow: hidden;'
	anchor.setAttribute('aria-hidden', 'true')
	anchor.setAttribute('tabindex', '-1')
	anchor.appendChild(doc.createElement('img'))
	doc.body.appendChild(anchor)
	try {
		anchor.click()
	} finally {
		// Quick Look reads the file from the address as the click is handled
		setTimeout(() => anchor.remove(), 0)
	}
}
