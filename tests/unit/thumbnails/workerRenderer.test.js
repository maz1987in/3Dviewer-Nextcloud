import {
	renderInWorker,
	ThumbnailTimeoutError,
	canRenderInBackground,
	isThumbnailFormat,
	WORKER_UNSAFE_FORMATS,
} from '../../../src/thumbnails/workerRenderer.js'
import { EmptyModelError } from '../../../src/thumbnails/renderThumbnail.js'

// The real factory holds `new URL(..., import.meta.url)`, which only a bundler can read.
// This one builds the worker the same way, on whatever Worker the test installs.
jest.mock('../../../src/thumbnails/createThumbnailWorker.js', () => ({
	createThumbnailWorker: () => new global.Worker('thumbnail.worker.js', { type: 'module' }),
}))

const workers = []

/** A stand-in for a dedicated Worker that records what the host does to it. */
class FakeWorker {

	constructor(url, options) {
		this.url = url
		this.options = options
		this.posted = []
		this.terminated = 0
		this.onmessage = null
		this.onerror = null
		this.onmessageerror = null
		workers.push(this)
	}

	postMessage(message, transfer) {
		this.posted.push({ message, transfer })
	}

	terminate() {
		this.terminated++
	}

	/**
	 * Deliver a message from the worker to the host.
	 *
	 * @param {object} data - Message payload
	 */
	emit(data) {
		this.onmessage?.({ data })
	}

	/**
	 * Raise an uncaught error inside the worker.
	 *
	 * @param {string} message - Error text
	 */
	fail(message) {
		this.onerror?.({ message, preventDefault() {} })
	}

}

function job() {
	return { extension: 'stl', buffer: new ArrayBuffer(8), additionalFiles: [] }
}

describe('renderInWorker', () => {
	const OriginalWorker = global.Worker

	beforeEach(() => {
		workers.length = 0
		global.Worker = FakeWorker
	})

	afterEach(() => {
		global.Worker = OriginalWorker
		jest.useRealTimers()
	})

	it('resolves with the worker\'s blob and terminates it', async () => {
		const input = job()
		const promise = renderInWorker(input, { timeoutMs: 30000 })

		const [worker] = workers
		expect(worker.options).toEqual({ type: 'module' })
		const [{ message, transfer }] = worker.posted
		expect(message).toEqual(expect.objectContaining({
			extension: 'stl',
			buffer: input.buffer,
			additionalFiles: [],
		}))
		expect(transfer).toEqual([input.buffer])

		const blob = { type: 'image/png', size: 4 }
		worker.emit({ ok: true, blob })

		await expect(promise).resolves.toBe(blob)
		expect(worker.terminated).toBe(1)
	})

	it('hands the worker the app web root it cannot read itself', async () => {
		window._oc_appswebroots = { threedviewer: '/cloud/custom_apps/threedviewer' }
		try {
			const promise = renderInWorker(job(), { timeoutMs: 30000 })
			const [worker] = workers

			expect(worker.posted[0].message.appWebRoot).toBe('/cloud/custom_apps/threedviewer/')

			worker.emit({ ok: true, blob: {} })
			await promise
		} finally {
			delete window._oc_appswebroots
		}
	})

	it('times out, rejects with ThumbnailTimeoutError, and terminates', async () => {
		jest.useFakeTimers()
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		jest.advanceTimersByTime(29999)
		expect(worker.terminated).toBe(0)

		jest.advanceTimersByTime(1)

		await expect(promise).rejects.toBeInstanceOf(ThumbnailTimeoutError)
		expect(worker.terminated).toBe(1)

		// A result that arrives after the limit changes nothing
		worker.emit({ ok: true, blob: {} })
		expect(worker.terminated).toBe(1)
	})

	it('abort terminates and rejects with AbortError', async () => {
		const controller = new AbortController()
		const promise = renderInWorker(job(), { timeoutMs: 30000, signal: controller.signal })
		const [worker] = workers

		controller.abort()

		const error = await promise.catch(e => e)
		expect(error).toBeInstanceOf(DOMException)
		expect(error.name).toBe('AbortError')
		expect(worker.terminated).toBe(1)
	})

	it('rejects with AbortError without starting a worker when already aborted', async () => {
		const controller = new AbortController()
		controller.abort()

		const error = await renderInWorker(job(), { timeoutMs: 30000, signal: controller.signal }).catch(e => e)

		expect(error.name).toBe('AbortError')
		expect(workers).toHaveLength(0)
	})

	it('empty result rejects with EmptyModelError', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.emit({ ok: false, error: 'Model has no renderable geometry', empty: true })

		await expect(promise).rejects.toBeInstanceOf(EmptyModelError)
		expect(worker.terminated).toBe(1)
	})

	it('a failed render rejects with the worker\'s message and terminates', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.emit({ ok: false, error: 'No loader found for extension stl' })

		await expect(promise).rejects.toThrow('No loader found for extension stl')
		expect(worker.terminated).toBe(1)
	})

	it('a worker error event rejects and terminates', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.fail('Uncaught ReferenceError: window is not defined')

		await expect(promise).rejects.toThrow('window is not defined')
		expect(worker.terminated).toBe(1)
	})

	it('leaves no timer behind once settled', async () => {
		jest.useFakeTimers()
		const promise = renderInWorker(job(), { timeoutMs: 30000 })

		workers[0].emit({ ok: true, blob: {} })
		await promise

		expect(jest.getTimerCount()).toBe(0)
	})

	it('rejects a missing time limit instead of running unbounded', async () => {
		await expect(renderInWorker(job(), {})).rejects.toThrow(TypeError)
		expect(workers).toHaveLength(0)
	})
})

describe('format gates', () => {
	it('isThumbnailFormat follows the loader registry', () => {
		expect(isThumbnailFormat('stl')).toBe(true)
		expect(isThumbnailFormat('GLB')).toBe(true)
		expect(isThumbnailFormat('mtl')).toBe(false)
		expect(isThumbnailFormat('')).toBe(false)
		expect(isThumbnailFormat(undefined)).toBe(false)
	})

	it('canRenderInBackground excludes WORKER_UNSAFE_FORMATS and non-model extensions', () => {
		for (const ext of WORKER_UNSAFE_FORMATS) {
			expect(isThumbnailFormat(ext)).toBe(true)
			expect(canRenderInBackground(ext)).toBe(false)
			expect(canRenderInBackground(ext.toUpperCase())).toBe(false)
		}
		expect(canRenderInBackground('stl')).toBe(true)
		expect(canRenderInBackground('STL')).toBe(true)
		expect(canRenderInBackground('mtl')).toBe(false)
		expect(canRenderInBackground('png')).toBe(false)
	})
})
