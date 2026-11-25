/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Errors an export can end with that the viewer explains in its own words.
 */

// eslint-disable-next-line n/no-extraneous-import -- Provided by @nextcloud/vue transitive dependency
import { translate as t } from '@nextcloud/l10n'

/**
 * The model has nothing the chosen format can hold: a G-code toolpath, say, is lines,
 * and 3MF, PLY and USDZ hold surfaces. Thrown before a file is made, so no empty file
 * is downloaded.
 */
export class NothingToExportError extends Error {

	/**
	 * @param {string} format - The format's name, such as '3MF'
	 */
	constructor(format) {
		super(`Model has no triangle meshes to export as ${format}`)
		this.name = 'NothingToExportError'
		this.format = format
	}

}

/**
 * The file was made, but saving it into the model's folder failed: the server refused it
 * (no room, no permission any more) or could not be reached. `cause` is that error.
 */
export class ExportSaveError extends Error {

	/**
	 * @param {Error} cause - The failed request
	 */
	constructor(cause) {
		super(cause?.message || 'Saving the export failed')
		this.name = 'ExportSaveError'
		this.cause = cause
	}

}

/**
 * Why a save next to the model failed, in words for the person who pressed it.
 *
 * @param {?Error} cause - The failed request
 * @return {string} The message
 */
export function exportSaveFailure(cause) {
	switch (cause?.response?.status) {
	case 507:
		return t('threedviewer', 'There isn\'t enough space in your Nextcloud to save it. Download it instead.')
	case 401:
	case 403:
		return t('threedviewer', 'You can no longer add files to this folder. Download it instead.')
	default:
		return t('threedviewer', 'Couldn\'t save the file next to the model. Download it instead.')
	}
}
