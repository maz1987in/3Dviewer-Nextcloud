/**
 * SPDX-FileCopyrightText: 2025 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Host side of the background thumbnail worker.
 *
 * Most loaders parse on the thread that calls them, and the OCCT and web-ifc ones parse
 * synchronously inside WebAssembly, so a render on the page would freeze it and could
 * not be stopped. Each render therefore runs in its own dedicated worker, which is
 * terminated as soon as the job settles, runs out of time or is aborted. Terminating it
 * is the only way to stop a parse midway, and it also frees everything the parse
 * allocated before the next file starts.
 */

import { generateFilePath } from '@nextcloud/router'
import { createThumbnailWorker } from './createThumbnailWorker.js'
import { EmptyModelError, ThumbnailEnvironmentError, ThumbnailTimeoutError } from './errors.js'

export { ThumbnailEnvironmentError, ThumbnailTimeoutError }
export { AMBIGUOUS_FORMATS, canRenderInBackground, isThumbnailFormat, WORKER_UNSAFE_FORMATS } from './formats.js'

/**
 * The rejection an aborted render ends in, matching what fetch() throws.
 *
 * @return {DOMException} An AbortError
 */
function abortError() {
	return new DOMException('Aborted', 'AbortError')
}

/**
 * Render one model to a PNG thumbnail in a fresh worker.
 *
 * `job.buffer` is transferred to the worker, so it is detached (zero length) for the
 * caller once this returns.
 *
 * @param {object} job - What to render
 * @param {string} job.extension - Model file extension, lower case, without the dot
 * @param {ArrayBuffer} job.buffer - The model file's bytes
 * @param {File[]} [job.additionalFiles] - Companion files (materials, textures, buffers)
 * @param {object} options - Limits
 * @param {number} options.timeoutMs - Hard limit for the whole render, in milliseconds
 * @param {AbortSignal} [options.signal] - Stops the render early
 * @return {Promise<Blob>} The PNG
 * @throws {ThumbnailTimeoutError} When the limit is reached first
 * @throws {DOMException} An AbortError when the signal fires first
 * @throws {EmptyModelError} When the model has no geometry to frame
 * @throws {ThumbnailEnvironmentError} When the worker would not start, crashed, sent a
 *   message that could not be read, or could not render (WebGL); not the file's fault
 * @throws {Error} When the loader could not read the model, which is the file's fault
 */
export function renderInWorker(job, { timeoutMs, signal } = {}) {
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return Promise.reject(new TypeError('renderInWorker needs a positive, finite timeoutMs'))
	}
	if (signal?.aborted) {
		return Promise.reject(abortError())
	}

	return new Promise((resolve, reject) => {
		const worker = createThumbnailWorker()
		// Removes the abort listener once the job is over
		const listening = new AbortController()
		let timer = null
		let settled = false

		/**
		 * End the job exactly once: stop the worker, drop the timer and listener, then
		 * resolve or reject. Anything the worker sends afterwards is ignored.
		 *
		 * @param {(value: Blob|Error) => void} finish - resolve or reject
		 * @param {Blob|Error} value - What to finish with
		 */
		const settle = (finish, value) => {
			if (settled) {
				return
			}
			settled = true
			clearTimeout(timer)
			listening.abort()
			worker.onmessage = null
			worker.onerror = null
			worker.onmessageerror = null
			worker.terminate()
			finish(value)
		}

		worker.onmessage = ({ data }) => {
			if (data?.ok) {
				settle(resolve, data.blob)
			} else if (data?.empty) {
				settle(reject, new EmptyModelError(data.error || undefined))
			} else if (data?.stage === 'render' || data?.stage === 'environment') {
				// The model loaded and drawing it failed (WebGL in this browser), or a loader
				// chunk could not be fetched: either way not the file's fault
				settle(reject, new ThumbnailEnvironmentError(data.error || 'Thumbnail render failed'))
			} else {
				settle(reject, new Error(data?.error || 'Thumbnail worker failed'))
			}
		}
		worker.onerror = (event) => {
			// Handled here; keep the browser from reporting it as uncaught on the page.
			// Also what a worker script that fails to load ends in.
			event.preventDefault?.()
			settle(reject, new ThumbnailEnvironmentError(event.message || 'Thumbnail worker crashed'))
		}
		worker.onmessageerror = () => {
			settle(reject, new ThumbnailEnvironmentError('Thumbnail worker sent a message that could not be read'))
		}

		signal?.addEventListener('abort', () => settle(reject, abortError()), { once: true, signal: listening.signal })
		timer = setTimeout(() => settle(reject, new ThumbnailTimeoutError(timeoutMs)), timeoutMs)

		try {
			worker.postMessage({
				extension: job.extension,
				buffer: job.buffer,
				additionalFiles: job.additionalFiles || [],
				// The worker has no page to read the app's web root from
				appWebRoot: generateFilePath('threedviewer', '', ''),
			}, [job.buffer])
		} catch (error) {
			// e.g. a buffer that was already transferred elsewhere
			settle(reject, new ThumbnailEnvironmentError(error?.message || 'Could not start the thumbnail job', { cause: error }))
		}
	})
}

/**
 * Check once, before anything is downloaded for it, that this browser can make
 * thumbnails in the background at all: the worker script loads, and a WebGL 2 context can
 * be created on an OffscreenCanvas inside it. A browser that cannot would otherwise
 * download every model in a folder only to fail each render.
 *
 * @param {object} [options] - Limits
 * @param {number} [options.timeoutMs] - How long the worker may take to answer
 * @return {Promise<boolean>} True when it can; never rejects
 */
export function probeWorkerRendering({ timeoutMs = 30000 } = {}) {
	if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
		return Promise.resolve(false)
	}

	return new Promise((resolve) => {
		let worker
		let timer = null
		const finish = (ok) => {
			clearTimeout(timer)
			if (worker) {
				worker.onmessage = null
				worker.onerror = null
				worker.onmessageerror = null
				worker.terminate()
			}
			resolve(ok)
		}

		try {
			worker = createThumbnailWorker()
			worker.onmessage = ({ data }) => finish(data?.probe === true && data?.ok === true)
			worker.onerror = (event) => {
				event.preventDefault?.()
				finish(false)
			}
			worker.onmessageerror = () => finish(false)
			timer = setTimeout(() => finish(false), timeoutMs)
			worker.postMessage({ probe: true })
		} catch {
			finish(false)
		}
	})
}
