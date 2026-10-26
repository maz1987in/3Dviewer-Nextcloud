/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Which formats get a thumbnail, and which of those can be made in the background
 * worker rather than only by the open viewer.
 */

import { isSupportedExtension } from '../loaders/registry.js'

/**
 * Formats whose loader cannot run in a Web Worker, each with the reason. These still get
 * a thumbnail when the file is opened in the viewer, just never in the background.
 *
 * Every entry is checked by tests/playwright/thumbnail-worker.spec.ts, which renders each
 * other format with a fixture in a real worker.
 *
 * @type {ReadonlySet<string>}
 */
export const WORKER_UNSAFE_FORMATS = new Set([
	'3mf', // three's 3MFLoader parses the model XML with DOMParser, which workers lack
	'amf', // three's AMFLoader parses its XML with DOMParser, which workers lack
	'dae', // three's ColladaParser parses its XML with DOMParser, which workers lack
	'x3d', // the X3D loader parses its XML with DOMParser, which workers lack
])

/**
 * Extensions the viewer opens as G-code but that other software also uses: `.nc` is
 * NetCDF as often as CNC G-code, and `.g` is used by several unrelated formats. Opening
 * such a file is the user saying it is a model, so the viewer still captures it; the
 * background queue does not guess, and never downloads one. Separate from
 * WORKER_UNSAFE_FORMATS because their loader runs in a worker just fine.
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
 * Whether a thumbnail for this extension is made in the background worker: a model
 * format whose loader runs in a worker and whose extension is not ambiguous.
 *
 * @param {string} ext - File extension, without the dot
 * @return {boolean} True when the background queue may render it
 */
export function canRenderInBackground(ext) {
	if (!isThumbnailFormat(ext)) {
		return false
	}
	const lower = ext.toLowerCase()
	return !WORKER_UNSAFE_FORMATS.has(lower) && !AMBIGUOUS_FORMATS.has(lower)
}
