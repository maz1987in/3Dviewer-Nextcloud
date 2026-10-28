/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Run a print-check job in a worker of its own. Each call starts a worker and ends it when
 * the call settles; cancelling ends it at once, so a check never outlives the model it was
 * started for. The parts sent are copies: the live model keeps its buffers.
 */

import { createPrintCheckWorker } from './createPrintCheckWorker.js'

let nextId = 1

/**
 * @return {DOMException} What a cancelled job rejects with
 */
function aborted() {
	return new DOMException('Print check cancelled', 'AbortError')
}

/**
 * Copies of the parts' arrays, and the buffers to transfer them in.
 *
 * @param {Array<object>} parts - Geometry per part
 * @return {{parts: Array<object>, transfer: ArrayBuffer[]}} What to post
 */
function copyParts(parts) {
	const transfer = []
	const copies = parts.map((part) => {
		const copy = {}
		for (const key of ['positions', 'index', 'normals']) {
			if (part[key]) {
				copy[key] = part[key].slice()
				transfer.push(copy[key].buffer)
			} else {
				copy[key] = null
			}
		}
		return copy
	})
	return { parts: copies, transfer }
}

/**
 * @param {string} type - The job
 * @param {Array<object>} parts - Geometry per part
 * @param {object} options - Options
 * @param {AbortSignal} [options.signal] - Cancels the job
 * @param {function(number, number): void} [options.onProgress] - Progress, `(done, total)`
 * @param {number} [options.budget] - For a thickness check, the triangle budget per part
 * @return {Promise<Array>} One result per part
 */
function run(type, parts, { signal, onProgress, budget } = {}) {
	if (signal?.aborted) {
		return Promise.reject(aborted())
	}
	return new Promise((resolve, reject) => {
		const worker = createPrintCheckWorker()
		const id = nextId++
		let onAbort = null
		const finish = () => {
			worker.terminate()
			signal?.removeEventListener('abort', onAbort)
		}
		onAbort = () => {
			finish()
			reject(aborted())
		}
		signal?.addEventListener('abort', onAbort, { once: true })

		worker.onmessage = ({ data }) => {
			if (data?.id !== id) {
				return
			}
			if (data.type === 'progress') {
				onProgress?.(data.done, data.total)
			} else if (data.type === 'result') {
				finish()
				resolve(data.result)
			} else if (data.type === 'error') {
				finish()
				reject(new Error(data.message))
			}
		}
		worker.onerror = (event) => {
			finish()
			reject(new Error(event?.message || 'The print-check worker failed'))
		}

		const message = copyParts(parts)
		worker.postMessage({ id, type, parts: message.parts, budget }, message.transfer)
	})
}

/**
 * Whether each part is closed (closedMesh.edgeReport), off the page's thread.
 *
 * @param {Array<{positions: Float32Array, index: ?Uint32Array}>} parts - Geometry per part
 * @param {object} [options] - `signal`
 * @return {Promise<Array<{boundaryEdges: number, nonManifoldEdges: number, closed: boolean}>>}
 */
export function checkClosed(parts, options = {}) {
	return run('closed', parts, options)
}

/**
 * How thick each part's walls are (thickness.measurePartThickness), off the page's thread.
 *
 * @param {Array<{positions: Float32Array, index: ?Uint32Array, normals: ?Float32Array}>} parts - Geometry per part
 * @param {object} [options] - `budget`, `onProgress`, `signal`
 * @return {Promise<Array<{thickness: Float32Array, triangleThickness: Float32Array, sampled: boolean}>>}
 */
export function measureThickness(parts, options = {}) {
	return run('thickness', parts, options)
}
