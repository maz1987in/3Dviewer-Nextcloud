import {
	awaitStatusBeforeDownload,
	captureForCurrentVersion,
	scheduleCapture,
	startStatusFetch,
	usedCachedFiles,
} from '../../../src/thumbnails/captureFromViewer.js'
import { fetchStatus, uploadThumbnail } from '../../../src/thumbnails/thumbnailApi.js'
import { renderThumbnail } from '../../../src/thumbnails/renderThumbnail.js'
import { EmptyModelError } from '../../../src/thumbnails/errors.js'
import { isPublicShare } from '../../../src/composables/usePublicShare.js'

jest.mock('../../../src/thumbnails/thumbnailApi.js')
jest.mock('../../../src/thumbnails/renderThumbnail.js')
jest.mock('../../../src/composables/usePublicShare.js', () => ({ isPublicShare: jest.fn(() => false) }))
jest.mock('../../../src/utils/logger.js', () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const PNG = { type: 'image/png', size: 4 }
const model = { isObject3D: true }

function status(overrides = {}) {
	return { name: 'a.glb', dir: '/', size: 1, etag: 'etag-1', canEdit: true, hasThumbnail: false, ...overrides }
}

function statusPromise(entry) {
	return Promise.resolve(new Map(entry ? [[5, entry]] : []))
}

beforeEach(() => {
	jest.clearAllMocks()
	renderThumbnail.mockResolvedValue(PNG)
	uploadThumbnail.mockResolvedValue('stored')
	isPublicShare.mockReturnValue(false)
})

describe('captureForCurrentVersion', () => {
	test('skips read-only files without rendering', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status({ canEdit: false })),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('skips when a thumbnail exists for this version', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status({ hasThumbnail: true })),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('skips a file the status does not list', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(null),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('renders and uploads with the status etag', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'GLB', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('stored')
		expect(renderThumbnail).toHaveBeenCalledTimes(1)
		const [rendered, options] = renderThumbnail.mock.calls[0]
		expect(rendered).toBe(model)
		expect(options.canvas.tagName).toBe('CANVAS')
		expect(uploadThumbnail).toHaveBeenCalledWith(5, 'etag-1', PNG)
	})

	test('reports exists when the server already holds a thumbnail', async () => {
		uploadThumbnail.mockResolvedValue('exists')

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('exists')
	})

	test.each(['stale', 'forbidden', 'error'])('treats an upload result of %s as skipped', async (outcome) => {
		uploadThumbnail.mockResolvedValue(outcome)

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('skipped')
	})

	test('skips non-model extensions without a request', async () => {
		fetchStatus.mockResolvedValue(new Map([[5, status()]]))

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'mtl', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('skipped')
		expect(fetchStatus).not.toHaveBeenCalled()
		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('uses the status fetched before the download, never re-fetching', async () => {
		// The etag must be the one from before the bytes were downloaded: a model edited
		// meanwhile must not get an old render stored under its new version. The mocked
		// endpoint answers with the newer etag, so a re-fetch would show in the upload.
		fetchStatus.mockResolvedValue(new Map([[5, status({ etag: 'after-download' })]]))

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status({ etag: 'before-download' })),
		})

		expect(result).toBe('stored')
		expect(fetchStatus).not.toHaveBeenCalled()
		expect(uploadThumbnail).toHaveBeenCalledTimes(1)
		expect(uploadThumbnail).toHaveBeenCalledWith(5, 'before-download', PNG)
	})

	test('a rejected status fetch is skipped, not thrown', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: Promise.reject(new Error('401')),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('an empty model is skipped without an upload', async () => {
		renderThumbnail.mockRejectedValue(new EmptyModelError())

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('skipped')
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('a failed render is skipped, not thrown', async () => {
		renderThumbnail.mockRejectedValue(new Error('context lost'))

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status()),
		})

		expect(result).toBe('skipped')
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})
})

describe('startStatusFetch', () => {
	test('starts one status request for a model file', async () => {
		const map = new Map([[5, status()]])
		fetchStatus.mockResolvedValue(map)

		const promise = startStatusFetch({ fileId: 5, extension: 'glb' })

		expect(fetchStatus).toHaveBeenCalledWith([5])
		expect(await promise).toBe(map)
	})

	test('accepts a numeric string id', () => {
		fetchStatus.mockResolvedValue(new Map())

		startStatusFetch({ fileId: '5', extension: 'stl' })

		expect(fetchStatus).toHaveBeenCalledWith([5])
	})

	test.each([
		['a companion extension', { fileId: 5, extension: 'mtl' }],
		['a synthetic id', { fileId: 'comparison', extension: 'glb' }],
		['a missing id', { fileId: 0, extension: 'glb' }],
	])('makes no request for %s', (name, args) => {
		expect(startStatusFetch(args)).toBeNull()
		expect(fetchStatus).not.toHaveBeenCalled()
	})

	test('makes no request on a public share', () => {
		isPublicShare.mockReturnValue(true)

		expect(startStatusFetch({ fileId: 5, extension: 'glb' })).toBeNull()
		expect(fetchStatus).not.toHaveBeenCalled()
	})

	test('a rejection nobody awaits is not an unhandled rejection', async () => {
		const unhandled = jest.fn()
		process.on('unhandledRejection', unhandled)
		fetchStatus.mockRejectedValue(new Error('offline'))

		startStatusFetch({ fileId: 5, extension: 'glb' })
		await new Promise((resolve) => setTimeout(resolve, 20))

		process.off('unhandledRejection', unhandled)
		expect(unhandled).not.toHaveBeenCalled()
	})

	test('the returned promise still rejects for the capture to see', async () => {
		fetchStatus.mockRejectedValue(new Error('offline'))

		await expect(startStatusFetch({ fileId: 5, extension: 'glb' })).rejects.toThrow('offline')
	})
})

describe('awaitStatusBeforeDownload', () => {
	afterEach(() => jest.useRealTimers())

	test('settles only once the status has arrived, so a download started after it is never older', async () => {
		let answer
		fetchStatus.mockReturnValue(new Promise((resolve) => {
			answer = resolve
		}))
		const order = []

		const waiting = awaitStatusBeforeDownload({ fileId: 5, extension: 'glb' }).then((statuses) => {
			order.push('download starts')
			return statuses
		})
		await new Promise((resolve) => setTimeout(resolve, 10))
		expect(order).toEqual([])

		order.push('status arrives')
		const map = new Map([[5, status()]])
		answer(map)

		expect(await waiting).toBe(map)
		expect(order).toEqual(['status arrives', 'download starts'])
	})

	test('a failed status lets the load go on and skips the capture', async () => {
		fetchStatus.mockRejectedValue(new Error('offline'))

		// Resolves, so the caller downloads; null means no capture for this load
		await expect(awaitStatusBeforeDownload({ fileId: 5, extension: 'glb' })).resolves.toBeNull()
		jest.useFakeTimers()
		scheduleCapture({ fileId: 5, extension: 'glb', object3D: model, statuses: null, isCurrent: () => true })
		await jest.advanceTimersByTimeAsync(500)
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('takes the status as a map as well as a promise', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statuses: new Map([[5, status()]]),
		})

		expect(result).toBe('stored')
	})

	test('a status that never answers holds the load back only until the time limit, and skips the capture', async () => {
		jest.useFakeTimers()
		fetchStatus.mockReturnValue(new Promise(() => {}))

		const waiting = awaitStatusBeforeDownload({ fileId: 5, extension: 'glb', timeoutMs: 1000 })
		await jest.advanceTimersByTimeAsync(1000)

		await expect(waiting).resolves.toBeNull()
	})

	test('resolves null without a request when there is nothing to capture', async () => {
		await expect(awaitStatusBeforeDownload({ fileId: 5, extension: 'mtl' })).resolves.toBeNull()
		expect(fetchStatus).not.toHaveBeenCalled()
	})
})

describe('usedCachedFiles', () => {
	test('true only when a file was served from the dependency cache', () => {
		const fresh = { name: 'chair.mtl' }
		const cached = { name: 'wood.png', _fromCache: true }

		expect(usedCachedFiles([fresh])).toBe(false)
		expect(usedCachedFiles([fresh, cached])).toBe(true)
		expect(usedCachedFiles(null)).toBe(false)
	})
})

describe('scheduleCapture', () => {
	beforeEach(() => jest.useFakeTimers())
	afterEach(() => jest.useRealTimers())

	/**
	 * Run the timers and the promise chains they start.
	 */
	async function flush() {
		await jest.advanceTimersByTimeAsync(500)
	}

	test('two loads in one viewer each upload under their own file id and etag', async () => {
		// The fileid watcher starts load B while load A is still running; A finishes last.
		// Whatever the viewer's current file is by then, A must store file 1's render
		// under file 1's etag and B file 2's under file 2's.
		const modelA = { name: 'A' }
		const modelB = { name: 'B' }
		const statusA = Promise.resolve(new Map([[1, status({ etag: 'etag-A' })]]))
		const statusB = Promise.resolve(new Map([[2, status({ etag: 'etag-B' })]]))

		scheduleCapture({ fileId: 2, extension: 'glb', object3D: modelB, statuses: statusB, isCurrent: () => true })
		scheduleCapture({ fileId: 1, extension: 'glb', object3D: modelA, statuses: statusA, isCurrent: () => true })
		await flush()

		expect(renderThumbnail.mock.calls.map(([object3D]) => object3D)).toEqual([modelB, modelA])
		expect(uploadThumbnail.mock.calls.map(([id, etag]) => [id, etag])).toEqual([[2, 'etag-B'], [1, 'etag-A']])
	})

	test('a load that was superseded while waiting is skipped', async () => {
		let current = true
		scheduleCapture({ fileId: 1, extension: 'glb', object3D: model, statuses: statusPromise(status()), isCurrent: () => current })
		current = false
		await flush()

		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('waits for the delay before capturing', async () => {
		scheduleCapture({ fileId: 5, extension: 'glb', object3D: model, statuses: statusPromise(status()), isCurrent: () => true })

		await jest.advanceTimersByTimeAsync(499)
		expect(renderThumbnail).not.toHaveBeenCalled()

		await jest.advanceTimersByTimeAsync(1)
		expect(renderThumbnail).toHaveBeenCalledTimes(1)
	})

	test('a load that used a cached companion is not captured', async () => {
		const sourceFiles = [{ name: 'chair.obj' }, { name: 'chair.mtl', _fromCache: true }]
		scheduleCapture({ fileId: 5, extension: 'obj', object3D: model, statuses: statusPromise(status()), isCurrent: () => true, sourceFiles })
		await flush()

		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('a load from fresh files is captured', async () => {
		const sourceFiles = [{ name: 'chair.obj' }, { name: 'chair.mtl' }]
		scheduleCapture({ fileId: 5, extension: 'obj', object3D: model, statuses: statusPromise(status()), isCurrent: () => true, sourceFiles })
		await flush()

		expect(uploadThumbnail).toHaveBeenCalledTimes(1)
	})

	test('does nothing without a status promise', async () => {
		scheduleCapture({ fileId: 5, extension: 'glb', object3D: model, statuses: null, isCurrent: () => true })
		await flush()

		expect(renderThumbnail).not.toHaveBeenCalled()
	})
})
