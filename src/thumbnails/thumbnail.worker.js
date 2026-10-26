/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Background thumbnail worker: loads one model and renders it to a PNG on an
 * OffscreenCanvas, off the page's thread. Started per job by workerRenderer.js, which
 * terminates it when the job is over, so nothing here needs to clean up after itself.
 *
 * In:  { extension, buffer, additionalFiles, appWebRoot }, with `buffer` transferred
 * Out: { ok: true, blob } or { ok: false, error, empty? }
 */

import * as THREE from 'three'
import { setAppWebRoot } from '../loaders/appAssetPath.js'
import { loadModelByExtension } from '../loaders/registry.js'
import { EmptyModelError, renderThumbnail } from './renderThumbnail.js'

const SIZE = 512

// Image decodes still running. Loaders hand back their model before its textures have
// arrived, which the viewer's render loop never notices; a single render would.
const pendingImages = new Set()

/*
 * three's ImageLoader decodes through an <img>, which a worker does not have, so every
 * loader that goes through TextureLoader (FBX, 3DS, 3DM, VRML, native MTL) would fail on
 * the first texture it meets. Decode with fetch and createImageBitmap instead. WebGL
 * ignores flipY for a bitmap, so flip while decoding, as the upload of an <img> does.
 * This worker only ever runs one render, so patching the prototype touches nothing else.
 */
THREE.ImageLoader.prototype.load = function(url, onLoad, onProgress, onError) {
	const resolved = this.manager.resolveURL(this.path === undefined ? url : this.path + url)
	this.manager.itemStart(resolved)
	const decoding = fetch(resolved)
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status} for ${resolved}`)
			}
			return response.blob()
		})
		.then(blob => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }))
		.then((bitmap) => {
			onLoad?.(bitmap)
			this.manager.itemEnd(resolved)
		})
		.catch((error) => {
			onError?.(error)
			this.manager.itemError(resolved)
			this.manager.itemEnd(resolved)
		})
	pendingImages.add(decoding)
	decoding.finally(() => pendingImages.delete(decoding))
	return null
}

/**
 * Wait until no image is left decoding, including any a finished one started.
 */
async function imagesDecoded() {
	while (pendingImages.size > 0) {
		await Promise.allSettled([...pendingImages])
	}
}

self.onmessage = async ({ data }) => {
	const { extension, buffer, additionalFiles = [], appWebRoot } = data
	try {
		if (appWebRoot) {
			setAppWebRoot(appWebRoot)
		}

		// No scene: the loader hands the model back without adding it anywhere. No
		// renderer either, so KTX2 textures are left untranscoded (the loader logs it).
		const result = await loadModelByExtension(extension, buffer, {
			THREE,
			additionalFiles,
			fileExtension: extension,
			hasDraco: true,
			hasKtx2: false,
			hasMeshopt: false,
		})
		if (!result?.object3D) {
			throw new Error('No valid 3D object returned from loader')
		}
		await imagesDecoded()

		const blob = await renderThumbnail(result.object3D, {
			canvas: new OffscreenCanvas(SIZE, SIZE),
			size: SIZE,
		})
		self.postMessage({ ok: true, blob })
	} catch (error) {
		const message = { ok: false, error: error?.message || String(error) }
		if (error instanceof EmptyModelError) {
			message.empty = true
		}
		self.postMessage(message)
	}
}
