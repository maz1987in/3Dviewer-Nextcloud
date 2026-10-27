/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Errors an export can end with that the viewer explains in its own words.
 */

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
