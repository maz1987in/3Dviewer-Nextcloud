/**
 * Measuring a model in the browser for the Files sidebar's tab: the user's thumbnail limits
 * (largest file, time, download allowance) decide whether it is measured at all.
 */
import { measureModel } from '../../../src/stats/measureModel.js'
import {
	ThumbnailBudgetError,
	ThumbnailEnvironmentError,
	ThumbnailTimeoutError,
	ThumbnailTooLargeError,
} from '../../../src/thumbnails/errors.js'

jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const MB = 1048576
const STATS = { v: 1, kind: 'mesh', size: [1, 2, 3] }
const FILE = { fileId: 7, name: 'Part.v2.STL', dir: '/models', size: 5 * MB }

function setup(overrides = {}) {
	const deps = {
		loadSettings: jest.fn(async () => ({ maxFileSizeMB: 100, timeoutSeconds: 60, folderBudgetMB: 500, ...overrides.settings })),
		load: jest.fn(async () => ({ mainFile: { arrayBuffer: async () => new ArrayBuffer(8), size: 8 }, dependencies: [{ name: 'a.mtl' }], missingFiles: [] })),
		measure: jest.fn(async () => STATS),
	}
	return { ...deps, ...overrides.deps }
}

describe('measureModel', () => {
	it('downloads the model with its companions and measures it in a worker, from the file\'s name', async () => {
		const deps = setup()

		const result = await measureModel(FILE, deps)

		expect(result).toEqual({ status: 'measured', stats: STATS, complete: true })
		expect(deps.load).toHaveBeenCalledWith(7, 'Part.v2.STL', 'stl', '/models', {
			signal: expect.any(AbortSignal),
			budgetBytes: 500 * MB,
			onBytes: expect.any(Function),
		})
		expect(deps.measure).toHaveBeenCalledWith(
			{ extension: 'stl', buffer: expect.any(ArrayBuffer), additionalFiles: [{ name: 'a.mtl' }], name: 'Part.v2.STL' },
			{ timeoutMs: expect.any(Number), signal: expect.any(AbortSignal) },
		)
	})

	it('gives the worker what is left of the time limit, not the whole of it', async () => {
		const deps = setup({ settings: { timeoutSeconds: 30 } })

		await measureModel(FILE, deps)

		const { timeoutMs } = deps.measure.mock.calls[0][1]
		expect(timeoutMs).toBeGreaterThan(29000)
		expect(timeoutMs).toBeLessThanOrEqual(30000)
	})

	it('downloads nothing for a file over the user\'s size limit', async () => {
		const deps = setup({ settings: { maxFileSizeMB: 4 } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'too-large' })
		expect(deps.load).not.toHaveBeenCalled()
	})

	it('downloads nothing for a file larger than a whole download allowance', async () => {
		const deps = setup({ settings: { maxFileSizeMB: 1000, folderBudgetMB: 4 } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'too-large' })
		expect(deps.load).not.toHaveBeenCalled()
	})

	it('takes a file of exactly the limit', async () => {
		const deps = setup({ settings: { maxFileSizeMB: 5 } })

		expect((await measureModel(FILE, deps)).status).toBe('measured')
	})

	it('does not trust a size that is not a number', async () => {
		const deps = setup()

		expect(await measureModel({ ...FILE, size: NaN }, deps)).toEqual({ status: 'too-large' })
		expect(await measureModel({ ...FILE, size: undefined }, deps)).toEqual({ status: 'too-large' })
		expect(deps.load).not.toHaveBeenCalled()
	})

	it('says too large when the companions do not fit what is left of the allowance', async () => {
		const deps = setup({ deps: { load: jest.fn(async () => ({ mainFile: {}, budgetReached: true, bytesNeeded: 600 * MB })) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'too-large' })
		expect(deps.measure).not.toHaveBeenCalled()
	})

	it.each([
		['the worker runs out of time', new ThumbnailTimeoutError(1000)],
		['its XML is longer than the parser takes', new ThumbnailTooLargeError()],
		['the download outgrows the allowance', new ThumbnailBudgetError(1)],
	])('says too large when %s', async (_, error) => {
		const deps = setup({ deps: { measure: jest.fn(async () => { throw error }) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'too-large' })
	})

	it('says too large when the download runs past the time limit', async () => {
		jest.useFakeTimers()
		try {
			const load = jest.fn((id, name, extension, dir, { signal }) => new Promise((resolve, reject) => {
				signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
			}))
			const pending = measureModel(FILE, setup({ settings: { timeoutSeconds: 5 }, deps: { load } }))

			await jest.advanceTimersByTimeAsync(5000)

			expect(await pending).toEqual({ status: 'too-large' })
		} finally {
			jest.useRealTimers()
		}
	})

	it.each([
		['the loader cannot read the model', new Error('Invalid STL')],
		['the network fails', new ThumbnailEnvironmentError('offline')],
	])('says failed when %s', async (_, error) => {
		const deps = setup({ deps: { measure: jest.fn(async () => { throw error }) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'failed' })
	})

	it('says failed when the download is refused', async () => {
		const deps = setup({ deps: { load: jest.fn(async () => { throw new Error('HTTP 403') }) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'failed' })
	})

	it('says failed when the limits cannot be read', async () => {
		const deps = setup({ deps: { loadSettings: jest.fn(async () => { throw new Error('offline') }) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'failed' })
		expect(deps.load).not.toHaveBeenCalled()
	})

	it('says the numbers are incomplete when a companion the model declares was not found', async () => {
		const deps = setup({ deps: { load: jest.fn(async () => ({ mainFile: { arrayBuffer: async () => new ArrayBuffer(8) }, dependencies: [], missingFiles: ['wood.png'] })) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'measured', stats: STATS, complete: false })
	})

	it('hands on a model with nothing to measure as measured with no numbers', async () => {
		const deps = setup({ deps: { measure: jest.fn(async () => null) } })

		expect(await measureModel(FILE, deps)).toEqual({ status: 'measured', stats: null, complete: true })
	})

	it('stops the download when the tab is left, and reports it', async () => {
		const left = new AbortController()
		let seen
		const load = jest.fn((id, name, extension, dir, { signal }) => new Promise((resolve, reject) => {
			seen = signal
			signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
		}))
		const pending = measureModel(FILE, setup({ deps: { load } }), left.signal)

		await new Promise((resolve) => setTimeout(resolve, 0))
		left.abort()

		expect(await pending).toEqual({ status: 'aborted' })
		expect(seen.aborted).toBe(true)
	})

	it('does nothing for a tab that was already left', async () => {
		const left = new AbortController()
		left.abort()
		const deps = setup()

		expect(await measureModel(FILE, deps, left.signal)).toEqual({ status: 'aborted' })
		expect(deps.load).not.toHaveBeenCalled()
	})
})
