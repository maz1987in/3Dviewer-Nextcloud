/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Run print-check jobs off the page's thread.
 *
 * A thickness check or a repair runs in a worker of its own, started for the call and ended
 * when it settles; cancelling ends it at once, so a job never outlives the model it was
 * started for. The parts sent are copies: the live model keeps its buffers.
 *
 * Measuring the fit, overhangs, volume and area, and whether the model is closed, runs in
 * a session: one worker that is sent the model once, when Print check opens, and answers
 * every later request on it (another angle, the other up axis, the model moved) until
 * Print check closes.
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
 * @param {object} [options.extra] - More fields for the message, for the job
 * @return {Promise<Array>} One result per part
 */
function run(type, parts, { signal, onProgress, budget, extra } = {}) {
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
		worker.postMessage({ id, type, parts: message.parts, budget, ...extra }, message.transfer)
	})
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

/**
 * Find what is wrong with each part of a model (meshAnalysis.analyzeMesh), in a worker of
 * its own: Print check's session worker stays free to answer the measurements meanwhile,
 * which on a large model it otherwise could not until the analysis had gone through
 * every triangle.
 *
 * @param {Array<{positions: Float32Array|Float64Array, index: ?Uint32Array}>} parts - Each
 *   surface part, in its own space
 * @param {object} options - Options
 * @param {number[]} options.scales - Millimetres in one of each part's own units
 * @param {AbortSignal} [options.signal] - Cancels the analysis
 * @return {Promise<Array<object>>} One analyzeMesh result per part
 */
export function analyzeParts(parts, { scales, signal }) {
	return run('analyze', parts, { signal, extra: { scales } })
}

/**
 * Repair the parts of a model (meshRepair.repairMesh), off the page's thread.
 *
 * @param {Array<{positions: Float32Array, index: ?Uint32Array}>} parts - Each mesh, already
 *   placed in the world as an export writes it, the arrays copies the caller lets go of
 * @param {object} options - Options
 * @param {number} options.millimetresPerUnit - Millimetres in one scene unit
 * @param {AbortSignal} [options.signal] - Cancels the repair
 * @param {function(number, number): void} [options.onProgress] - Progress, `(done, total)`
 * @return {Promise<Array<object>>} Each part repaired: `positions`, `index`, `patchStart`,
 *   `changed`, `summary`, `before`, `after`, and `closedReport` (closedMesh.edgeReport of the result)
 */
export function repairParts(parts, { millimetresPerUnit, signal, onProgress }) {
	return run('repair', parts, { signal, onProgress, extra: { millimetresPerUnit } })
}

/**
 * A worker that keeps one model for Print check's measurements.
 *
 * @param {Array<object>} parts - The model's parts, in their own space: `positions`
 *   (xyz per vertex), `index` (or null) and `surface` (a mesh, rather than points or
 *   lines). Their arrays are transferred to the worker, so they must be copies the caller
 *   lets go of.
 * @return {{measure: function(object): Promise<object>, checkClosed: function(): Promise<Array>, close: function(): void}}
 *   `measure` takes `{ matrices, axes, thresholdDeg, bedEpsilon }` and resolves with
 *   surfaceMeasures.measureSurface's result; `checkClosed` resolves with an edge report per
 *   surface part (closedMesh.edgeReport); `close` ends the worker, and every request still
 *   waiting rejects as an AbortError. Requests are answered in the order they were made, so
 *   nothing slow is sent here: the mesh analysis runs apart (analyzeParts).
 */
export function openSurfaceSession(parts) {
	const worker = createPrintCheckWorker()
	const pending = new Map()
	let closed = false

	const fail = (error) => {
		pending.forEach(({ reject }) => reject(error))
		pending.clear()
	}
	const close = () => {
		if (!closed) {
			closed = true
			worker.terminate()
			fail(aborted())
		}
	}
	worker.onmessage = ({ data }) => {
		const waiting = pending.get(data?.id)
		if (!waiting) {
			return
		}
		pending.delete(data.id)
		if (data.type === 'result') {
			waiting.resolve(data.result)
		} else {
			waiting.reject(new Error(data.message))
		}
	}
	worker.onerror = (event) => {
		closed = true
		worker.terminate()
		fail(new Error(event?.message || 'The print-check worker failed'))
	}

	const send = (message, transfer = []) => {
		if (closed) {
			return Promise.reject(aborted())
		}
		const id = nextId++
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject })
			worker.postMessage({ ...message, id }, transfer)
		})
	}

	const buffers = new Set()
	parts.forEach((part) => {
		buffers.add(part.positions.buffer)
		if (part.index) {
			buffers.add(part.index.buffer)
		}
	})
	// A request made before the model is in waits behind it, and fails with it
	send({ type: 'load', parts }, [...buffers]).catch(() => {})

	return {
		measure: ({ matrices, axes, thresholdDeg, bedEpsilon }) => send({ type: 'measure', matrices, axes, thresholdDeg, bedEpsilon }),
		checkClosed: () => send({ type: 'closed' }),
		close,
	}
}
