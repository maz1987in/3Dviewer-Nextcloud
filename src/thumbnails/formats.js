/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which formats get a thumbnail, and which of those can be made in the background
 * worker rather than only by the open viewer.
 */

import { isSupportedExtension } from '../loaders/registry.js'

/**
 * Extensions the viewer opens as G-code but that other software also uses: `.nc` is
 * NetCDF as often as CNC G-code, and `.g` is used by several unrelated formats. Opening
 * such a file is the user saying it is a model, so the viewer still captures it; the
 * background queue does not guess, and never downloads one. Their loader runs in a
 * worker; only the extension keeps them out.
 *
 * @type {ReadonlySet<string>}
 */
export const AMBIGUOUS_FORMATS = new Set([
	'nc', // CNC G-code, but also NetCDF scientific data
	'g', // generic G-code, but also several unrelated formats
])

/**
 * Whether files with this extension get a thumbnail at all: every model format the
 * viewer can open, and none of its companions (.mtl, textures).
 *
 * @param {string} ext - File extension, without the dot
 * @return {boolean} True for a model format
 */
export function isThumbnailFormat(ext) {
	return isSupportedExtension(ext)
}

/**
 * Whether a thumbnail for this extension is made in the background worker: any model
 * format whose extension is not ambiguous. Every loader runs in a worker, which
 * tests/playwright/thumbnail-worker.spec.ts checks for each format with a sample.
 *
 * @param {string} ext - File extension, without the dot
 * @return {boolean} True when the background queue may render it
 */
export function canRenderInBackground(ext) {
	if (!isThumbnailFormat(ext)) {
		return false
	}
	return !AMBIGUOUS_FORMATS.has(ext.toLowerCase())
}
