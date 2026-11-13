/**
 * The main-thread side of the print-check worker: one worker per thickness check, progress
 * passed on, and a cancelled call ends its worker and rejects as an AbortError; one worker
 * per open Print check for everything else, sent the model once.
 */
import { measureThickness, openSurfaceSession } from '../../../src/printCheck/printCheckClient.js'
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

test('the parts are copied, so the live model keeps its buffers', async () => {
	const worker = fakeWorker(() => [{ type: 'result', result: [] }])
	createPrintCheckWorker.mockReturnValue(worker)
	const positions = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9])

	await measureThickness([{ positions, index: null }])

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
	await expect(measureThickness([PART], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
	expect(createPrintCheckWorker).not.toHaveBeenCalled()
})

test('worker error rejects with its message', async () => {
	const worker = fakeWorker(() => [{ type: 'error', message: 'out of memory' }])
	createPrintCheckWorker.mockReturnValue(worker)
	await expect(measureThickness([PART])).rejects.toThrow('out of memory')
	expect(worker.terminated).toBe(true)
})

describe('a surface session', () => {
	const MEASURED = { extent: { min: [0, 0, 0], max: [1, 1, 1] }, overhangArea: 0, totalArea: 6, volume: 1, area: 6 }
	const answers = (message) => {
		if (message.type === 'load') {
			return [{ type: 'result', result: true }]
		}
		if (message.type === 'measure') {
			return [{ type: 'result', result: MEASURED }]
		}
		return [{ type: 'result', result: [{ closed: true, boundaryEdges: 0, nonManifoldEdges: 0 }] }]
	}

	test('sends the model once, transferred, and answers every request on it in one worker', async () => {
		const worker = fakeWorker(answers)
		createPrintCheckWorker.mockReturnValue(worker)
		const part = { positions: new Float32Array(9), index: new Uint32Array([0, 1, 2]), surface: true }

		const session = openSurfaceSession([part])
		const request = { matrices: [new Float64Array(16)], axes: { up: [0, 1, 0], width: [1, 0, 0], depth: [0, 0, 1] }, thresholdDeg: 45, bedEpsilon: 0.05 }
		await expect(session.measure(request)).resolves.toEqual(MEASURED)
		await expect(session.measure({ ...request, thresholdDeg: 60 })).resolves.toEqual(MEASURED)
		await expect(session.checkClosed()).resolves.toEqual([{ closed: true, boundaryEdges: 0, nonManifoldEdges: 0 }])

		expect(createPrintCheckWorker).toHaveBeenCalledTimes(1)
		expect(worker.posted.map(({ message }) => message.type)).toEqual(['load', 'measure', 'measure', 'closed'])
		expect(worker.posted[0].message.parts[0]).toBe(part)
		expect(worker.posted[0].transfer).toEqual([part.positions.buffer, part.index.buffer])
		expect(worker.posted[2].message.thresholdDeg).toBe(60)
		expect(worker.terminated).toBe(false)
		session.close()
		expect(worker.terminated).toBe(true)
	})

	test('closing ends the worker, and a request still waiting rejects as an AbortError', async () => {
		const worker = fakeWorker((message) => (message.type === 'load' ? answers(message) : []))
		createPrintCheckWorker.mockReturnValue(worker)
		const session = openSurfaceSession([{ positions: new Float32Array(9), index: null, surface: true }])

		const waiting = session.checkClosed()
		session.close()

		await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
		await expect(session.measure({})).rejects.toMatchObject({ name: 'AbortError' })
		expect(worker.terminated).toBe(true)
	})

	test('a worker that fails rejects what is waiting with its message', async () => {
		const worker = fakeWorker((message) => (message.type === 'measure' ? [{ type: 'error', message: 'out of memory' }] : answers(message)))
		createPrintCheckWorker.mockReturnValue(worker)
		const session = openSurfaceSession([{ positions: new Float32Array(9), index: null, surface: true }])

		await expect(session.measure({})).rejects.toThrow('out of memory')
		await expect(session.checkClosed()).resolves.toHaveLength(1)
		session.close()
	})
})
