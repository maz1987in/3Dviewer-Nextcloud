/**
 * The main-thread side of the print-check worker: one worker per call, progress passed
 * on, and a cancelled call ends its worker and rejects as an AbortError.
 */
import { checkClosed, measureThickness } from '../../../src/printCheck/printCheckClient.js'
import { createPrintCheckWorker } from '../../../src/printCheck/createPrintCheckWorker.js'

jest.mock('../../../src/printCheck/createPrintCheckWorker.js', () => ({ createPrintCheckWorker: jest.fn() }))

/** A worker that answers each message with what `reply` returns, as messages. */
function fakeWorker(reply) {
	const worker = {
		terminated: false,
		posted: [],
		onmessage: null,
		onerror: null,
		postMessage(message, transfer) {
			worker.posted.push({ message, transfer })
			for (const answer of reply(message)) {
				setTimeout(() => worker.onmessage?.({ data: { id: message.id, ...answer } }), 0)
			}
		},
		terminate() { worker.terminated = true },
	}
	return worker
}

const PART = { positions: new Float32Array(9), index: null, normals: null }

beforeEach(() => jest.clearAllMocks())

test('checkClosed sends the parts and resolves with the reports', async () => {
	const worker = fakeWorker(() => [{ type: 'result', result: [{ closed: true, boundaryEdges: 0, nonManifoldEdges: 0 }] }])
	createPrintCheckWorker.mockReturnValue(worker)

	await expect(checkClosed([PART])).resolves.toEqual([{ closed: true, boundaryEdges: 0, nonManifoldEdges: 0 }])
	expect(worker.posted[0].message.type).toBe('closed')
	expect(worker.terminated).toBe(true)
})

test('the parts are copied, so the live model keeps its buffers', async () => {
	const worker = fakeWorker(() => [{ type: 'result', result: [] }])
	createPrintCheckWorker.mockReturnValue(worker)
	const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])

	await checkClosed([{ positions, index: null }])

	const sent = worker.posted[0].message.parts[0].positions
	expect(sent).not.toBe(positions)
	expect([...sent]).toEqual([...positions])
	expect(positions.length).toBe(9)
})

test('progress reaches the caller', async () => {
	const worker = fakeWorker(() => [
		{ type: 'progress', done: 1, total: 2 },
		{ type: 'progress', done: 2, total: 2 },
		{ type: 'result', result: [{ thickness: new Float32Array(3), triangleThickness: new Float32Array(1), sampled: false }] },
	])
	createPrintCheckWorker.mockReturnValue(worker)
	const progress = []

	await measureThickness([PART], { budget: 10, onProgress: (done, total) => progress.push([done, total]) })

	expect(progress).toEqual([[1, 2], [2, 2]])
	expect(worker.posted[0].message).toMatchObject({ type: 'thickness', budget: 10 })
})

test('abort terminates the worker and rejects with AbortError', async () => {
	const worker = fakeWorker(() => [])
	createPrintCheckWorker.mockReturnValue(worker)
	const controller = new AbortController()

	const running = measureThickness([PART], { signal: controller.signal })
	controller.abort()

	await expect(running).rejects.toMatchObject({ name: 'AbortError' })
	expect(worker.terminated).toBe(true)
})

test('an already aborted signal never starts a worker', async () => {
	const controller = new AbortController()
	controller.abort()
	await expect(checkClosed([PART], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
	expect(createPrintCheckWorker).not.toHaveBeenCalled()
})

test('worker error rejects with its message', async () => {
	const worker = fakeWorker(() => [{ type: 'error', message: 'out of memory' }])
	createPrintCheckWorker.mockReturnValue(worker)
	await expect(checkClosed([PART])).rejects.toThrow('out of memory')
	expect(worker.terminated).toBe(true)
})
