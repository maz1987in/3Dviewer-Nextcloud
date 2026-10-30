/**
 * Reads a scan: in a worker of its own from the page, or in the calling thread when that
 * is already a worker (the thumbnailer). One worker per file, ended when the read ends or
 * is cancelled.
 */
import { NotAScanError, ScanError, abortError, readerFor } from './scanFormats.js'

/**
 * @param {Blob} blob - The file
 * @param {string} ext - Its extension, which picks the reader
 * @param {object} options - How to read it
 * @param {number} options.budget - Points kept at most
 * @param {function(number): void} [options.onProgress] - Told the fraction read
 * @param {AbortSignal} [options.signal] - Cancel loading
 * @param {boolean} [options.inline] - Read here rather than in a new worker
 * @return {Promise<{sink: object, unit: ?string, format: string}>} What the reader found
 */
export async function parsePointCloud(blob, ext, { budget, onProgress = () => {}, signal, inline = false }) {
	if (signal?.aborted) {
		throw abortError()
	}
	if (inline) {
		const reader = await readerFor(ext)
		return reader.read(blob, { budget, onProgress, signal })
	}

	const { createPointCloudWorker } = await import('./createPointCloudWorker.js')
	if (signal?.aborted) {
		throw abortError()
	}
	const worker = createPointCloudWorker()
	return new Promise((resolve, reject) => {
		// Declared before use: end() removes it
		let onAbort = null
		const end = () => {
			signal?.removeEventListener('abort', onAbort)
			worker.terminate()
		}
		onAbort = () => {
			end()
			reject(abortError())
		}
		signal?.addEventListener('abort', onAbort, { once: true })
		worker.onmessage = ({ data }) => {
			if (data.type === 'progress') {
				onProgress(data.fraction)
			} else if (data.type === 'done') {
				end()
				resolve(data.result)
			} else if (data.type === 'error') {
				end()
				reject(data.kind === 'not-a-scan' ? new NotAScanError(data.message) : data.kind === 'scan' ? new ScanError(data.message) : new Error(data.message))
			}
		}
		worker.onerror = (event) => {
			end()
			reject(new Error(event?.message || 'The scan reader stopped'))
		}
		worker.postMessage({ blob, ext, budget })
	})
}
