import { captureForCurrentVersion, startStatusFetch } from '../../../src/thumbnails/captureFromViewer.js'
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
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status({ canEdit: false })),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('skips when a thumbnail exists for this version', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status({ hasThumbnail: true })),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('skips a file the status does not list', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(null),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('renders and uploads with the status etag', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'GLB', object3D: model, statusPromise: statusPromise(status()),
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
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status()),
		})

		expect(result).toBe('exists')
	})

	test.each(['stale', 'forbidden', 'error'])('treats an upload result of %s as skipped', async (outcome) => {
		uploadThumbnail.mockResolvedValue(outcome)

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status()),
		})

		expect(result).toBe('skipped')
	})

	test('skips non-model extensions without a request', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'mtl', object3D: model, statusPromise: statusPromise(status()),
		})

		expect(result).toBe('skipped')
		expect(fetchStatus).not.toHaveBeenCalled()
		expect(renderThumbnail).not.toHaveBeenCalled()
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('uses the status fetched before the download, never re-fetching', async () => {
		// The etag must be the one from before the bytes were downloaded: a model edited
		// meanwhile must not get an old render stored under its new version
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status({ etag: 'before-download' })),
		})

		expect(result).toBe('stored')
		expect(fetchStatus).not.toHaveBeenCalled()
		expect(uploadThumbnail).toHaveBeenCalledWith(5, 'before-download', PNG)
	})

	test('a rejected status fetch is skipped, not thrown', async () => {
		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: Promise.reject(new Error('401')),
		})

		expect(result).toBe('skipped')
		expect(renderThumbnail).not.toHaveBeenCalled()
	})

	test('an empty model is skipped without an upload', async () => {
		renderThumbnail.mockRejectedValue(new EmptyModelError())

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status()),
		})

		expect(result).toBe('skipped')
		expect(uploadThumbnail).not.toHaveBeenCalled()
	})

	test('a failed render is skipped, not thrown', async () => {
		renderThumbnail.mockRejectedValue(new Error('context lost'))

		const result = await captureForCurrentVersion({
			fileId: 5, extension: 'glb', object3D: model, statusPromise: statusPromise(status()),
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
