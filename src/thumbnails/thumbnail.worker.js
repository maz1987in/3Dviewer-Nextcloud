/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Background thumbnail worker: loads one model and renders it to a PNG on an
 * OffscreenCanvas, off the page's thread. Started per job by workerRenderer.js, which
 * terminates it when the job is over, so nothing here needs to clean up after itself.
 *
 * In:  { extension, buffer, additionalFiles, appWebRoot }, with `buffer` transferred
 * Out: { ok: true, blob } or { ok: false, error, stage, empty? }, where `stage` is 'load'
 *      when the loader could not read the model and 'render' when drawing it failed
 *
 * The job loads nothing but the files it was handed, its own data: and blob: URLs and the
 * app's decoder assets (see workerResources.js). A model that names anything else fails
 * at the 'load' stage, without a request being made for it.
 *
 * In:  { probe: true }, the capability check from probeWorkerRendering()
 * Out: { probe: true, ok, error? }
 */

import * as THREE from 'three'
import { setAppWebRoot } from '../loaders/appAssetPath.js'
import { loadModelByExtension } from '../loaders/registry.js'
import { EmptyModelError, renderThumbnail } from './renderThumbnail.js'
import { createWorkerResources, guardWorkerRequests, RefusedResourceError } from './workerResources.js'

const SIZE = 512

// The running job's resources. Until a job names its files and the app root, nothing
// but data: URLs may be loaded.
let resources = createWorkerResources({ baseUrl: self.location.href })

// Every fetch, XMLHttpRequest and object URL of this worker goes through `resources`,
// whichever loader or decoder makes it
guardWorkerRequests(self, () => resources)

// Loaders that set up no loading manager of their own use the default one, and the glTF
// and 3DS loaders hand it every URL they could not map to a file themselves
THREE.DefaultLoadingManager.setURLModifier((url) => resources.resolve(url))

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
	// A loader's own manager may hand back a URL as the model wrote it: map it to a
	// handed file, or refuse it here rather than leave that to the fetch guard
	const target = resources.resolve(resolved)
	const request = resources.isAllowed(target)
		? fetch(target)
		: Promise.reject(new RefusedResourceError(target))
	const decoding = request
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

/**
 * Answer the capability probe: the renderer needs WebGL 2 on an OffscreenCanvas.
 */
function answerProbe() {
	try {
		const context = new OffscreenCanvas(1, 1).getContext('webgl2')
		self.postMessage(context
			? { probe: true, ok: true }
			: { probe: true, ok: false, error: 'No WebGL 2 context on an OffscreenCanvas' })
	} catch (error) {
		self.postMessage({ probe: true, ok: false, error: error?.message || String(error) })
	}
}

/**
 * Which stage to report a failure under. A loader chunk or decoder that could not be
 * fetched (a network error, or a page left open across an app upgrade whose chunks are
 * gone) is the environment's fault, not the model's, even though it fails while loading.
 *
 * @param {'load'|'render'} stage - Where the job was
 * @param {unknown} error - What it failed with
 * @return {'load'|'render'|'environment'} The stage to report
 */
function failedStage(stage, error) {
	if (resources.refused.length > 0) {
		// Whatever the loader made of the refusal, it is the model's doing
		return 'load'
	}
	const text = String(error?.message ?? error)
	if (stage === 'load' && /dynamically imported module|Importing a module script failed|Failed to fetch|NetworkError/i.test(text)) {
		return 'environment'
	}
	return stage
}

self.onmessage = async ({ data }) => {
	if (data?.probe) {
		answerProbe()
		return
	}
	const { extension, buffer, additionalFiles = [], appWebRoot } = data
	let stage = 'load'
	try {
		if (appWebRoot) {
			setAppWebRoot(appWebRoot)
		}
		resources = createWorkerResources({ files: additionalFiles, appWebRoot, baseUrl: self.location.href })

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
		// A loader may carry on without a texture it could not load; the thumbnail must not
		if (resources.refused.length > 0) {
			throw new RefusedResourceError(resources.refused[0])
		}

		stage = 'render'
		const blob = await renderThumbnail(result.object3D, {
			canvas: new OffscreenCanvas(SIZE, SIZE),
			size: SIZE,
		})
		self.postMessage({ ok: true, blob })
	} catch (error) {
		// Name the refusal rather than what the loader made of it
		const reason = resources.refused.length > 0 ? new RefusedResourceError(resources.refused[0]) : error
		const message = { ok: false, error: reason?.message || String(reason), stage: failedStage(stage, error) }
		if (error instanceof EmptyModelError) {
			message.empty = true
		}
		self.postMessage(message)
	}
}
