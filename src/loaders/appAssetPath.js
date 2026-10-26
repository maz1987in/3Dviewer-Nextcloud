/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * URLs of the decoder assets the app ships (draco/, basis/, rhino3dm/, occt/, web-ifc/).
 *
 * On a page they resolve through @nextcloud/router against the app's web root, which is
 * `custom_apps/` rather than `apps/` on an App Store install (#188). The router reads that
 * root from globals Nextcloud puts on the page, and a Web Worker has none of them, so the
 * thumbnail worker is handed the root by its host and sets it here first.
 */

import { generateFilePath } from '@nextcloud/router'

let appWebRoot = null

/**
 * Use a fixed app web root instead of reading it from the page.
 *
 * @param {string|null} root - The app's web root ending in `/`, e.g. `/custom_apps/threedviewer/`; null to read it from the page again
 */
export function setAppWebRoot(root) {
	appWebRoot = root
}

/**
 * URL of a file in one of the app's asset directories.
 *
 * @param {string} dir - Directory under the app root, e.g. `draco`
 * @param {string} [file] - File in that directory; empty for the directory itself
 * @return {string} The URL, with a trailing `/` when `file` is empty
 */
export function appAssetPath(dir, file = '') {
	if (appWebRoot !== null) {
		return `${appWebRoot}${dir}/${file}`
	}
	return generateFilePath('threedviewer', dir, file)
}
