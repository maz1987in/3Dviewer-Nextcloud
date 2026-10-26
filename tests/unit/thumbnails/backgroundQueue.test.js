import { createBackgroundQueue } from '../../../src/thumbnails/backgroundQueue.js'
import {
	EmptyModelError,
	ThumbnailBudgetError,
	ThumbnailEnvironmentError,
	ThumbnailTimeoutError,
} from '../../../src/thumbnails/errors.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const MB = 1048576
const PNG = { type: 'image/png', size: 4 }

/**
 * A promise with its settle functions, for steps the test releases by hand.
 *
 * @return {{promise: Promise, resolve: Function, reject: Function}}
 */
function deferred() {
	let resolve
	let reject
	const promise = new Promise((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

/** Let every pending promise chain run to its next real wait. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * @param {number} size - Bytes
 * @param {string} [name] - File name
 * @return {object} A stand-in for a File
 */
function fakeFile(size, name = 'f') {
	return { name, size, arrayBuffer: jest.fn(async () => new ArrayBuffer(8)) }
}

/**
 * @param {number} id - File id
 * @param {object} [overrides] - Fields to change
 * @return {object} A status entry for a file that needs a thumbnail
 */
function status(id, overrides = {}) {
	return {
		name: `model-${id}.glb`,
		dir: '/models',
		size: MB,
		etag: `etag-${id}`,
		canEdit: true,
		hasThumbnail: false,
		...overrides,
	}
}

/**
 * Build a queue on fakes. Every fake succeeds immediately unless a test changes it.
 *
 * @param {object} [options] - Options
 * @param {Object<number, object>} [options.statuses] - Status by file id
 * @param {object} [options.settings] - Settings overrides
 * @return {object} The queue and its fakes
 */
function setup({ statuses = {}, settings = {} } = {}) {
	const table = new Map(Object.entries(statuses).map(([id, entry]) => [Number(id), entry]))
	const skipped = new Set()
	const resumeCallbacks = []
	const state = { paused: false, clock: 1000 }
	// Timers the queue set, which a test fires by hand
	const timers = []

	const deps = {
		settings: {
			enabled: true,
			background: true,
			maxFileSizeMB: 100,
			timeoutSeconds: 60,
			folderBudgetMB: 500,
			...settings,
		},
		api: {
			fetchStatus: jest.fn(async (ids) => new Map(ids.filter((id) => table.has(id)).map((id) => [id, table.get(id)]))),
			uploadThumbnail: jest.fn(async () => 'stored'),
		},
		load: jest.fn(async (id) => ({ mainFile: fakeFile(table.get(id).size), dependencies: [] })),
		render: jest.fn(async () => PNG),
		skips: {
			isSkipped: jest.fn((id, etag) => skipped.has(`${id}:${etag}`)),
			markSkipped: jest.fn((id, etag) => skipped.add(`${id}:${etag}`)),
		},
		env: {
			isPaused: jest.fn(() => state.paused),
			onResume: jest.fn((cb) => resumeCallbacks.push(cb)),
			whenIdle: jest.fn(() => Promise.resolve()),
			now: jest.fn(() => state.clock),
			setTimer: jest.fn((cb, ms) => {
				const timer = { cb, ms, cancelled: false }
				timers.push(timer)
				return () => {
					timer.cancelled = true
				}
			}),
		},
		onThumbnail: jest.fn(),
	}

	const resume = () => {
		state.paused = false
		resumeCallbacks.splice(0).forEach((cb) => cb())
	}

	/** Fire every timer still pending, as if its time had come. */
	const fireTimers = () => timers.filter((timer) => !timer.cancelled).forEach((timer) => timer.cb())

	return { queue: createBackgroundQueue(deps), deps, table, skipped, state, resume, timers, fireTimers }
}

/**
 * A load that reports `bytes` received, then hangs until its signal fires and rejects the
 * way fetch does.
 *
 * @param {number} bytes - Bytes it pretends to have received before hanging
 * @return {Function} A `load` implementation
 */
function hangingLoad(bytes) {
	return (id, name, extension, dir, { signal, onBytes }) => new Promise((resolve, reject) => {
		onBytes(bytes)
		signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
	})
}

/**
 * @param {jest.Mock} load - The load fake
 * @return {number[]} The file ids it was called with, in order
 */
const loadedIds = (load) => load.mock.calls.map(([id]) => id)

describe('createBackgroundQueue', () => {
	it('visible files go first', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 3: status(3), 4: status(4) } })

		queue.setFolder('/models', [1, 2, 3, 4], new Set([4, 2]))
		await queue.idle()

		expect(loadedIds(deps.load)).toEqual([2, 4, 1, 3])
	})

	it('only one job runs at a time', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
		const renders = []
		deps.render.mockImplementation(() => {
			const step = deferred()
			renders.push(step)
			return step.promise
		})

		queue.setFolder('/models', [1, 2], new Set())
		await flush()

		expect(deps.load).toHaveBeenCalledTimes(1)
		expect(deps.render).toHaveBeenCalledTimes(1)
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()

		renders[0].resolve(PNG)
		await flush()

		expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(1)
		expect(deps.load).toHaveBeenCalledTimes(2)
		expect(deps.load.mock.invocationCallOrder[1]).toBeGreaterThan(deps.api.uploadThumbnail.mock.invocationCallOrder[0])

		renders[1].resolve(PNG)
		await queue.idle()
		expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(2)
	})

	it('skips read-only, existing, skipped, oversized and worker-unsafe files without loading them', async () => {
		const { queue, deps, skipped } = setup({
			settings: { maxFileSizeMB: 10 },
			statuses: {
				1: status(1, { canEdit: false }),
				2: status(2, { hasThumbnail: true }),
				3: status(3),
				4: status(4, { size: 10 * MB + 1 }),
				5: status(5, { name: 'scene.dae' }),
				6: status(6, { size: 10 * MB }),
			},
		})
		skipped.add('3:etag-3')

		queue.setFolder('/models', [1, 2, 3, 4, 5, 6], new Set())
		await queue.idle()

		expect(loadedIds(deps.load)).toEqual([6])
		expect(deps.skips.isSkipped).toHaveBeenCalledWith(3, 'etag-3')
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
	})

	it('stops the folder when the next file exceeds the budget, without skipping it', async () => {
		const { queue, deps } = setup({
			settings: { folderBudgetMB: 500, maxFileSizeMB: 2048 },
			statuses: {
				1: status(1, { size: 300 * MB }),
				2: status(2, { size: 300 * MB }),
				// Would fit, but the folder has stopped
				3: status(3, { size: MB }),
			},
		})

		queue.setFolder('/models', [1, 2, 3], new Set())
		await queue.idle()

		expect(loadedIds(deps.load)).toEqual([1])
		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
	})

	it('counts dependency bytes against the budget', async () => {
		const { queue, deps } = setup({
			settings: { folderBudgetMB: 50 },
			statuses: { 1: status(1, { size: 10 * MB, name: 'part.obj' }), 2: status(2, { size: 10 * MB }) },
		})
		// 10 MB of model plus 35 MB of materials and textures leaves 5 MB
		deps.load.mockImplementationOnce(async () => ({
			mainFile: fakeFile(10 * MB),
			dependencies: [fakeFile(5 * MB, 'part.mtl'), fakeFile(30 * MB, 'texture.png')],
		}))

		queue.setFolder('/models', [1, 2], new Set())
		await queue.idle()

		expect(loadedIds(deps.load)).toEqual([1])
		expect(deps.render.mock.calls[0][0].additionalFiles).toHaveLength(2)
	})

	it('a timeout marks the file skipped for that etag', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
		deps.render.mockRejectedValueOnce(new ThumbnailTimeoutError(60000))

		queue.setFolder('/models', [1, 2], new Set())
		await queue.idle()

		expect(deps.skips.markSkipped).toHaveBeenCalledTimes(1)
		expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
		expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(1)
		expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(2, 'etag-2', PNG)
	})

	it('an empty model is skipped, not uploaded', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1) } })
		deps.render.mockRejectedValueOnce(new EmptyModelError())

		queue.setFolder('/models', [1], new Set())
		await queue.idle()

		expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
		expect(deps.onThumbnail).not.toHaveBeenCalled()
	})

	it('stale upload neither stores nor skips', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
		deps.api.uploadThumbnail.mockResolvedValueOnce('stale')

		queue.setFolder('/models', [1, 2], new Set())
		await queue.idle()

		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		expect(deps.onThumbnail).toHaveBeenCalledTimes(1)
		expect(deps.onThumbnail).toHaveBeenCalledWith(2, PNG)
		expect(loadedIds(deps.load)).toEqual([1, 2])
	})

	it('leaving the folder aborts the current job without skipping it', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 9: status(9) } })
		let signal
		deps.render.mockImplementationOnce((job, options) => {
			signal = options.signal
			return new Promise((resolve, reject) => {
				options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
			})
		})

		queue.setFolder('/models', [1, 2], new Set())
		await flush()
		expect(signal.aborted).toBe(false)

		queue.setFolder('/other', [9], new Set())
		expect(signal.aborted).toBe(true)
		await queue.idle()

		expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		expect(deps.api.uploadThumbnail).not.toHaveBeenCalledWith(1, expect.anything(), expect.anything())
		// The rest of the old folder is dropped; the new one is worked through
		expect(loadedIds(deps.load)).toEqual([1, 9])
		expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(9, 'etag-9', PNG)
	})

	it('a new folder visit gets a fresh budget', async () => {
		const { queue, deps } = setup({
			settings: { folderBudgetMB: 500, maxFileSizeMB: 2048 },
			statuses: {
				1: status(1, { size: 300 * MB }),
				2: status(2, { size: 300 * MB }),
				3: status(3, { size: 300 * MB }),
			},
		})

		queue.setFolder('/a', [1, 2], new Set())
		await queue.idle()
		expect(loadedIds(deps.load)).toEqual([1])

		queue.setFolder('/b', [3], new Set())
		await queue.idle()
		expect(loadedIds(deps.load)).toEqual([1, 3])

		// Coming back to the first folder is a new visit too
		queue.setFolder('/a', [1, 2], new Set())
		await queue.idle()
		expect(loadedIds(deps.load)).toEqual([1, 3, 1])
	})

	it('waits while paused and resumes', async () => {
		const { queue, deps, state, resume } = setup({ statuses: { 1: status(1) } })
		state.paused = true

		queue.setFolder('/models', [1], new Set())
		await flush()
		await flush()

		expect(deps.env.onResume).toHaveBeenCalled()
		expect(deps.load).not.toHaveBeenCalled()

		resume()
		await queue.idle()

		expect(loadedIds(deps.load)).toEqual([1])
		expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(1)
	})

	it('calls onThumbnail after a stored upload', async () => {
		const { queue, deps } = setup({ statuses: { 1: status(1) } })

		queue.setFolder('/models', [1], new Set())
		await queue.idle()

		expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(1, 'etag-1', PNG)
		expect(deps.onThumbnail).toHaveBeenCalledWith(1, PNG)
		expect(deps.onThumbnail.mock.invocationCallOrder[0]).toBeGreaterThan(deps.api.uploadThumbnail.mock.invocationCallOrder[0])
	})

	describe('ordering and status', () => {
		it('fetches the status once, before any download, and uploads with its etag', async () => {
			const { queue, deps, table } = setup({ statuses: { 1: status(1), 2: status(2) } })
			// The file is edited while it downloads; the queue must not pick up the new etag
			deps.load.mockImplementationOnce(async () => {
				table.set(1, status(1, { etag: 'etag-1-edited' }))
				return { mainFile: fakeFile(MB), dependencies: [] }
			})
			deps.api.uploadThumbnail.mockImplementation(async (id, etag) => (etag === 'etag-1' ? 'stale' : 'stored'))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.api.fetchStatus).toHaveBeenCalledTimes(1)
			expect(deps.api.fetchStatus).toHaveBeenCalledWith([1, 2])
			expect(deps.api.fetchStatus.mock.invocationCallOrder[0]).toBeLessThan(deps.load.mock.invocationCallOrder[0])
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(1, 'etag-1', PNG)
			// 412 is safe: the next visit sees the new version
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})

		it('the same folder with new ids only appends the new ones', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 3: status(3) } })

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()
			queue.setFolder('/models', [1, 2, 3], new Set([1]))
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([1, 2, 3])
			expect(deps.api.fetchStatus.mock.calls).toEqual([[[1, 2]], [[3]]])
		})

		it('appending to a running folder keeps its job and its budget', async () => {
			const { queue, deps } = setup({
				settings: { folderBudgetMB: 500, maxFileSizeMB: 2048 },
				statuses: { 1: status(1, { size: 300 * MB }), 2: status(2, { size: 300 * MB }) },
			})
			const render = deferred()
			let signal
			deps.render.mockImplementationOnce((job, options) => {
				signal = options.signal
				return render.promise
			})

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.setFolder('/models', [1, 2], new Set())
			expect(signal.aborted).toBe(false)

			render.resolve(PNG)
			await queue.idle()

			// 300 MB of the 500 MB are spent, so the second 300 MB file stops the folder
			expect(loadedIds(deps.load)).toEqual([1])
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(1, 'etag-1', PNG)
		})

		it('takes the extension from the status name, lower case after the last dot', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1, { name: 'Bracket.v2.GLB', dir: '/parts' }) } })

			queue.setFolder('/parts', [1], new Set())
			await queue.idle()

			expect(deps.load).toHaveBeenCalledWith(1, 'Bracket.v2.GLB', 'glb', '/parts', {
				signal: expect.any(AbortSignal),
				budgetBytes: 500 * MB,
				onBytes: expect.any(Function),
			})
			expect(deps.render.mock.calls[0][0]).toEqual({
				extension: 'glb',
				buffer: expect.any(ArrayBuffer),
				additionalFiles: [],
			})
		})

		it('ignores files the status does not list', async () => {
			const { queue, deps } = setup({ statuses: { 2: status(2) } })

			queue.setFolder('/models', [1, 2], new Set([1]))
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([2])
		})
	})

	describe('time limit', () => {
		it('passes the time left after loading to render', async () => {
			const { queue, deps, state } = setup({ settings: { timeoutSeconds: 30 }, statuses: { 1: status(1) } })
			deps.load.mockImplementationOnce(async () => {
				state.clock += 12000
				return { mainFile: fakeFile(MB), dependencies: [] }
			})

			queue.setFolder('/models', [1], new Set())
			await queue.idle()

			expect(deps.render.mock.calls[0][1]).toEqual({ timeoutMs: 18000, signal: expect.any(AbortSignal) })
		})

		it('a load that uses up the time limit marks the file skipped without rendering', async () => {
			const { queue, deps, state } = setup({
				settings: { timeoutSeconds: 30, folderBudgetMB: 50 },
				statuses: { 1: status(1, { size: 20 * MB }), 2: status(2, { size: 20 * MB }) },
			})
			deps.load.mockImplementationOnce(async () => {
				state.clock += 30000
				return { mainFile: fakeFile(40 * MB), dependencies: [] }
			})

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
			expect(deps.render).not.toHaveBeenCalled()
			// The bytes were still downloaded, so they still count: 10 MB left is too little for file 2
			expect(loadedIds(deps.load)).toEqual([1])
		})
	})

	describe('failures', () => {
		it('a failed load marks the file skipped and moves on', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			deps.load.mockRejectedValueOnce(new Error('404'))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
			expect(deps.render).toHaveBeenCalledTimes(1)
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(2, 'etag-2', PNG)
		})

		it('a loader error on a file that downloaded fine marks it skipped', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1) } })
			deps.render.mockRejectedValueOnce(new Error('Invalid FBX file'))

			queue.setFolder('/models', [1], new Set())
			await queue.idle()

			expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
			expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
		})

		it('exists, forbidden and error uploads move on without skipping', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 3: status(3) } })
			deps.api.uploadThumbnail
				.mockResolvedValueOnce('exists')
				.mockResolvedValueOnce('forbidden')
				.mockResolvedValueOnce('error')

			queue.setFolder('/models', [1, 2, 3], new Set())
			await queue.idle()

			expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(3)
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			expect(deps.onThumbnail).not.toHaveBeenCalled()
		})

		it('a failing status request ends the folder quietly', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1) } })
			deps.api.fetchStatus.mockRejectedValueOnce(new Error('Network Error'))

			queue.setFolder('/models', [1], new Set())
			await expect(queue.idle()).resolves.toBeUndefined()

			expect(deps.load).not.toHaveBeenCalled()
		})

		it('a throwing dependency never escapes the queue', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			deps.onThumbnail.mockImplementation(() => {
				throw new Error('preview refresh failed')
			})
			deps.skips.isSkipped.mockImplementationOnce(() => {
				throw new Error('storage')
			})

			queue.setFolder('/models', [1, 2], new Set())
			await expect(queue.idle()).resolves.toBeUndefined()

			// The second file is still processed after the first one threw
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(2, 'etag-2', PNG)
		})

		it('a rejecting whenIdle ends the folder quietly', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			deps.env.whenIdle.mockRejectedValueOnce(new Error('gone'))

			queue.setFolder('/models', [1, 2], new Set())
			await expect(queue.idle()).resolves.toBeUndefined()

			expect(deps.load).not.toHaveBeenCalled()
		})
	})

	describe('leaving and stopping', () => {
		it('a load that finishes after the folder changed is discarded', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 9: status(9) } })
			const load = deferred()
			deps.load.mockImplementationOnce(() => load.promise)

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.setFolder('/other', [9], new Set())
			await flush()

			// A load that ignores its signal is still waited for, so two never overlap
			expect(loadedIds(deps.load)).toEqual([1])

			load.resolve({ mainFile: fakeFile(MB), dependencies: [] })
			await queue.idle()

			expect(deps.render).toHaveBeenCalledTimes(1)
			expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(1)
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(9, 'etag-9', PNG)
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})

		it('stop() aborts the current job without skipping and idle() resolves', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			let signal
			deps.render.mockImplementationOnce((job, options) => {
				signal = options.signal
				return new Promise((resolve, reject) => {
					options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
				})
			})

			queue.setFolder('/models', [1, 2], new Set())
			await flush()
			queue.stop()
			await queue.idle()

			expect(signal.aborted).toBe(true)
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
			expect(loadedIds(deps.load)).toEqual([1])
		})

		it('a render that resolves after the folder changed is not uploaded', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1) } })
			const render = deferred()
			deps.render.mockImplementationOnce(() => render.promise)

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.stop()
			render.resolve(PNG)
			await queue.idle()

			expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})

		it('stop() while paused lets idle() resolve', async () => {
			const { queue, deps, state } = setup({ statuses: { 1: status(1) } })
			state.paused = true

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.stop()
			await queue.idle()

			expect(deps.load).not.toHaveBeenCalled()
		})

		it('stop() while waiting for an idle moment lets idle() resolve', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1) } })
			deps.env.whenIdle.mockImplementation(() => new Promise(() => {}))

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.stop()
			await queue.idle()

			expect(deps.load).not.toHaveBeenCalled()
		})

		it('idle() resolves when there is nothing to do', async () => {
			const { queue, deps } = setup()

			await expect(queue.idle()).resolves.toBeUndefined()
			queue.setFolder('/empty', [], new Set())
			await expect(queue.idle()).resolves.toBeUndefined()
			expect(deps.load).not.toHaveBeenCalled()
		})

		it('awaits an idle moment before each file', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			const moments = []
			deps.env.whenIdle.mockImplementation(() => {
				const moment = deferred()
				moments.push(moment)
				return moment.promise
			})

			queue.setFolder('/models', [1, 2], new Set())
			await flush()
			expect(deps.load).not.toHaveBeenCalled()

			moments[0].resolve()
			await flush()
			expect(loadedIds(deps.load)).toEqual([1])
			expect(moments).toHaveLength(2)

			moments[1].resolve()
			await queue.idle()
			expect(loadedIds(deps.load)).toEqual([1, 2])
		})
	})

	describe('aborting downloads', () => {
		it('gives the load one signal, the budget left and a byte counter', async () => {
			const { queue, deps } = setup({
				settings: { folderBudgetMB: 50 },
				statuses: { 1: status(1, { size: 10 * MB }), 2: status(2, { size: 10 * MB }) },
			})

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			const [first, second] = deps.load.mock.calls.map((call) => call[4])
			expect(first.budgetBytes).toBe(50 * MB)
			// The first file's 10 MB are spent
			expect(second.budgetBytes).toBe(40 * MB)
			expect(first.signal).not.toBe(second.signal)
		})

		it('an abort at the deadline mid-download marks the file skipped and counts the bytes received', async () => {
			const { queue, deps, timers, fireTimers } = setup({
				settings: { timeoutSeconds: 30, folderBudgetMB: 50 },
				statuses: { 1: status(1, { size: 40 * MB }), 2: status(2, { size: 25 * MB }) },
			})
			let signal
			deps.load.mockImplementationOnce((id, name, extension, dir, options) => {
				signal = options.signal
				return hangingLoad(30 * MB)(id, name, extension, dir, options)
			})

			queue.setFolder('/models', [1, 2], new Set())
			await flush()
			expect(timers[0].ms).toBe(30000)
			expect(signal.aborted).toBe(false)

			fireTimers()
			expect(signal.aborted).toBe(true)
			await queue.idle()

			expect(deps.skips.markSkipped).toHaveBeenCalledWith(1, 'etag-1')
			expect(deps.render).not.toHaveBeenCalled()
			// 30 MB of the 50 MB arrived before the abort, so the 25 MB file no longer fits
			expect(loadedIds(deps.load)).toEqual([1])
			expect(deps.skips.markSkipped).toHaveBeenCalledTimes(1)
		})

		it('leaving the folder mid-download aborts the request without skipping the file', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 9: status(9) } })
			let signal
			deps.load.mockImplementationOnce((id, name, extension, dir, options) => {
				signal = options.signal
				return hangingLoad(MB / 2)(id, name, extension, dir, options)
			})

			queue.setFolder('/models', [1], new Set())
			await flush()
			expect(signal.aborted).toBe(false)

			queue.setFolder('/other', [9], new Set())
			expect(signal.aborted).toBe(true)
			await queue.idle()

			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			expect(loadedIds(deps.load)).toEqual([1, 9])
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(9, 'etag-9', PNG)
		})

		it('stop() mid-download aborts the request without skipping the file', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1) } })
			let signal
			deps.load.mockImplementationOnce((id, name, extension, dir, options) => {
				signal = options.signal
				return hangingLoad(0)(id, name, extension, dir, options)
			})

			queue.setFolder('/models', [1], new Set())
			await flush()
			queue.stop()
			await queue.idle()

			expect(signal.aborted).toBe(true)
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})

		it('cancels the deadline once the download is done', async () => {
			const { queue, timers } = setup({ statuses: { 1: status(1) } })

			queue.setFolder('/models', [1], new Set())
			await queue.idle()

			expect(timers).toHaveLength(1)
			expect(timers[0].cancelled).toBe(true)
		})

		it('a main file bigger than the budget left ends the visit without skipping it', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			deps.load.mockRejectedValueOnce(new ThumbnailBudgetError(MB))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([1])
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})
	})

	describe('environment failures', () => {
		it('a network error or 5xx on download never marks the file skipped', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 3: status(3) } })
			deps.load
				.mockRejectedValueOnce(new ThumbnailEnvironmentError('Network error'))
				.mockRejectedValueOnce(new ThumbnailEnvironmentError('HTTP 503'))

			queue.setFolder('/models', [1, 2, 3], new Set())
			await queue.idle()

			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(3, 'etag-3', PNG)
		})

		it('a worker that fails to start or crashes never marks the file skipped', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2) } })
			deps.render.mockRejectedValueOnce(new ThumbnailEnvironmentError('Thumbnail worker crashed'))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(2, 'etag-2', PNG)
		})

		it('the breaker stops the page after three failures in a row', async () => {
			const statuses = Object.fromEntries([1, 2, 3, 4, 5, 9].map((id) => [id, status(id)]))
			const { queue, deps } = setup({ statuses })
			deps.load.mockRejectedValueOnce(new ThumbnailEnvironmentError('Network error'))
			deps.render
				.mockRejectedValueOnce(new ThumbnailEnvironmentError('Thumbnail worker crashed'))
				.mockRejectedValueOnce(new Error('Invalid model'))

			queue.setFolder('/models', [1, 2, 3, 4, 5], new Set())
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([1, 2, 3])
			// Only the parse error is the file's; the other two are the environment's
			expect(deps.skips.markSkipped.mock.calls).toEqual([[3, 'etag-3']])
			expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()

			// Nothing more on this page, not even in another folder
			queue.setFolder('/other', [9], new Set())
			await queue.idle()
			expect(loadedIds(deps.load)).toEqual([1, 2, 3])
		})

		it('timeouts and empty models do not trip the breaker, and a success resets it', async () => {
			const statuses = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((id) => [id, status(id)]))
			const { queue, deps } = setup({ statuses })
			const crash = () => new ThumbnailEnvironmentError('Thumbnail worker crashed')
			deps.render
				.mockRejectedValueOnce(crash())
				.mockRejectedValueOnce(crash())
				.mockRejectedValueOnce(new ThumbnailTimeoutError(60000))
				.mockResolvedValueOnce(PNG)
				.mockRejectedValueOnce(crash())
				.mockRejectedValueOnce(crash())

			queue.setFolder('/models', [1, 2, 3, 4, 5, 6, 7], new Set())
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([1, 2, 3, 4, 5, 6, 7])
			expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([4, 7])
			expect(deps.skips.markSkipped.mock.calls).toEqual([[3, 'etag-3']])
		})
	})

	describe('companions that were not fetched', () => {
		// A thumbnail is written once per version and never replaced, so a model rendered
		// without a companion would keep that degraded picture for good (R15)

		it('a companion dropped for the budget ends the visit: no render, no upload, no skip', async () => {
			const { queue, deps } = setup({
				settings: { folderBudgetMB: 100 },
				statuses: { 1: status(1, { name: 'chair.obj' }), 2: status(2) },
			})
			deps.load.mockImplementationOnce(async () => ({
				mainFile: fakeFile(MB, 'chair.obj'),
				dependencies: [fakeFile(1024, 'chair.mtl')],
				missingFiles: ['wood.png'],
				budgetReached: true,
				bytesNeeded: 60 * MB,
			}))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.render).not.toHaveBeenCalled()
			expect(deps.api.uploadThumbnail).not.toHaveBeenCalled()
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			// The visit is over: the next file waits for a fresh budget too
			expect(loadedIds(deps.load)).toEqual([1])
		})

		it('the next visit, with a fresh budget, tries the file again', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1, { name: 'chair.obj' }) } })
			deps.load.mockImplementationOnce(async () => ({
				mainFile: fakeFile(MB, 'chair.obj'),
				dependencies: [],
				missingFiles: ['chair.mtl'],
				budgetReached: true,
				bytesNeeded: 2 * MB,
			}))

			queue.setFolder('/models', [1], new Set())
			await queue.idle()
			queue.setFolder('/elsewhere', [], new Set())
			queue.setFolder('/models', [1], new Set())
			await queue.idle()

			expect(loadedIds(deps.load)).toEqual([1, 1])
			expect(deps.api.uploadThumbnail).toHaveBeenCalledTimes(1)
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(1, 'etag-1', PNG)
		})

		it('a model that needs more than the whole folder budget is skipped, so it is not downloaded every visit', async () => {
			const { queue, deps } = setup({
				settings: { folderBudgetMB: 50 },
				statuses: { 1: status(1, { name: 'scene.gltf' }), 2: status(2) },
			})
			// One companion alone is larger than the whole budget
			deps.load.mockImplementationOnce(async () => ({
				mainFile: fakeFile(MB, 'scene.gltf'),
				dependencies: [],
				missingFiles: ['scene.bin'],
				budgetReached: true,
				bytesNeeded: MB + 80 * MB,
			}))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			expect(deps.render).not.toHaveBeenCalledWith(expect.objectContaining({ extension: 'gltf' }), expect.anything())
			expect(deps.skips.markSkipped.mock.calls).toEqual([[1, 'etag-1']])
			// What is left of the budget still serves the rest of the folder
			expect(loadedIds(deps.load)).toEqual([1, 2])
			expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([2])
		})

		it('a declared texture that is missing marks the file skipped without rendering it', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1, { name: 'chair.obj' }), 2: status(2) } })
			deps.load.mockImplementationOnce(async () => ({
				mainFile: fakeFile(MB, 'chair.obj'),
				dependencies: [fakeFile(1024, 'chair.mtl')],
				missingFiles: ['textures/wood.png'],
				budgetReached: false,
			}))

			queue.setFolder('/models', [1, 2], new Set())
			await queue.idle()

			// The viewer, which also searches the folder's subfolders, makes the first thumbnail
			expect(deps.skips.markSkipped.mock.calls).toEqual([[1, 'etag-1']])
			expect(deps.render).toHaveBeenCalledTimes(1)
			expect(deps.render.mock.calls[0][0].extension).toBe('glb')
			expect(deps.api.uploadThumbnail.mock.calls.map(([id]) => id)).toEqual([2])
		})

		it('a glTF whose .bin did not fit takes the budget path: no worker, no skip, no breaker count', async () => {
			const statuses = {
				1: status(1, { name: 'a.ply' }),
				2: status(2, { name: 'b.ply' }),
				3: status(3, { name: 'scene.gltf' }),
				9: status(9, { name: 'part.stl' }),
			}
			const { queue, deps } = setup({ settings: { folderBudgetMB: 100 }, statuses })
			// What the worker would do with a glTF handed over without its buffer
			deps.render.mockImplementation(async (job) => {
				if (job.extension === 'gltf' && job.additionalFiles.length === 0) {
					throw new Error('THREE.GLTFLoader: Failed to load buffer "scene.bin".')
				}
				if (job.extension === 'ply') {
					throw new Error('Invalid PLY file')
				}
				return PNG
			})
			deps.load.mockImplementation(async (id) => (id === 3
				? { mainFile: fakeFile(MB, 'scene.gltf'), dependencies: [], missingFiles: ['scene.bin'], budgetReached: true, bytesNeeded: 60 * MB }
				: { mainFile: fakeFile(MB), dependencies: [], missingFiles: [], budgetReached: false }))

			queue.setFolder('/models', [1, 2, 3], new Set())
			await queue.idle()

			expect(deps.render.mock.calls.map(([job]) => job.extension)).toEqual(['ply', 'ply'])
			expect(deps.skips.markSkipped.mock.calls).toEqual([[1, 'etag-1'], [2, 'etag-2']])

			// Two parse failures so far; had the glTF counted as a third, the breaker would
			// have stopped the page and this folder would get nothing
			queue.setFolder('/other', [9], new Set())
			await queue.idle()
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(9, 'etag-9', PNG)
		})

		it('an FBX that declares no textures at all is rendered as it is', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1, { name: 'robot.fbx' }) } })
			deps.load.mockImplementationOnce(async () => ({
				mainFile: fakeFile(MB, 'robot.fbx'),
				dependencies: [],
				missingFiles: [],
				budgetReached: false,
			}))

			queue.setFolder('/models', [1], new Set())
			await queue.idle()

			expect(deps.render.mock.calls[0][0]).toMatchObject({ extension: 'fbx', additionalFiles: [] })
			expect(deps.api.uploadThumbnail).toHaveBeenCalledWith(1, 'etag-1', PNG)
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})
	})

	describe('capability probe', () => {
		it('a failed probe skips nothing and stops the page before any download', async () => {
			const { queue, deps } = setup({ statuses: { 1: status(1), 2: status(2), 9: status(9) } })
			deps.probe = jest.fn(async () => false)
			const probed = createBackgroundQueue(deps)

			probed.setFolder('/models', [1, 2], new Set())
			await probed.idle()
			probed.setFolder('/other', [9], new Set())
			await probed.idle()

			expect(deps.probe).toHaveBeenCalledTimes(1)
			expect(deps.probe).toHaveBeenCalledWith({ timeoutMs: 60000 })
			expect(deps.load).not.toHaveBeenCalled()
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
			// The status is only a question to the server, not a download
			expect(deps.api.fetchStatus).toHaveBeenCalledTimes(1)
			queue.stop()
		})

		it('a probe that throws counts as failed', async () => {
			const { deps } = setup({ statuses: { 1: status(1) } })
			deps.probe = jest.fn(async () => {
				throw new Error('Worker blocked by CSP')
			})
			const probed = createBackgroundQueue(deps)

			probed.setFolder('/models', [1], new Set())
			await probed.idle()

			expect(deps.load).not.toHaveBeenCalled()
			expect(deps.skips.markSkipped).not.toHaveBeenCalled()
		})

		it('probes once per page, before the first download, and only when there is one', async () => {
			const { deps } = setup({ statuses: { 1: status(1, { hasThumbnail: true }), 2: status(2), 3: status(3) } })
			deps.probe = jest.fn(async () => true)
			const probed = createBackgroundQueue(deps)

			probed.setFolder('/done', [1], new Set())
			await probed.idle()
			expect(deps.probe).not.toHaveBeenCalled()

			probed.setFolder('/a', [2], new Set())
			await probed.idle()
			probed.setFolder('/b', [3], new Set())
			await probed.idle()

			expect(deps.probe).toHaveBeenCalledTimes(1)
			expect(deps.probe.mock.invocationCallOrder[0]).toBeLessThan(deps.load.mock.invocationCallOrder[0])
			expect(loadedIds(deps.load)).toEqual([2, 3])
		})
	})
})
