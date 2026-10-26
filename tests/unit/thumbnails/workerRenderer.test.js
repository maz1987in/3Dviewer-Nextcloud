import {
	probeWorkerRendering,
	renderInWorker,
	ThumbnailEnvironmentError,
	ThumbnailRefusedError,
	ThumbnailTimeoutError,
	canRenderInBackground,
	isThumbnailFormat,
	AMBIGUOUS_FORMATS,
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
		if (FakeWorker.postMessageError) {
			throw FakeWorker.postMessageError
		}
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

	/** Deliver a message the host cannot deserialise. */
	garble() {
		this.onmessageerror?.({ data: null })
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
		FakeWorker.postMessageError = null
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

	it('a failed load rejects with the worker\'s message and terminates', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.emit({ ok: false, error: 'No loader found for extension stl', stage: 'load' })

		const error = await promise.catch(e => e)
		expect(error.message).toBe('No loader found for extension stl')
		// The file's fault, which the queue marks skipped
		expect(error).not.toBeInstanceOf(ThumbnailEnvironmentError)
		expect(worker.terminated).toBe(1)
	})

	it('a model that named a file outside those it was handed rejects with ThumbnailRefusedError', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.emit({
			ok: false,
			error: 'Refused to load https://evil.example/x.png: not one of the model\'s files',
			stage: 'load',
			refused: true,
		})

		const error = await promise.catch(e => e)
		expect(error).toBeInstanceOf(ThumbnailRefusedError)
		expect(error.message).toMatch(/^Refused to load/)
		// The model's fault and not the browser's, so not an environment failure
		expect(error).not.toBeInstanceOf(ThumbnailEnvironmentError)
		expect(worker.terminated).toBe(1)
	})

	it('a failure while drawing, or a loader chunk that would not load, is the environment\'s', async () => {
		for (const stage of ['render', 'environment']) {
			const promise = renderInWorker(job(), { timeoutMs: 30000 })
			const worker = workers[workers.length - 1]

			worker.emit({ ok: false, error: 'Error creating WebGL context.', stage })

			await expect(promise).rejects.toBeInstanceOf(ThumbnailEnvironmentError)
			expect(worker.terminated).toBe(1)
		}
	})

	it('a worker error event rejects with an environment error and terminates', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.fail('Uncaught ReferenceError: window is not defined')

		const error = await promise.catch(e => e)
		expect(error).toBeInstanceOf(ThumbnailEnvironmentError)
		expect(error.message).toMatch('window is not defined')
		expect(worker.terminated).toBe(1)
	})

	it('a message that cannot be deserialised rejects with an environment error and terminates once', async () => {
		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		worker.garble()
		worker.emit({ ok: true, blob: {} })

		const error = await promise.catch(e => e)
		expect(error).toBeInstanceOf(ThumbnailEnvironmentError)
		expect(error.message).toMatch('could not be read')
		expect(worker.terminated).toBe(1)
	})

	it('a postMessage that throws rejects and terminates once', async () => {
		jest.useFakeTimers()
		const cloneError = new DOMException('ArrayBuffer is detached', 'DataCloneError')
		FakeWorker.postMessageError = cloneError

		const promise = renderInWorker(job(), { timeoutMs: 30000 })
		const [worker] = workers

		const error = await promise.catch(e => e)
		expect(error).toBeInstanceOf(ThumbnailEnvironmentError)
		expect(error.cause).toBe(cloneError)
		expect(worker.terminated).toBe(1)
		// Nothing left to fire later and terminate it again
		expect(jest.getTimerCount()).toBe(0)
		jest.advanceTimersByTime(30000)
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

describe('probeWorkerRendering', () => {
	const OriginalWorker = global.Worker
	const OriginalOffscreenCanvas = global.OffscreenCanvas

	beforeEach(() => {
		workers.length = 0
		global.Worker = FakeWorker
		global.OffscreenCanvas = class {}
	})

	afterEach(() => {
		global.Worker = OriginalWorker
		global.OffscreenCanvas = OriginalOffscreenCanvas
		jest.useRealTimers()
	})

	it('asks a worker for a WebGL context and resolves true when it has one', async () => {
		const answer = probeWorkerRendering({ timeoutMs: 1000 })
		const [worker] = workers

		expect(worker.posted[0].message).toEqual({ probe: true })
		worker.emit({ probe: true, ok: true })

		await expect(answer).resolves.toBe(true)
		expect(worker.terminated).toBe(1)
	})

	it('resolves false when the worker has no WebGL, crashes, or never answers', async () => {
		const noWebGL = probeWorkerRendering({ timeoutMs: 1000 })
		workers[0].emit({ probe: true, ok: false, error: 'No WebGL 2 context' })
		await expect(noWebGL).resolves.toBe(false)

		const crashed = probeWorkerRendering({ timeoutMs: 1000 })
		workers[1].fail('Failed to load worker script')
		await expect(crashed).resolves.toBe(false)

		jest.useFakeTimers()
		const silent = probeWorkerRendering({ timeoutMs: 1000 })
		jest.advanceTimersByTime(1000)
		await expect(silent).resolves.toBe(false)

		expect(workers.map(worker => worker.terminated)).toEqual([1, 1, 1])
	})

	it('resolves false without a worker when the browser has no OffscreenCanvas', async () => {
		global.OffscreenCanvas = undefined

		await expect(probeWorkerRendering()).resolves.toBe(false)
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

	it('canRenderInBackground takes every model format, and no companion', () => {
		expect(canRenderInBackground('stl')).toBe(true)
		expect(canRenderInBackground('STL')).toBe(true)
		expect(canRenderInBackground('mtl')).toBe(false)
		expect(canRenderInBackground('png')).toBe(false)
		expect(canRenderInBackground('')).toBe(false)
	})

	it('canRenderInBackground takes the XML formats, which the worker now parses', () => {
		// 3MF, AMF, COLLADA and X3D were left to the viewer while the worker had no
		// DOMParser; it loads one for them (workerDomParser.js)
		for (const ext of ['3mf', 'amf', 'dae', 'x3d', '3MF', 'DAE']) {
			expect(isThumbnailFormat(ext)).toBe(true)
			expect(canRenderInBackground(ext)).toBe(true)
		}
	})

	it('canRenderInBackground leaves the ambiguous G-code extensions nc and g to the viewer', () => {
		for (const ext of ['nc', 'g', 'NC', 'G']) {
			expect(isThumbnailFormat(ext)).toBe(true)
			expect(canRenderInBackground(ext)).toBe(false)
		}
		expect([...AMBIGUOUS_FORMATS].sort()).toEqual(['g', 'nc'])
		// The unambiguous G-code extensions still render in the background
		expect(canRenderInBackground('gcode')).toBe(true)
		expect(canRenderInBackground('gco')).toBe(true)
	})
})
