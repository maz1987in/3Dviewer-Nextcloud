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
 * Whether a thumbnail for this extension can be rendered in the background worker.
 *
 * @param {string} ext - File extension, without the dot
 * @return {boolean} True when the format's loader runs in a worker
 */
export function canRenderInBackground(ext) {
	return isThumbnailFormat(ext) && !WORKER_UNSAFE_FORMATS.has(ext.toLowerCase())
}
