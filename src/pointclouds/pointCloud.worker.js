/**
 * Reads one scan off the main thread, so a large file never freezes the tab. Cancel
 * loading terminates it. The points go back as transferables, without a copy.
 *
 * In: `{ blob, ext, budget }`. Out: `{ type: 'progress', fraction }`, then
 * `{ type: 'done', result }` or `{ type: 'error', kind: 'scan' | 'not-a-scan' | 'other', message }`.
 */
import { NotAScanError, ScanError, readerFor } from './scanFormats.js'

self.onmessage = async ({ data: { blob, ext, budget } }) => {
	try {
		const reader = await readerFor(ext)
		const result = await reader.read(blob, { budget, onProgress: (fraction) => self.postMessage({ type: 'progress', fraction }) })
		const { sink } = result
		const transfer = [sink.positions, sink.colors, sink.intensity, sink.classification].filter(Boolean).map((array) => array.buffer)
		self.postMessage({ type: 'done', result }, transfer)
	} catch (error) {
		const kind = error instanceof NotAScanError ? 'not-a-scan' : error instanceof ScanError ? 'scan' : 'other'
		self.postMessage({ type: 'error', kind, message: String(error?.message ?? error) })
	}
}
