/**
 * Reading a scan in its own worker: the result, the errors as the viewer tells them
 * apart, and Cancel loading ending the worker.
 */
import { createPointCloudWorker } from '../../../src/pointclouds/createPointCloudWorker.js'
import { parsePointCloud } from '../../../src/pointclouds/parsePointCloud.js'
import { NotAScanError, ScanError } from '../../../src/pointclouds/scanFormats.js'

jest.mock('../../../src/pointclouds/createPointCloudWorker.js', () => ({ createPointCloudWorker: jest.fn() }))

/** A worker double that answers the first message with the given replies. */
function fakeWorker(replies) {
	const worker = {
		posted: null,
		terminate: jest.fn(),
		postMessage(message) {
			this.posted = message
			queueMicrotask(() => replies.forEach((data) => this.onmessage?.({ data })))
		},
	}
	createPointCloudWorker.mockReturnValue(worker)
	return worker
}

const RESULT = { sink: { count: 1 }, unit: null, format: 'xyz' }

beforeEach(() => createPointCloudWorker.mockReset())

test('sends the blob, extension and budget, reports progress and resolves with the result', async () => {
	const worker = fakeWorker([{ type: 'progress', fraction: 0.5 }, { type: 'done', result: RESULT }])
	const blob = new Blob(['1 2 3'])
	const progress = []

	const result = await parsePointCloud(blob, 'xyz', { budget: 42, onProgress: (f) => progress.push(f) })

	expect(result).toEqual(RESULT)
	expect(worker.posted).toMatchObject({ blob, ext: 'xyz', budget: 42 })
	expect(typeof worker.posted.appWebRoot).toBe('string')
	expect(progress).toEqual([0.5])
	expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test('error kinds become the errors the viewer tells apart', async () => {
	fakeWorker([{ type: 'error', kind: 'not-a-scan', message: 'atoms' }])
	await expect(parsePointCloud(new Blob(['']), 'xyz', { budget: 1 })).rejects.toBeInstanceOf(NotAScanError)

	fakeWorker([{ type: 'error', kind: 'scan', message: 'LAZ point format 4 isn\'t supported' }])
	const scan = parsePointCloud(new Blob(['']), 'laz', { budget: 1 })
	await expect(scan).rejects.toBeInstanceOf(ScanError)
	await expect(scan).rejects.toThrow('LAZ point format 4 isn\'t supported')

	fakeWorker([{ type: 'error', kind: 'other', message: 'out of memory' }])
	await expect(parsePointCloud(new Blob(['']), 'xyz', { budget: 1 })).rejects.toThrow('out of memory')
})

test('abort terminates the worker', async () => {
	const worker = fakeWorker([])
	const controller = new AbortController()

	const parsing = parsePointCloud(new Blob(['']), 'xyz', { budget: 1, signal: controller.signal })
	// Part way through the read: once the worker is reading
	while (!createPointCloudWorker.mock.calls.length) {
		await Promise.resolve()
	}
	controller.abort()

	await expect(parsing).rejects.toMatchObject({ name: 'AbortError' })
	expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test('a signal aborted before the start starts no worker', async () => {
	const controller = new AbortController()
	controller.abort()

	await expect(parsePointCloud(new Blob(['']), 'xyz', { budget: 1, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
	expect(createPointCloudWorker).not.toHaveBeenCalled()
})

test('a worker that fails outright rejects', async () => {
	const worker = fakeWorker([])
	worker.postMessage = function() {
		queueMicrotask(() => this.onerror?.({ message: 'script error' }))
	}

	await expect(parsePointCloud(new Blob(['']), 'xyz', { budget: 1 })).rejects.toThrow('script error')
	expect(worker.terminate).toHaveBeenCalled()
})
